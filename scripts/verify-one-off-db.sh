#!/usr/bin/env bash
# Clase puntual en la BASE: migrations/011 (create_one_off_reservation) sobre
# un Postgres aislado (Docker, contenedor desechable). No toca Supabase.
#
# Esquema: scripts/db/deployed-schema.sql (referencia de lo desplegado) +
# migrations/008 y migrations/011 TAL CUAL.
#
#   F. Función: crea ventana exacta blocked/manual + reserva; solape → 23P01;
#      reutiliza la de una puntual cancelada; conflicto con otra ventana del
#      mismo rango; datos no válidos; solo service_role puede ejecutarla.
#   A. Atomicidad: si la reserva falla DESPUÉS de crear la ventana, no queda
#      ventana (no hay limpieza que pueda fallar).
#   R. Carreras (deterministas: la primera petición se queda con la
#      transacción abierta con pg_sleep mientras llega la segunda):
#      misma franja con commit / con rollback, reutilización de una ventana
#      cancelada con rollback, franjas solapadas en ventanas distintas, una
#      reserva "de la web" que no coge el cerrojo, y ráfagas en paralelo.
#   C. Compatibilidad: la 011 se niega a aplicarse sobre un esquema con la
#      forma de migrations/001 (CHECK de class_type / status), sin 'private'
#      en class_types o sin la 008; con el unique de la 001 (incluye
#      class_type) se aplica y el choque sale como conflicto de ventana.
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
# q <db> <sql>: una sola sentencia/valor, sin adornos
q() { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -qtA -c "$2" 2>&1; }
# run <db> < archivo
run() { docker exec -i "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q 2>&1; }
check() { # check <descripción> <esperado> <obtenido>
  if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else bad "$1: esperado «$2», obtenido «$3»"; fi
}
checkre() { # checkre <descripción> <regex> <obtenido>
  if [[ "$3" =~ $2 ]]; then pass "$1"; else bad "$1: no casa /$2/ con «$3»"; fi
}

new_db() { # new_db <nombre>: esquema de referencia (+ 008 si $2 != no008)
  q postgres "create database $1" >/dev/null
  run "$1" < scripts/db/deployed-schema.sql >/dev/null || { bad "esquema de referencia en $1"; return 1; }
  if [[ "${2:-}" != "no008" ]]; then run "$1" < migrations/008_reservations_no_overlap.sql >/dev/null || { bad "008 en $1"; return 1; }; fi
}

T=11111111-1111-4111-8111-111111111111
DB=ref
new_db $DB
out=$(run $DB < migrations/011_one_off_reservation.sql); [[ $? -eq 0 ]] && pass "011 se aplica sobre el esquema de referencia" || { bad "011: $out"; exit 1; }
out=$(run $DB < migrations/011_one_off_reservation.sql); [[ $? -eq 0 ]] && pass "011 es idempotente" || bad "011 dos veces: $out"
check "011 no deja los triggers apagados en su sesión (session_replication_role)" "origin" \
  "$( (cat migrations/011_one_off_reservation.sql; echo "select current_setting('session_replication_role');") | docker exec -i "$NAME" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -qtA 2>/dev/null | tail -1)"
q $DB "insert into trainers (id, slug) values ('$T', 't')" >/dev/null

# Envoltorio de prueba: devuelve 'ok <reused>' o '<sqlstate> <mensaje>' y el
# tiempo esperado (para ver que el cerrojo hace esperar).
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
try() { q $DB "select try_one_off('$1', '$2', '$3', '$4'${5:+, '$5'})" | sed -E 's/ waited_ms=[0-9]+//'; }
waited() { sed -nE 's/.*waited_ms=([0-9]+).*/\1/p' <<<"$1"; }
windows() { q $DB "select count(*) from availability_slots where trainer_id = '$T' and session_date = '$1' and start_time = '$2' and end_time = '$3'"; }
live() { q $DB "select count(*) from reservations where trainer_id = '$T' and session_date = '$1' and coalesce(status,'') not in ('cancelled','canceled','needs_reschedule')"; }

# ─── F. Función ──────────────────────────────────────────────────────────────
D=2099-01-05
q $DB "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values ('00000000-0000-4000-8000-00000000000a', '$T', '$D', '09:00', '13:00', 'available', true)" >/dev/null
q $DB "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('00000000-0000-4000-8000-00000000000a', '$T', 'Base', 'b@x', 'confirmed', '10:00', '11:00')" >/dev/null

check "F1 fuera del horario: crea ventana + reserva" "ok false" "$(try $D 18:00 19:00 Ana)"
check "F1 ventana exacta, blocked, manual, private, 1 reserva" "blocked|f|private|1" \
  "$(q $DB "select status, generated_by_pattern, class_type, current_bookings from availability_slots where session_date = '$D' and start_time = '18:00'" | tr -d ' ')"
check "F1 reserva: fecha por el trigger, 1 jugador, sin WhatsApp, 60 min" "$D|1|f|60|confirmed" \
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
  "$(q $DB "select create_one_off_reservation('$T','$D','20:00','21:00',90,'x','x@x',null,null,1,'confirmed')" | sed -E 's/^ERROR: +//')"
check "F5 nada creado a las 20:00" "0" "$(windows $D 20:00 21:00)"
checkre "F6 anon no puede ejecutarla" "permission denied for function" \
  "$(q $DB "set role anon; select create_one_off_reservation('$T','$D','20:00','21:00',60,'x','x@x',null,null,1,'confirmed')")"
checkre "F6 authenticated tampoco" "permission denied for function" \
  "$(q $DB "set role authenticated; select create_one_off_reservation('$T','$D','20:00','21:00',60,'x','x@x',null,null,1,'confirmed')")"
checkre "F6 service_role sí" "^[0-9a-f-]{36}," \
  "$(q $DB "set role service_role; select reservation_id || ',' from create_one_off_reservation('$T','$D','20:00','21:00',60,'Svc','s@x',null,null,1,'confirmed')")"

# ─── A. Atomicidad ───────────────────────────────────────────────────────────
checkre "A1 la reserva falla tras crear la ventana (client_name NULL)" "violates not-null constraint" \
  "$(q $DB "select create_one_off_reservation('$T','$D','21:00','22:00',60,null,'x@x',null,null,1,'confirmed')")"
check "A1 no queda ninguna ventana (todo se deshizo)" "0" "$(windows $D 21:00 22:00)"
checkre "A2 un CHECK de reservations que falla tras crear la ventana" "violates check constraint" \
  "$(q $DB "begin; alter table reservations add constraint tmp_price check (price < 1000); select create_one_off_reservation('$T','$D','21:00','22:00',60,'x','x@x',null,null,5000,'confirmed'); commit;")"
q $DB "alter table reservations drop constraint if exists tmp_price" >/dev/null
check "A2 tampoco queda ventana" "0" "$(windows $D 21:00 22:00)"

# ─── R. Carreras ─────────────────────────────────────────────────────────────
# hold <db> <fecha> <ini> <fin> <quien> <commit|rollback>: abre la transacción,
# crea la clase y la mantiene 2 s sin cerrar (en segundo plano).
hold() {
  docker exec -i "$NAME" psql -U postgres -d "$1" -qtA >/dev/null 2>&1 <<SQL &
begin;
select create_one_off_reservation('$T', '$2', '$3', '$4', (extract(epoch from '$4'::time - '$3'::time) / 60)::int, '$5', 'h@x', null, null, 300, 'confirmed');
select pg_sleep(2);
$6;
SQL
  sleep 0.7 # que la primera ya tenga el cerrojo y la ventana sin confirmar
}

D1=2099-02-01
hold $DB $D1 10:00 11:00 A commit
r=$(q $DB "select try_one_off('$D1', '10:00', '11:00', 'B')")
wait
checkre "R1 misma franja, la primera confirma: la segunda ESPERA y luego 23P01" "^23P01" "$r"
[[ $(waited "$r") -ge 800 ]] && pass "R1 la segunda esperó al cerrojo ($(waited "$r") ms)" || bad "R1 no esperó ($(waited "$r") ms)"
check "R1 una ventana y una reserva viva" "1/1" "$(windows $D1 10:00 11:00)/$(live $D1)"

D2=2099-02-02
hold $DB $D2 10:00 11:00 A rollback
r=$(q $DB "select try_one_off('$D2', '10:00', '11:00', 'B')")
wait
check "R2 la primera se deshace: la segunda crea la suya (no reutiliza una a medias)" "ok false" "$(sed -E 's/ waited_ms=[0-9]+//' <<<"$r")"
check "R2 una ventana y una reserva (la de B)" "1/1/B" \
  "$(windows $D2 10:00 11:00)/$(live $D2)/$(q $DB "select client_name from reservations where session_date = '$D2'")"

D3=2099-02-03
try $D3 10:00 11:00 Old >/dev/null
q $DB "update reservations set status = 'cancelled' where client_name = 'Old'" >/dev/null
hold $DB $D3 10:00 11:00 A rollback # A reutiliza la ventana cancelada y se deshace
r=$(q $DB "select try_one_off('$D3', '10:00', '11:00', 'B')")
wait
check "R3 reutilización con rollback de la otra: B reutiliza la misma ventana" "ok true" "$(sed -E 's/ waited_ms=[0-9]+//' <<<"$r")"
check "R3 sigue habiendo una sola ventana; la reserva viva es de B" "1/1/B" \
  "$(windows $D3 10:00 11:00)/$(live $D3)/$(q $DB "select client_name from reservations where session_date = '$D3' and status <> 'cancelled'")"

D4=2099-02-04
hold $DB $D4 10:00 11:00 A commit
r=$(q $DB "select try_one_off('$D4', '10:30', '11:30', 'B')")
wait
checkre "R4 franjas solapadas (ventanas distintas): 23P01" "^23P01" "$r"
check "R4 no queda la ventana 10:30–11:30 de B (sin limpieza)" "0" "$(windows $D4 10:30 11:30)"

D5=2099-02-05
q $DB "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values ('00000000-0000-4000-8000-0000000000d5', '$T', '$D5', '09:00', '17:00', 'available', true)" >/dev/null
hold $DB $D5 12:00 13:00 A commit
r=$(docker exec -i "$NAME" psql -U postgres -d $DB -qtA -c "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('00000000-0000-4000-8000-0000000000d5', '$T', 'Web', 'w@x', 'pending_confirmation', '12:30', '13:30')" 2>&1)
wait
checkre "R5 reserva de la web (sin cerrojo) contra la puntual abierta: la frena la 008" "reservations_no_overlap" "$r"
check "R5 una sola reserva viva" "1" "$(live $D5)"

burst() { # burst <fecha> <n> <ini...>: n llamadas a la vez; imprime los resultados
  local d=$1; shift
  for s in "$@"; do
    e=$(q $DB "select to_char('$s'::time + interval '60 minutes', 'HH24:MI')")
    q $DB "select try_one_off('$d', '$s', '$e', 'P$s')" &
  done
  wait
}
D6=2099-02-06
res=$(burst $D6 10:00 10:00 10:00 10:00 10:00 10:00 10:00 10:00 10:00 10:00)
check "R6 10 a la vez, misma franja: exactamente 1 ok" "1" "$(grep -c '^ok' <<<"$res")"
check "R6 el resto 23P01" "9" "$(grep -c '^23P01' <<<"$res")"
check "R6 una ventana, una reserva" "1/1" "$(windows $D6 10:00 11:00)/$(live $D6)"

D7=2099-02-07
res=$(burst $D7 10:00 10:30 11:00 11:30 12:00 12:30 13:00 13:30 14:00 14:30)
oks=$(grep -c '^ok' <<<"$res")
[[ $oks -ge 1 ]] && pass "R7 10 a la vez, franjas encadenadas solapadas: $oks ok" || bad "R7 ninguna ok"
check "R7 ventanas del día = reservas vivas (ninguna huérfana)" "$(live $D7)" \
  "$(q $DB "select count(*) from availability_slots where trainer_id = '$T' and session_date = '$D7'")"
check "R7 ninguna reserva viva se solapa" "0" \
  "$(q $DB "select count(*) from reservations a join reservations b on a.id < b.id and a.session_date = b.session_date and a.trainer_id = b.trainer_id and a.start_time < b.end_time and b.start_time < a.end_time where a.session_date = '$D7'")"

# ─── C. Compatibilidad del esquema ───────────────────────────────────────────
new_db legacy_class
q legacy_class "alter table availability_slots add constraint legacy_class_type check (class_type in ('individual', 'group', 'semi-private', 'academy'))" >/dev/null
checkre "C1 CHECK de class_type como la 001: la 011 se niega" "no admite una ventana private/blocked" "$(run legacy_class < migrations/011_one_off_reservation.sql)"
check "C1 y no deja la función a medias" "0" "$(q legacy_class "select count(*) from pg_proc where proname = 'create_one_off_reservation'")"

new_db legacy_status
q legacy_status "alter table availability_slots add constraint legacy_status check (status in ('available', 'full', 'cancelled'))" >/dev/null
checkre "C2 CHECK de status sin 'blocked' (001): la 011 se niega" "no admite una ventana private/blocked" "$(run legacy_status < migrations/011_one_off_reservation.sql)"

new_db no_private
q no_private "delete from class_types where name = 'private'" >/dev/null
checkre "C3 class_types sin 'private': la 011 se niega" "no existe 'private'" "$(run no_private < migrations/011_one_off_reservation.sql)"

new_db no008 no008
checkre "C4 sin la 008: la 011 se niega" "011 requiere la 008" "$(run no008 < migrations/011_one_off_reservation.sql)"

new_db unique001
q unique001 "alter table availability_slots drop constraint availability_slots_trainer_id_session_date_start_time_end_t_key" >/dev/null
q unique001 "alter table availability_slots add constraint legacy_unique unique (trainer_id, session_date, start_time, class_type)" >/dev/null
out=$(run unique001 < migrations/011_one_off_reservation.sql); [[ $? -eq 0 ]] && pass "C5 unique de la 001 (con class_type): la 011 se aplica" || bad "C5: $out"
q unique001 "insert into trainers (id) values ('$T')" >/dev/null
q unique001 "insert into availability_slots (trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values ('$T', '2099-03-01', '09:00', '10:00', 'available', true)" >/dev/null
checkre "C5 misma hora de inicio que otra ventana → conflicto de ventana, no 500" "one_off_window_conflict" \
  "$(q unique001 "select create_one_off_reservation('$T','2099-03-01','09:00','10:30',90,'x','x@x',null,null,1,'confirmed')")"
check "C5 sin ventana ni reserva nuevas" "1/0" \
  "$(q unique001 "select count(*) from availability_slots")/$(q unique001 "select count(*) from reservations")"

new_db nosuper
q nosuper "create role migrator login; grant usage, create on schema public to migrator; grant select on all tables in schema public to migrator" >/dev/null
out=$(docker exec -i "$NAME" psql -U migrator -d nosuper -v ON_ERROR_STOP=1 -q < migrations/011_one_off_reservation.sql 2>&1)
code=$?
checkre "C6 sin permiso para session_replication_role: avisa y sigue" "sin permiso para la prueba de CHECK" "$out"
[[ $code -eq 0 ]] && pass "C6 y la 011 se aplica igualmente" || bad "C6 falló: $out"

exit $fail
