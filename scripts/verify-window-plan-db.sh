#!/usr/bin/env bash
# Sincronización atómica de ventanas (migrations/014, apply_window_plan) en
# Postgres aislado (Docker, contenedor desechable). No toca Supabase.
#
# Esquema desplegado de referencia (FK CASCADE) + 008, 011, 012, 013 y 014.
# "Públicamente reservable" = ventanas abiertas (status fuera de los estados
# cerrados de isSlotOpen) menos reservas vivas; se compara la lista de
# ventanas abiertas y la de reservas vivas.
#
#   A. Plan completo: cerrar, borrar, acortar, insertar y reabrir; un plan
#      viejo (ventana a borrar que ganó una reserva → se cierra) y un
#      acortamiento que dejaría fuera una reserva viva (→ se cierra).
#   F. Fallos inyectados en CADA fase (cerrar, borrar, fin, insertar,
#      reabrir), un 23503 de OTRA FK y un fallo después de la función en la
#      misma transacción: todo igual que antes (ventanas, reservas y lo
#      publicado).
#   C. Concurrencia: reserva pública contra el borrado (en los dos órdenes),
#      dos sincronizaciones a la vez, y el límite de acortar mientras entra
#      una reserva.
#   S. Permisos y filas ajenas.
#
#   bash scripts/verify-window-plan-db.sh
set -uo pipefail
cd "$(dirname "$0")/.."

NAME="verify-window-plan-db-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test postgres:16-alpine >/dev/null || exit 1
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do
  docker exec "$NAME" psql -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done

fail=0
pass() { echo "ok   - $1"; }
bad() { echo "FAIL - $1"; fail=1; }
DB=plan
q() { docker exec -i "$NAME" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -qtA -c "$1" 2>&1; }
run() { docker exec -i "$NAME" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -q 2>&1; }
check() { if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else bad "$1: esperado «$2», obtenido «$3»"; fi; }
checkre() { if [[ "$3" =~ $2 ]]; then pass "$1"; else bad "$1: no casa /$2/ con «$3»"; fi; }

docker exec "$NAME" psql -U postgres -qc "create database $DB" >/dev/null
run < scripts/db/deployed-schema.sql >/dev/null
for f in 008_reservations_no_overlap 011_schema_compat 012_one_off_reservation 013_reservations_slot_fk_restrict 014_apply_window_plan 015_reservations_within_window 016_availability_revision; do
  out=$(run < migrations/$f.sql) || { bad "$f: $out"; exit 1; }
done
pass "esquema desplegado + 008, 011, 012, 013, 014, 015 y 016"
checkre "014 se niega sin la 013" "014 requiere la 013" "$(docker exec "$NAME" psql -U postgres -qc 'create database no013' >/dev/null; docker exec -i "$NAME" psql -U postgres -d no013 -q < scripts/db/deployed-schema.sql >/dev/null 2>&1; docker exec -i "$NAME" psql -U postgres -d no013 -v ON_ERROR_STOP=1 -q < migrations/014_apply_window_plan.sql 2>&1)"

T=11111111-1111-4111-8111-111111111111
OTHER=22222222-2222-4222-8222-222222222222
D=2099-06-01
id() { printf '00000000-0000-4000-8000-%012d' "$1"; }
K=$(id 1); DEL=$(id 2); HIST=$(id 3); LIVE=$(id 4); SHR=$(id 5); RET=$(id 6); SHRL=$(id 7); DELR=$(id 8); FOREIGN=$(id 9); MANUAL=$(id 10)
run >/dev/null <<SQL
insert into trainers (id, slug) values ('$T', 't'), ('$OTHER', 'o');
insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values
  ('$K',    '$T', '$D', '09:00', '10:00', 'available', true),
  ('$DEL',  '$T', '$D', '10:00', '11:00', 'available', true),
  ('$HIST', '$T', '$D', '11:00', '12:00', 'available', true),
  ('$LIVE', '$T', '$D', '12:00', '13:00', 'available', true),
  ('$SHR',  '$T', '$D', '13:00', '17:00', 'available', true),
  ('$RET',  '$T', '$D', '17:00', '18:00', 'blocked',   true),
  ('$SHRL', '$T', '$D', '19:00', '22:00', 'available', true),
  ('$DELR', '$T', '$D', '07:00', '08:00', 'available', true),
  ('$FOREIGN', '$OTHER', '$D', '09:00', '10:00', 'available', true),
  ('$MANUAL',  '$T', '$D', '06:00', '07:00', 'blocked', false);
insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values
  ('$HIST', '$T', 'Historial', 'h@x', 'cancelled', '11:00', '12:00'),
  ('$LIVE', '$T', 'Viva',      'v@x', 'confirmed', '12:00', '13:00'),
  ('$RET',  '$T', 'Antigua',   'a@x', 'cancelled', '17:00', '18:00'),
  ('$SHRL', '$T', 'Tarde',     't@x', 'confirmed', '21:00', '22:00');
-- Inyección de fallos por fase (solo en esta base de prueba).
create table inject (phase text primary key);
create function inject_fail() returns trigger language plpgsql as \$\$
begin
  if tg_op = 'INSERT' and exists (select 1 from inject where phase = 'insert') then raise exception 'inyectado: insert'; end if;
  if tg_op = 'DELETE' and exists (select 1 from inject where phase = 'delete') then raise exception 'inyectado: delete'; end if;
  if tg_op = 'UPDATE' then
    if new.end_time is distinct from old.end_time and exists (select 1 from inject where phase = 'update_end') then raise exception 'inyectado: update_end'; end if;
    if new.status = 'blocked' and old.status is distinct from 'blocked' and exists (select 1 from inject where phase = 'close') then raise exception 'inyectado: close'; end if;
    if new.status = 'available' and old.status = 'blocked' and exists (select 1 from inject where phase = 'reopen') then raise exception 'inyectado: reopen'; end if;
  end if;
  return coalesce(new, old);
