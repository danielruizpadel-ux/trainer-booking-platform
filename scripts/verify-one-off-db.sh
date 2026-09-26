#!/usr/bin/env bash
# Clase puntual en la BASE, en un Postgres aislado (Docker, contenedor
# desechable). No toca Supabase ni ningún .env.
#
#   M. Migraciones: la cadena ENTERA 001 → 012 en una base vacía (con
#      scripts/db/supabase-stubs.sql: roles, auth, extensions). La 011 hace
#      que la base de la 001 acepte lo que escribe el flujo; sobre la forma
#      desplegada (scripts/db/deployed-schema.sql) no cambia nada. La 012 se
#      niega sin la 011. La 008 sigue intacta y además una ventana con
#      reservas ya no se puede borrar dejándolas sin fecha.
#   F. Función: ventana exacta blocked/manual + reserva; solape; reutiliza la
#      de una puntual cancelada; conflictos; datos no válidos; permisos.
#   A. Fallo al crear la reserva DESPUÉS de crear la ventana: no queda nada.
#   R. Concurrencia (determinista: la primera transacción se queda abierta
#      con pg_sleep mientras llega la segunda): misma franja commit/rollback,
#      reutilización simultánea, reutilización contra cancelación,
#      reutilización contra un borrado concurrente de la ventana (lo que
#      antes era la limpieza), franjas solapadas, reserva de la web sin
#      cerrojo, y ráfagas de 10 en paralelo.
#
#   bash scripts/verify-one-off-db.sh
set -uo pipefail
cd "$(dirname "$0")/.."

NAME="verify-one-off-db-$$"
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

# chain <db> <última>: base vacía + stubs + migraciones 001..<última>
chain() {
  q postgres "create database $1" >/dev/null
  run "$1" < scripts/db/supabase-stubs.sql >/dev/null || { bad "stubs en $1"; return 1; }
  for f in migrations/0*.sql; do
    n=$(basename "$f" | cut -c1-3)
    [[ "$n" > "$2" ]] && break
    out=$(run "$1" < "$f") || { bad "$1: $f no se aplica: $out"; return 1; }
  done
}
# snapshot <db>: restricciones e índices de las dos tablas + trigger de la 008
snapshot() {
  q "$1" "select string_agg(x, E'\n' order by x) from (
            select conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid) as x from pg_constraint
             where conrelid in ('public.availability_slots'::regclass, 'public.reservations'::regclass)
            union all select indexdef from pg_indexes where tablename in ('availability_slots', 'reservations')
            union all select tgname from pg_trigger where tgname = 'reservations_set_session_date'
            union all select table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
                        from information_schema.columns where table_schema = 'public' and table_name in ('availability_slots', 'reservations')) s"
}

# ─── M. Migraciones ──────────────────────────────────────────────────────────
chain upto010 010
checkre "M1 sin la 011, la 012 se niega sobre la base de la 001" "012 requiere" \
  "$(run upto010 < migrations/012_one_off_reservation.sql)"

DB=fresh
chain $DB 012 && pass "M2 cadena 001 → 012 completa en una base vacía"
before=$(snapshot $DB); run $DB < migrations/011_schema_compat.sql >/dev/null; run $DB < migrations/012_one_off_reservation.sql >/dev/null
check "M2 011 y 012 son idempotentes (segunda pasada sin cambios)" "$before" "$(snapshot $DB)"
check "M3 la 008 sigue igual: exclusión con los mismos estados vivos" \
  "EXCLUDE USING gist (trainer_id WITH =, tsrange((session_date + start_time), (session_date + end_time), '[)'::text) WITH &&) WHERE (((session_date IS NOT NULL) AND (start_time IS NOT NULL) AND (end_time IS NOT NULL) AND (COALESCE(status, ''::text) <> ALL (ARRAY['cancelled'::text, 'canceled'::text, 'needs_reschedule'::text]))))" \
  "$(q $DB "select pg_get_constraintdef(oid) from pg_constraint where conname = 'reservations_no_overlap'")"
