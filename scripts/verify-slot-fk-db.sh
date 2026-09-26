#!/usr/bin/env bash
# FK reservations.availability_slot_id: de ON DELETE CASCADE (confirmado en la
# base real) a RESTRICT con migrations/013. Postgres aislado en Docker,
# contenedor desechable. No toca Supabase.
#
#   B. Antes de la 013 (esquema desplegado, CASCADE): borrar una ventana se
#      lleva su historial y, en carrera, una reserva viva recién confirmada.
#   M. La 013 sobre lo desplegado: mismos datos (huella de todas las filas),
#      mismo nombre y ON UPDATE, RESTRICT; idempotente. Sobre una base
#      creada desde migrations/001 (SET NULL) también.
#   P. Después: borrar ventanas con reserva viva / cancelada → 23503; sin
#      reservas → se borra. Lo que hace la purga (lote que falla entero → una
#      a una). Carreras: purga contra clase puntual que reutiliza la ventana
#      (en los dos órdenes, con commit y rollback), reserva de la web contra
#      el borrado, cancelación.
#
#   bash scripts/verify-slot-fk-db.sh
set -uo pipefail
cd "$(dirname "$0")/.."

NAME="verify-slot-fk-db-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test postgres:16-alpine >/dev/null || exit 1
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do
  docker exec "$NAME" psql -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done

fail=0
pass() { echo "ok   - $1"; }
bad() { echo "FAIL - $1"; fail=1; }
q() { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -qtA -c "$2" 2>&1; }
run() { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q 2>&1; }
check() { if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else bad "$1: esperado «$2», obtenido «$3»"; fi; }
checkre() { if [[ "$3" =~ $2 ]]; then pass "$1"; else bad "$1: no casa /$2/ con «$3»"; fi; }

T=11111111-1111-4111-8111-111111111111
W_LIVE=00000000-0000-4000-8000-000000000001
W_CANC=00000000-0000-4000-8000-000000000002
W_EMPTY=00000000-0000-4000-8000-000000000003
W_OPEN=00000000-0000-4000-8000-000000000004
W_REUSE=00000000-0000-4000-8000-000000000005
W_REUSE2=00000000-0000-4000-8000-000000000006
W_REUSE3=00000000-0000-4000-8000-000000000007
W_E2=00000000-0000-4000-8000-000000000008
W_E3=00000000-0000-4000-8000-000000000009
W_OPEN2=00000000-0000-4000-8000-00000000000a
D=2099-05-04

deployed() { # deployed <db>: esquema desplegado (CASCADE) + 008, 011, 012 y datos de prueba
  q postgres "create database $1" >/dev/null
  run "$1" < scripts/db/deployed-schema.sql >/dev/null
  for f in migrations/008_reservations_no_overlap.sql migrations/011_schema_compat.sql migrations/012_one_off_reservation.sql; do
    out=$(run "$1" < "$f") || { bad "$1: $f: $out"; return 1; }
  done
  run "$1" >/dev/null <<SQL
insert into trainers (id, slug) values ('$T', 't');
insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values
  ('$W_LIVE',   '$T', '$D', '08:00', '09:00', 'available', true),
  ('$W_CANC',   '$T', '$D', '09:00', '10:00', 'available', true),
  ('$W_EMPTY',  '$T', '$D', '10:00', '11:00', 'available', true),
  ('$W_OPEN',   '$T', '$D', '11:00', '13:00', 'available', true),
  ('$W_REUSE',  '$T', '$D', '14:00', '15:00', 'blocked', false),
  ('$W_REUSE2', '$T', '$D', '15:00', '16:00', 'blocked', false),
  ('$W_REUSE3', '$T', '$D', '16:00', '17:00', 'blocked', false),
  ('$W_E2',     '$T', '$D', '17:00', '18:00', 'available', true),
  ('$W_E3',     '$T', '$D', '18:00', '19:00', 'available', true),
  ('$W_OPEN2',  '$T', '$D', '19:00', '21:00', 'available', true);
insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values
  ('$W_LIVE', '$T', 'Viva',      'v@x', 'confirmed', '08:00', '09:00'),
  ('$W_CANC', '$T', 'Cancelada', 'c@x', 'cancelled', '09:00', '10:00');
SQL
}
fkdef() { q "$1" "select conname || ' ' || pg_get_constraintdef(oid) from pg_constraint where conrelid = 'reservations'::regclass and confrelid = 'availability_slots'::regclass"; }
# Huella de TODAS las filas de las dos tablas (para ver que la 013 no toca datos)
footprint() { q "$1" "select md5(coalesce((select string_agg(r::text, '|' order by r.id) from reservations r), '') || '#' || coalesce((select string_agg(s::text, '|' order by s.id) from availability_slots s), ''))"; }
res() { q "$1" "select count(*) from reservations where client_name = '$2'"; }
slots() { q "$1" "select count(*) from availability_slots where id = '$2'"; }