end \$\$;
create trigger inject_fail before insert or update or delete on availability_slots for each row execute function inject_fail();
-- Otra FK hacia availability_slots (para el 23503 que NO es de reservations).
create table slot_notes (id serial primary key, slot_id uuid not null references availability_slots (id));
-- Lo que se ve desde la web: ventanas abiertas (isSlotOpen) y reservas vivas.
create view public_state as
select 'open ' || string_agg(to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI'), ',' order by start_time) as x
  from availability_slots
 where trainer_id = '$T' and session_date = '$D'
   and lower(coalesce(status, '')) not in ('pending', 'full', 'cancelled', 'canceled', 'booked', 'unavailable', 'blocked')
union all
select 'live ' || string_agg(to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI'), ',' order by start_time)
  from reservations
 where trainer_id = '$T' and session_date = '$D' and coalesce(status, '') not in ('cancelled', 'canceled', 'needs_reschedule');
SQL

# Plan como lo calcula generate.ts para ese día (el patrón quiere 09-10, 13-15, 17-18, 18-19 y 19-20).
PLAN=$(cat <<JSON
{"insert":[{"session_date":"$D","start_time":"18:00","end_time":"19:00","class_type":"private"}],
 "delete":["$DEL","$DELR"],
 "update_end":[{"id":"$SHR","end_time":"15:00"},{"id":"$SHRL","end_time":"20:00"}],
 "close":["$HIST","$LIVE"],
 "reopen":["$RET"]}
JSON
)
apply() { q "select apply_window_plan('$T', '$PLAN'::jsonb, (select availability_revision from trainers where id = '$T'))"; }
public() { q "select string_agg(x, ' | ' order by x) from public_state"; }
snapshot() { q "select md5(coalesce((select string_agg(s::text, '|' order by s.id) from availability_slots s), '') || '#' || coalesce((select string_agg(r::text, '|' order by r.id) from reservations r), ''))"; }
res_total() { q "select count(*) from reservations"; }

# Plan viejo: DELR ganó una reserva después de calcular el plan.
q "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$DELR', '$T', 'Nueva', 'n@x', 'pending_confirmation', '07:00', '08:00')" >/dev/null

BASE=$(snapshot); BASE_PUBLIC=$(public); BASE_RES=$(res_total)
check "base: lo publicado antes de sincronizar" "live 07:00-08:00,12:00-13:00,21:00-22:00 | open 07:00-08:00,09:00-10:00,10:00-11:00,11:00-12:00,12:00-13:00,13:00-17:00,19:00-22:00" "$BASE_PUBLIC"

# ─── F. Fallos inyectados: nada cambia ───────────────────────────────────────
for phase in close delete update_end insert reopen; do
  q "insert into inject values ('$phase')" >/dev/null
  checkre "F $phase: falla" "inyectado: $phase" "$(apply)"
  q "delete from inject" >/dev/null
  check "F $phase: ventanas y reservas exactamente como antes" "$BASE" "$(snapshot)"
  check "F $phase: lo publicado no cambia" "$BASE_PUBLIC" "$(public)"
done
q "insert into slot_notes (slot_id) values ('$DEL')" >/dev/null
BASE=$(snapshot)
checkre "F 23503 de OTRA FK (slot_notes) al borrar: falla y se propaga" "slot_notes_slot_id_fkey" "$(apply)"
check "F 23503 otra FK: nada cambia" "$BASE" "$(snapshot)"
check "F 23503 otra FK: lo publicado no cambia" "$BASE_PUBLIC" "$(public)"
q "delete from slot_notes" >/dev/null
BASE=$(snapshot)
checkre "F fallo DESPUÉS de la función, en la misma transacción (p. ej. la red antes del commit)" "division by zero" \
  "$(q "begin; select apply_window_plan('$T', '$PLAN'::jsonb, (select availability_revision from trainers where id = '$T')); select 1/0; commit;")"
check "F después: nada cambia" "$BASE" "$(snapshot)"
check "F después: lo publicado no cambia" "$BASE_PUBLIC" "$(public)"

# ─── A. Plan completo ────────────────────────────────────────────────────────
out=$(apply)
check "A resultado: creada 1, borrada 1, cerradas 2, conservada 1 (ganó reserva), acortar imposible 1, reabierta 1" "t" \
  "$(q "select '$out'::jsonb = '{\"kept\": 1, \"closed\": 2, \"missing\": 0, \"created\": 1, \"removed\": 1, \"reopened\": 1, \"shrink_blocked\": 1}'::jsonb")"
check "A publicado: solo lo que el patrón quiere; ni horas quitadas ni ventanas con historial" \
  "live 07:00-08:00,12:00-13:00,21:00-22:00 | open 09:00-10:00,13:00-15:00,17:00-18:00,18:00-19:00" "$(public)"
check "A DELR ganó una reserva: cerrada, no borrada" "blocked" "$(q "select status from availability_slots where id = '$DELR'")"
check "A SHRL no se acorta (dejaría fuera la reserva de las 21:00): cerrada" "22:00:00|blocked" "$(q "select end_time || '|' || status from availability_slots where id = '$SHRL'")"
check "A ninguna reserva perdida (vivas e historial)" "$BASE_RES" "$(res_total)"
check "A el historial sigue con su ventana" "2" "$(q "select count(*) from reservations r join availability_slots s on s.id = r.availability_slot_id where r.status = 'cancelled'")"
out=$(apply)
checkre "A el mismo plan otra vez (viejo): sin error, sin crear ni borrar" '"created": 0.*"removed": 0' "$out"
check "A y lo publicado sigue igual" "live 07:00-08:00,12:00-13:00,21:00-22:00 | open 09:00-10:00,13:00-15:00,17:00-18:00,18:00-19:00" "$(public)"

# ─── C. Concurrencia ─────────────────────────────────────────────────────────
hold() { # hold <sql> <commit|rollback>: en segundo plano, transacción abierta 2 s
  docker exec -i "$NAME" psql -U postgres -d $DB -qtA >/dev/null 2>&1 <<SQL &
begin;
$1;
select pg_sleep(2);
$2;
SQL
  sleep 0.7
}
D2=2099-06-02
W1=$(id 21); W2=$(id 22); W3=$(id 23)
q "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values ('$W1', '$T', '$D2', '09:00', '10:00', 'available', true), ('$W2', '$T', '$D2', '10:00', '11:00', 'available', true), ('$W3', '$T', '$D2', '11:00', '15:00', 'available', true)" >/dev/null

hold "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$W1', '$T', 'Web1', 'w@x', 'pending_confirmation', '09:00', '10:00')" commit
out=$(q "select apply_window_plan('$T', '{\"delete\":[\"$W1\"]}'::jsonb, (select availability_revision from trainers where id = '$T'))"); wait
checkre "C1 reserva pública en curso: la sincronización espera y, al verla, cierra en vez de borrar" '"kept": 1.*"removed": 0' "$out"
check "C1 la reserva sigue, en su ventana (cerrada)" "1|blocked" "$(q "select count(*) from reservations where client_name = 'Web1'")|$(q "select status from availability_slots where id = '$W1'")"

hold "select apply_window_plan('$T', '{\"delete\":[\"$W2\"]}'::jsonb, (select availability_revision from trainers where id = '$T'))" commit
r=$(q "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$W2', '$T', 'Web2', 'w@x', 'pending_confirmation', '10:00', '11:00')"); wait
checkre "C2 la sincronización borra primero: la reserva pública espera y la base la rechaza (sin reserva huérfana)" "violates foreign key constraint" "$r"
check "C2 ni ventana ni reserva" "0/0" "$(q "select count(*) from availability_slots where id = '$W2'")/$(q "select count(*) from reservations where client_name = 'Web2'")"

res=$(for i in 1 2 3 4 5; do q "select apply_window_plan('$T', '{\"insert\":[{\"session_date\":\"$D2\",\"start_time\":\"16:00\",\"end_time\":\"17:00\"}]}'::jsonb, (select availability_revision from trainers where id = '$T'))" & done; wait)
check "C3 cinco sincronizaciones a la vez: todas sin error" "0" "$(grep -c ERROR <<<"$res")"
check "C3 una sola ventana nueva" "1" "$(q "select count(*) from availability_slots where session_date = '$D2' and start_time = '16:00'")"

hold "select apply_window_plan('$T', '{\"update_end\":[{\"id\":\"$W3\",\"end_time\":\"12:00\"}]}'::jsonb, (select availability_revision from trainers where id = '$T'))" commit
r=$(q "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values ('$W3', '$T', 'Web3', 'w@x', 'pending_confirmation', '13:00', '14:00') returning 'insertada'"); wait
checkre "C4 una reserva validada con el rango viejo tras acortar: la 015 la rechaza (antes entraba)" "reservations_within_window" "$r"
check "C4 ventana 11-12 y ninguna reserva fuera" "12:00:00|0" "$(q "select end_time from availability_slots where id = '$W3'")|$(q "select count(*) from reservations where client_name = 'Web3'")"

# ─── G. El plan del generate.ts REAL, aplicado por la función real ───────────
# Día a 3 días vista con la misma forma que A; el patrón de ese día de la
# semana quiere 09-10, 13-15 y 17-18. generate.ts lee las filas (JSON sacado
# de esta base) y su plan se aplica aquí.
G=$(python3 -c "import datetime,sys; print((datetime.date.fromisoformat('$(date +%F)') + datetime.timedelta(days=3)).isoformat())")
GK=$(id 31); GDEL=$(id 32); GHIST=$(id 33); GSHR=$(id 34); GRET=$(id 35)
q "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern) values
   ('$GK', '$T', '$G', '09:00', '10:00', 'available', true), ('$GDEL', '$T', '$G', '10:00', '11:00', 'available', true),
   ('$GHIST', '$T', '$G', '11:00', '12:00', 'available', true), ('$GSHR', '$T', '$G', '13:00', '17:00', 'available', true),
   ('$GRET', '$T', '$G', '17:00', '18:00', 'blocked', true);
   insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time) values
   ('$GHIST', '$T', 'GH', 'g@x', 'cancelled', '11:00', '12:00'), ('$GRET', '$T', 'GR', 'g@x', 'cancelled', '17:00', '18:00')" >/dev/null
DOW=$(python3 -c "import datetime; print(datetime.date.fromisoformat('$G').weekday())")
ROWS=$(q "select json_agg(json_build_object('id', s.id, 'session_date', s.session_date, 'start_time', s.start_time, 'end_time', s.end_time,
          'class_type', s.class_type, 'status', s.status, 'current_bookings', s.current_bookings, 'max_capacity', s.max_capacity,
          'generated_by_pattern', s.generated_by_pattern,
          'reservations', coalesce((select json_agg(json_build_object('id', r.id, 'status', r.status)) from reservations r where r.availability_slot_id = s.id), '[]'::json)))
     from availability_slots s where s.trainer_id = '$T' and s.session_date = '$G'")