check "M3 availability_slot_id NOT NULL; class_type → class_types; unique por rango" "NO|1|1" \
  "$(q $DB "select is_nullable from information_schema.columns where table_name = 'reservations' and column_name = 'availability_slot_id'")|$(q $DB "select count(*) from pg_constraint where conname = 'availability_slots_class_type_fkey'")|$(q $DB "select count(*) from pg_constraint where conname = 'availability_slots_trainer_id_session_date_start_time_end_t_key'")"

q postgres "create database deployed" >/dev/null
run deployed < scripts/db/deployed-schema.sql >/dev/null
run deployed < migrations/008_reservations_no_overlap.sql >/dev/null
before=$(snapshot deployed)
out=$(run deployed < migrations/011_schema_compat.sql); rc=$?
check "M4 sobre la forma desplegada la 011 se aplica sin cambiar nada" "0|same" "$rc|$([[ "$(snapshot deployed)" == "$before" ]] && echo same || echo changed)"
out=$(run deployed < migrations/012_one_off_reservation.sql); [[ $? -eq 0 ]] && pass "M4 y la 012 también" || bad "M4 012: $out"

chain orphan 010
q orphan "insert into trainers (id, name) values ('11111111-1111-4111-8111-111111111111', 'T');
          insert into clients (id, phone) values ('00000000-0000-4000-8000-0000000000cc', '1');
          set session_replication_role = replica;
          insert into reservations (trainer_id, client_id, session_date, session_time, class_type, status, start_time, end_time)
          values ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000cc', '2099-01-01', '09:00', 'group', 'confirmed', '09:00', '10:00')" >/dev/null
check "M5 dato heredado de la 001: reserva sin ventana" "1" "$(q orphan "select count(*) from reservations where availability_slot_id is null")"
checkre "M5 la 011 se niega a seguir con reservas sin ventana (no inventa ni borra)" "hay reservas sin ventana" "$(run orphan < migrations/011_schema_compat.sql)"
check "M5 y no deja nada a medias (el CHECK de class_type de la 001 sigue)" "1" \
  "$(q orphan "select count(*) from pg_constraint where conname = 'availability_slots_class_type_check'")"

T=11111111-1111-4111-8111-111111111111
q $DB "insert into trainers (id, name) values ('$T', 'T')" >/dev/null
q $DB "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values ('00000000-0000-4000-8000-00000000000a', '$T', '2099-01-05', '09:00', '13:00', 'available', true)" >/dev/null
out=$(q $DB "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('00000000-0000-4000-8000-00000000000a', '$T', 'Base', 'b@x', 'confirmed', '10:00', '11:00') returning session_date")
check "M6 reserva como la escribe la app hoy (sin columnas de la 001), fecha por el trigger" "2099-01-05" "$out"
checkre "M6 borrar una ventana con reservas ya no las deja sin fecha: falla" "violates not-null constraint|violates foreign key" \
  "$(q $DB "delete from availability_slots where id = '00000000-0000-4000-8000-00000000000a'")"
checkre "M6 la 008 sigue frenando el solape en la base nueva" "reservations_no_overlap" \
  "$(q $DB "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('00000000-0000-4000-8000-00000000000a', '$T', 'Otro', 'o@x', 'pending_confirmation', '10:30', '11:30')")"

# ─── Envoltorio: 'ok <reutilizada>' o '<sqlstate> <mensaje>' + tiempo esperado
run $DB >/dev/null <<SQL
create function try_one_off(d date, s time, e time, who text, st text default 'confirmed') returns text
language plpgsql as \$\$
declare t0 timestamptz := clock_timestamp(); r record;
begin
  select * into r from create_one_off_reservation('$T', d, s, e, (extract(epoch from e - s) / 60)::int, who, who || '@x', null, null, 300, st);
  return 'ok ' || r.window_reused || ' waited_ms=' || (extract(epoch from clock_timestamp() - t0) * 1000)::int;