# hold <db> <sql> <commit|rollback>: SQL con la transacción abierta 2 s (en segundo plano)
hold() {
  docker exec -i "$NAME" psql -U postgres -d "$1" -qtA >/dev/null 2>&1 <<SQL &
begin;
$2;
select pg_sleep(2);
$3;
SQL
  sleep 0.7
}
oneoff() { # oneoff <db> <ini> <fin> <quien>
  q "$1" "select case when r.window_reused then 'reused' else 'new' end from create_one_off_reservation('$T', '$D', '$2', '$3', (extract(epoch from '$3'::time - '$2'::time) / 60)::int, '$4', 'x@x', null, null, 300, 'confirmed') r"
}

# ─── B. Antes de la 013: el riesgo ───────────────────────────────────────────
deployed before
check "B0 esquema desplegado: la FK es CASCADE" "reservations_availability_slot_id_fkey FOREIGN KEY (availability_slot_id) REFERENCES availability_slots(id) ON DELETE CASCADE" "$(fkdef before)"
q before "delete from availability_slots where id = '$W_CANC'" >/dev/null
check "B1 con CASCADE, borrar una ventana con reserva cancelada borra el historial" "0" "$(res before Cancelada)"
hold before "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$W_OPEN', '$T', 'Web', 'w@x', 'pending_confirmation', '11:00', '12:00')" commit
q before "delete from availability_slots where id = '$W_OPEN'" >/dev/null; wait
check "B2 con CASCADE, una reserva viva que entra mientras se borra la ventana desaparece" "0" "$(res before Web)"

# ─── M. La 013 ───────────────────────────────────────────────────────────────
DB=dep
deployed $DB
fp=$(footprint $DB)
out=$(run $DB < migrations/013_reservations_slot_fk_restrict.sql); rc=$?
check "M1 la 013 se aplica sobre lo desplegado" "0" "$rc"
checkre "M1 avisa del cambio CASCADE → RESTRICT" "pasa de ON DELETE CASCADE a RESTRICT" "$out"
check "M2 misma FK (nombre, columnas), ahora RESTRICT" "reservations_availability_slot_id_fkey FOREIGN KEY (availability_slot_id) REFERENCES availability_slots(id) ON DELETE RESTRICT" "$(fkdef $DB)"
check "M2 validada" "t" "$(q $DB "select convalidated from pg_constraint where conname = 'reservations_availability_slot_id_fkey'")"
check "M3 no toca ningún dato (huella de todas las filas)" "$fp" "$(footprint $DB)"
out=$(run $DB < migrations/013_reservations_slot_fk_restrict.sql); rc=$?
checkre "M4 idempotente: la segunda vez no hace nada" "ya es ON DELETE RESTRICT" "$out"
check "M4 y sigue igual" "$fp" "$(footprint $DB)"

q postgres "create database fresh" >/dev/null
run fresh < scripts/db/supabase-stubs.sql >/dev/null
for f in migrations/0*.sql; do out=$(run fresh < "$f") || { bad "fresh: $f: $out"; break; }; done
check "M5 cadena 001 → 013 desde cero: la FK (SET NULL en la 001) acaba RESTRICT" "r" \
  "$(q fresh "select confdeltype from pg_constraint where conrelid = 'reservations'::regclass and confrelid = 'availability_slots'::regclass")"

q postgres "create database onupdate" >/dev/null
run onupdate < scripts/db/deployed-schema.sql >/dev/null
q onupdate "alter table reservations drop constraint reservations_availability_slot_id_fkey; alter table reservations add constraint reservations_availability_slot_id_fkey foreign key (availability_slot_id) references availability_slots (id) on update cascade on delete cascade" >/dev/null
run onupdate < migrations/013_reservations_slot_fk_restrict.sql >/dev/null
checkre "M6 conserva la acción ON UPDATE que tuviera" "ON UPDATE CASCADE ON DELETE RESTRICT" "$(fkdef onupdate)"