GOUT=$(printf '{"trainerId":"%s","revision":'"$(q "select availability_revision from trainers where id = '$T'")"',"slots":%s,"weekly":[{"day_of_week":%s,"start_time":"09:00:00","end_time":"10:00:00","class_type":"private"},{"day_of_week":%s,"start_time":"13:00:00","end_time":"15:00:00","class_type":"private"},{"day_of_week":%s,"start_time":"17:00:00","end_time":"18:00:00","class_type":"private"}]}' "$T" "$ROWS" "$DOW" "$DOW" "$DOW" \
  | (source ~/.nvm/nvm.sh >/dev/null 2>&1; nvm use 20 >/dev/null 2>&1; node scripts/lib/capture-window-plan.mjs))
GPLAN=$(python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["plan"], separators=(",", ":")))' <<<"$GOUT")
GREV=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["revision"])' <<<"$GOUT")
checkre "G generate.ts produce un plan (borrar la vacía, cerrar la del historial, acortar, reabrir)" "\"delete\":\\[\"$GDEL\"\\].*\"close\":\\[\"$GHIST\"\\].*\"reopen\":\\[\"$GRET\"\\]" "$GPLAN"
out=$(q "select apply_window_plan('$T', '$GPLAN'::jsonb, $GREV)")
checkre "G la función real acepta el plan real" '"removed": 1' "$out"
check "G publicado ese día: 09-10, 13-15 y 17-18" "open 09:00-10:00,13:00-15:00,17:00-18:00" \
  "$(q "select 'open ' || string_agg(to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI'), ',' order by start_time) from availability_slots where trainer_id = '$T' and session_date = '$G' and status not in ('blocked', 'full', 'cancelled', 'pending')")"

# ─── S. Permisos y filas ajenas ──────────────────────────────────────────────
checkre "S anon no puede ejecutarla" "permission denied for function" "$(q "set role anon; select apply_window_plan('$T', '{}'::jsonb, (select availability_revision from trainers where id = '$T'))")"
BASE=$(snapshot)
checkre "S fila de otro entrenador en el plan → error" "window_plan_foreign_row" "$(q "select apply_window_plan('$T', '{\"delete\":[\"$FOREIGN\"],\"insert\":[{\"session_date\":\"$D\",\"start_time\":\"23:00\",\"end_time\":\"23:30\"}]}'::jsonb, (select availability_revision from trainers where id = '$T'))")"
checkre "S fila manual (clase puntual) en el plan → error" "window_plan_foreign_row" "$(q "select apply_window_plan('$T', '{\"close\":[\"$MANUAL\"]}'::jsonb, (select availability_revision from trainers where id = '$T'))")"
check "S y no cambia nada" "$BASE" "$(snapshot)"

exit $fail