exception when others then
  return sqlstate || ' ' || sqlerrm || ' waited_ms=' || (extract(epoch from clock_timestamp() - t0) * 1000)::int;
end \$\$;
SQL
strip() { sed -E 's/ waited_ms=[0-9]+//'; }
try() { q $DB "select try_one_off('$1', '$2', '$3', '$4'${5:+, '$5'})" | strip; }
waited() { sed -nE 's/.*waited_ms=([0-9]+).*/\1/p' <<<"$1"; }
windows() { q $DB "select count(*) from availability_slots where trainer_id = '$T' and session_date = '$1' and start_time = '$2' and end_time = '$3'"; }
live() { q $DB "select count(*) from reservations where trainer_id = '$T' and session_date = '$1' and coalesce(status,'') not in ('cancelled','canceled','needs_reschedule')"; }

# ─── F. Función ──────────────────────────────────────────────────────────────
D=2099-01-05
check "F1 fuera del horario: crea ventana + reserva" "ok false" "$(try $D 18:00 19:00 Ana)"
check "F1 ventana exacta, blocked, manual, private, 1 reserva" "blocked|f|private|1" \
  "$(q $DB "select status, generated_by_pattern, class_type, current_bookings from availability_slots where session_date = '$D' and start_time = '18:00'")"
check "F1 reserva: fecha por el trigger, 1 jugador, sin WhatsApp, 60 min, confirmada" "$D|1|f|60|confirmed" \
  "$(q $DB "select session_date, player_count, whatsapp_opt_in, duration_minutes, status from reservations where client_name = 'Ana'")"
checkre "F2 misma franja otra vez → 23P01" "^23P01 .*reservations_no_overlap" "$(try $D 18:00 19:00 Eva)"
checkre "F2 pisa la reserva de la ventana abierta → 23P01" "^23P01" "$(try $D 10:30 11:30 Eva)"
check "F2 sin ventanas de más" "1" "$(windows $D 18:00 19:00)"
q $DB "update reservations set status = 'cancelled' where client_name = 'Ana'" >/dev/null
check "F3 cancelada: la misma clase reutiliza su ventana blocked" "ok true" "$(try $D 18:00 19:00 Ana2)"
check "F3 sigue habiendo una sola ventana" "1" "$(windows $D 18:00 19:00)"
q $DB "insert into availability_slots (trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values ('$T', '$D', '14:00', '15:00', 'available', true)" >/dev/null
checkre "F4 rango exacto de una ventana del horario → conflicto" "^P0001 one_off_window_conflict" "$(try $D 14:00 15:00 Leo)"
q $DB "insert into availability_slots (trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values ('$T', '$D', '16:00', '17:00', 'blocked', true)" >/dev/null
checkre "F4 rango exacto de una ventana blocked del generador → conflicto" "^P0001 one_off_window_conflict" "$(try $D 16:00 17:00 Leo)"
checkre "F5 estado no permitido" "^22023 one_off_invalid_status" "$(try $D 20:00 21:00 Leo cancelled)"
checkre "F5 duración que no cuadra con el rango" "one_off_invalid_range" \
  "$(q $DB "select create_one_off_reservation('$T','$D','20:00','21:00',90,'x','x@x',null,null,1,'confirmed')")"
checkre "F5 duración que la 007 no admite (45 min)" "reservations_duration_check" "$(try $D 20:00 20:45 Leo)"
check "F5 nada creado a las 20:00" "0|0" "$(windows $D 20:00 21:00)|$(windows $D 20:00 20:45)"
checkre "F6 anon no puede ejecutarla" "permission denied for function" \
  "$(q $DB "set role anon; select create_one_off_reservation('$T','$D','20:00','21:00',60,'x','x@x',null,null,1,'confirmed')")"
checkre "F6 authenticated tampoco" "permission denied for function" \
  "$(q $DB "set role authenticated; select create_one_off_reservation('$T','$D','20:00','21:00',60,'x','x@x',null,null,1,'confirmed')")"