# ─── P. Después de la 013 ────────────────────────────────────────────────────
checkre "P1 borrar una ventana con reserva viva → 23503" "violates foreign key constraint" "$(q $DB "delete from availability_slots where id = '$W_LIVE'")"
checkre "P1 con reserva cancelada (historial) → 23503" "violates foreign key constraint" "$(q $DB "delete from availability_slots where id = '$W_CANC'")"
check "P1 las dos reservas siguen" "1/1" "$(res $DB Viva)/$(res $DB Cancelada)"
q $DB "delete from availability_slots where id = '$W_EMPTY'" >/dev/null
check "P2 una ventana sin reservas se borra" "0" "$(slots $DB $W_EMPTY)"

# Lo que hace deleteEmptyWindows: lote → si falla por la FK, una a una.
checkre "P3 lote con una ventana con historial: falla entero" "violates foreign key constraint" \
  "$(q $DB "delete from availability_slots where id in ('$W_E2', '$W_CANC', '$W_E3')")"
check "P3 y no borra nada del lote" "1/1/1" "$(slots $DB $W_E2)/$(slots $DB $W_CANC)/$(slots $DB $W_E3)"
for id in $W_E2 $W_CANC $W_E3; do q $DB "delete from availability_slots where id = '$id'" >/dev/null; done
check "P3 una a una: las vacías se borran, la del historial se queda con su reserva" "0/1/0/1" \
  "$(slots $DB $W_E2)/$(slots $DB $W_CANC)/$(slots $DB $W_E3)/$(res $DB Cancelada)"

# Purga contra clase puntual que reutiliza la ventana.
hold $DB "select create_one_off_reservation('$T', '$D', '14:00', '15:00', 60, 'Puntual', 'p@x', null, null, 300, 'confirmed')" commit
r=$(q $DB "delete from availability_slots where id = '$W_REUSE'"); wait
checkre "P4 purga mientras una puntual reutiliza la ventana: espera y la base la rechaza" "violates foreign key constraint" "$r"
check "P4 la ventana y la reserva puntual siguen" "1/1" "$(slots $DB $W_REUSE)/$(res $DB Puntual)"

hold $DB "delete from availability_slots where id = '$W_REUSE2'" commit
r=$(oneoff $DB 15:00 16:00 Puntual2); wait
check "P5 la purga borra primero (confirma): la puntual espera y crea su propia ventana" "new" "$r"
check "P5 la reserva tiene ventana y fecha" "1|$D" "$(res $DB Puntual2)|$(q $DB "select session_date from reservations where client_name = 'Puntual2'")"

hold $DB "delete from availability_slots where id = '$W_REUSE3'" rollback
r=$(oneoff $DB 16:00 17:00 Puntual3); wait
check "P6 la purga se deshace: la puntual reutiliza la ventana" "reused" "$r"

# Reserva de la web que entra mientras el generador borra la ventana (antes, B2: se perdía).
hold $DB "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$W_OPEN2', '$T', 'Web2', 'w@x', 'pending_confirmation', '19:00', '20:00')" commit
r=$(q $DB "delete from availability_slots where id = '$W_OPEN2'"); wait
checkre "P8 reserva de la web confirmada durante el borrado: la base lo rechaza" "violates foreign key constraint" "$r"
check "P8 la reserva sigue viva" "1" "$(q $DB "select count(*) from reservations where client_name = 'Web2' and status = 'pending_confirmation'")"

# Cancelación: la reserva cancelada sigue siendo historial y bloquea el borrado.
q $DB "update reservations set status = 'cancelled' where client_name = 'Viva'" >/dev/null
checkre "P9 cancelada la reserva, la ventana sigue sin poder borrarse" "violates foreign key constraint" "$(q $DB "delete from availability_slots where id = '$W_LIVE'")"
hold $DB "update reservations set status = 'cancelled' where client_name = 'Puntual'" commit
r=$(q $DB "delete from availability_slots where id = '$W_REUSE'"); wait
checkre "P9 cancelación en curso + borrado: también 23503" "violates foreign key constraint" "$r"
check "P9 ninguna reserva perdida" "1/1/1/1/1/1" \
  "$(res $DB Viva)/$(res $DB Cancelada)/$(res $DB Puntual)/$(res $DB Puntual2)/$(res $DB Puntual3)/$(res $DB Web2)"

# Un script que borra antes las reservas y luego la ventana (verify-max-capacity-fix) sigue pudiendo.
q $DB "delete from reservations where client_name = 'Web2'" >/dev/null
q $DB "delete from availability_slots where id = '$W_OPEN2'" >/dev/null
check "P10 borrando antes sus reservas, la ventana se puede borrar" "0" "$(slots $DB $W_OPEN2)"

exit $fail