checkre "F6 service_role sí" "^[0-9a-f-]{36}," \
  "$(q $DB "set role service_role; select reservation_id || ',' from create_one_off_reservation('$T','$D','20:00','21:00',60,'Svc','s@x',null,null,1,'confirmed')")"

# ─── A. Fallo al crear la reserva ────────────────────────────────────────────
checkre "A1 la reserva falla tras crear la ventana (client_name NULL)" "violates not-null constraint" \
  "$(q $DB "select create_one_off_reservation('$T','$D','21:00','22:00',60,null,'x@x',null,null,1,'confirmed')")"
check "A1 no queda ninguna ventana (todo se deshizo)" "0" "$(windows $D 21:00 22:00)"
checkre "A2 un CHECK de reservations que falla tras crear la ventana" "violates check constraint" \
  "$(q $DB "begin; alter table reservations add constraint tmp_price check (price < 1000); select create_one_off_reservation('$T','$D','21:00','22:00',60,'x','x@x',null,null,5000,'confirmed'); commit;")"
q $DB "alter table reservations drop constraint if exists tmp_price" >/dev/null
check "A2 tampoco queda ventana" "0" "$(windows $D 21:00 22:00)"
q $DB "update reservations set status = 'cancelled' where client_name = 'Ana2'" >/dev/null
checkre "A3 al reutilizar una ventana cancelada y fallar, la ventana sigue igual" "violates not-null constraint" \
  "$(q $DB "select create_one_off_reservation('$T','$D','18:00','19:00',60,null,'x@x',null,null,1,'confirmed')")"
check "A3 (sigue una ventana blocked, 0 reservas vivas en ella)" "1|blocked|0" \
  "$(windows $D 18:00 19:00)|$(q $DB "select status from availability_slots where session_date = '$D' and start_time = '18:00'")|$(q $DB "select count(*) from reservations r join availability_slots s on s.id = r.availability_slot_id where s.session_date = '$D' and s.start_time = '18:00' and r.status <> 'cancelled'")"

# ─── R. Concurrencia ─────────────────────────────────────────────────────────
# hold <fecha> <ini> <fin> <quien> <commit|rollback>: crea la clase y mantiene
# la transacción abierta 2 s (en segundo plano).
hold() {
  docker exec -i "$NAME" psql -U postgres -d $DB -qtA >/dev/null 2>&1 <<SQL &
begin;
select create_one_off_reservation('$T', '$1', '$2', '$3', (extract(epoch from '$3'::time - '$2'::time) / 60)::int, '$4', 'h@x', null, null, 300, 'confirmed');
select pg_sleep(2);
$5;
SQL
  sleep 0.7
}
# holdsql <sql> <commit|rollback>: cualquier SQL con la transacción abierta 2 s
holdsql() {
  docker exec -i "$NAME" psql -U postgres -d $DB -qtA >/dev/null 2>&1 <<SQL &
begin;
$1;
select pg_sleep(2);
$2;
SQL
  sleep 0.7
}

D1=2099-02-01
hold $D1 10:00 11:00 A commit
r=$(q $DB "select try_one_off('$D1', '10:00', '11:00', 'B')"); wait
checkre "R1 misma franja, la primera confirma: la segunda espera y luego 23P01" "^23P01" "$r"
[[ $(waited "$r") -ge 800 ]] && pass "R1 la segunda esperó al cerrojo ($(waited "$r") ms)" || bad "R1 no esperó ($(waited "$r") ms)"
check "R1 una ventana y una reserva viva" "1/1" "$(windows $D1 10:00 11:00)/$(live $D1)"

D2=2099-02-02
hold $D2 10:00 11:00 A rollback
r=$(q $DB "select try_one_off('$D2', '10:00', '11:00', 'B')" | strip); wait
check "R2 la primera se deshace: la segunda crea la suya" "ok false" "$r"
check "R2 una ventana y una reserva (la de B)" "1/1/B" "$(windows $D2 10:00 11:00)/$(live $D2)/$(q $DB "select client_name from reservations where session_date = '$D2'")"

D3=2099-02-03
try $D3 10:00 11:00 Old >/dev/null
q $DB "update reservations set status = 'cancelled' where client_name = 'Old'" >/dev/null
hold $D3 10:00 11:00 A rollback
r=$(q $DB "select try_one_off('$D3', '10:00', '11:00', 'B')" | strip); wait
check "R3 reutilización con rollback de la otra: B reutiliza la misma ventana" "ok true" "$r"
check "R3 una sola ventana; la reserva viva es de B" "1/1/B" \
  "$(windows $D3 10:00 11:00)/$(live $D3)/$(q $DB "select client_name from reservations where session_date = '$D3' and status <> 'cancelled'")"

D4=2099-02-04
try $D4 10:00 11:00 Old >/dev/null
q $DB "update reservations set status = 'cancelled' where client_name = 'Old' and session_date = '$D4'" >/dev/null
res=$(for i in 1 2 3 4 5 6 7 8 9 10; do q $DB "select try_one_off('$D4', '10:00', '11:00', 'P$i')" & done; wait)
check "R4 reutilización SIMULTÁNEA (10 a la vez sobre la ventana cancelada): 1 ok" "1" "$(grep -c '^ok true' <<<"$res")"
check "R4 el resto 23P01" "9" "$(grep -c '^23P01' <<<"$res")"
check "R4 una ventana, una reserva viva" "1/1" "$(windows $D4 10:00 11:00)/$(live $D4)"

D5=2099-02-05
try $D5 10:00 11:00 X >/dev/null
holdsql "update reservations set status = 'cancelled' where client_name = 'X' and session_date = '$D5'" commit
r=$(q $DB "select try_one_off('$D5', '10:00', '11:00', 'B')" | strip); wait
checkre "R5 cancelación aún sin confirmar: la franja sigue ocupada (23P01), sin esperar a medias" "^23P01" "$r"
check "R5 confirmada la cancelación, la misma clase reutiliza la ventana" "ok true" "$(try $D5 10:00 11:00 B)"
check "R5 una ventana, una reserva viva (B)" "1/1" "$(windows $D5 10:00 11:00)/$(live $D5)"

D6=2099-02-06
try $D6 10:00 11:00 Y >/dev/null
hold $D6 12:00 13:00 A commit
out=$(q $DB "update reservations set status = 'cancelled' where client_name = 'Y' and session_date = '$D6' returning status"); wait
check "R6 cancelar otra reserva del día mientras se crea una puntual no se bloquea" "cancelled" "$out"
check "R6 queda viva solo la puntual" "1" "$(live $D6)"

D7=2099-02-07
q $DB "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values ('00000000-0000-4000-8000-0000000000d7', '$T', '$D7', '10:00', '11:00', 'blocked', false)" >/dev/null
holdsql "delete from availability_slots where id = '00000000-0000-4000-8000-0000000000d7'" commit
r=$(q $DB "select try_one_off('$D7', '10:00', '11:00', 'B')"); wait
check "R7 borrado concurrente de la ventana vacía (confirma): B espera y crea otra" "ok false" "$(strip <<<"$r")"
[[ $(waited "$r") -ge 800 ]] && pass "R7 B esperó al borrado ($(waited "$r") ms)" || bad "R7 no esperó ($(waited "$r") ms)"
check "R7 una ventana y una reserva, con fecha" "1/1/$D7" "$(windows $D7 10:00 11:00)/$(live $D7)/$(q $DB "select session_date from reservations where session_date = '$D7'")"

D8=2099-02-08
q $DB "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values ('00000000-0000-4000-8000-0000000000d8', '$T', '$D8', '10:00', '11:00', 'blocked', false)" >/dev/null
holdsql "delete from availability_slots where id = '00000000-0000-4000-8000-0000000000d8'" rollback
check "R8 borrado concurrente que se deshace: B reutiliza la ventana" "ok true" "$(q $DB "select try_one_off('$D8', '10:00', '11:00', 'B')" | strip)"; wait
check "R8 una ventana, una reserva" "1/1" "$(windows $D8 10:00 11:00)/$(live $D8)"

D9=2099-02-09
try $D9 10:00 11:00 Old >/dev/null
q $DB "update reservations set status = 'cancelled' where client_name = 'Old' and session_date = '$D9'" >/dev/null
hold $D9 10:00 11:00 A commit # A reutiliza la ventana (FOR UPDATE) y no confirma aún
r=$(q $DB "delete from availability_slots where trainer_id = '$T' and session_date = '$D9'"); wait
checkre "R9 borrar la ventana mientras se reutiliza: espera y falla, la reserva se queda" "violates not-null constraint|violates foreign key" "$r"
check "R9 una ventana y una reserva viva con fecha" "1/1" "$(windows $D9 10:00 11:00)/$(live $D9)"

D10=2099-02-10
hold $D10 10:00 11:00 A commit
r=$(q $DB "select try_one_off('$D10', '10:30', '11:30', 'B')"); wait
checkre "R10 franjas solapadas (ventanas distintas): 23P01" "^23P01" "$r"
check "R10 no queda la ventana 10:30–11:30 de B" "0" "$(windows $D10 10:30 11:30)"

D11=2099-02-11
q $DB "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values ('00000000-0000-4000-8000-0000000000e1', '$T', '$D11', '09:00', '17:00', 'available', true)" >/dev/null
hold $D11 12:00 13:00 A commit
r=$(q $DB "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('00000000-0000-4000-8000-0000000000e1', '$T', 'Web', 'w@x', 'pending_confirmation', '12:30', '13:30')"); wait
checkre "R11 reserva de la web (sin cerrojo) contra la puntual abierta: la frena la 008" "reservations_no_overlap" "$r"
check "R11 una sola reserva viva" "1" "$(live $D11)"

D12=2099-02-12
res=$(for s in 10:00 10:30 11:00 11:30 12:00 12:30 13:00 13:30 14:00 14:30; do
        e=$(q $DB "select to_char('$s'::time + interval '60 minutes', 'HH24:MI')")
        q $DB "select try_one_off('$D12', '$s', '$e', 'P$s')" &
      done; wait)
oks=$(grep -c '^ok' <<<"$res")
[[ $oks -ge 1 ]] && pass "R12 10 a la vez, franjas encadenadas solapadas: $oks ok" || bad "R12 ninguna ok"
check "R12 ventanas del día = reservas vivas (ninguna huérfana)" "$(live $D12)" \
  "$(q $DB "select count(*) from availability_slots where trainer_id = '$T' and session_date = '$D12'")"
check "R12 ninguna reserva viva se solapa" "0" \
  "$(q $DB "select count(*) from reservations a join reservations b on a.id < b.id and a.session_date = b.session_date and a.trainer_id = b.trainer_id and a.start_time < b.end_time and b.start_time < a.end_time and a.status <> 'cancelled' and b.status <> 'cancelled' where a.session_date = '$D12'")"

# ─── C. 012 sin permiso para la prueba de CHECK ─────────────────────────────
chain nosuper 011
q nosuper "create role migrator login; grant usage, create on schema public to migrator; grant select on all tables in schema public to migrator" >/dev/null
out=$(docker exec -i "$NAME" psql -U migrator -d nosuper -v ON_ERROR_STOP=1 -q < migrations/012_one_off_reservation.sql 2>&1); code=$?
checkre "C1 sin permiso para session_replication_role: avisa" "sin permiso para la prueba de CHECK" "$out"
[[ $code -eq 0 ]] && pass "C1 y la 012 se aplica igualmente" || bad "C1 falló: $out"
check "C2 la 012 no deja los triggers apagados en su sesión" "origin" \
  "$( (cat migrations/012_one_off_reservation.sql; echo "select current_setting('session_replication_role');") | docker exec -i "$NAME" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -qtA 2>/dev/null | tail -1)"

exit $fail
