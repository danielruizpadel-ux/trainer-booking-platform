#!/usr/bin/env bash
# Migración 016: un plan de sincronización calculado con un horario viejo no
# se aplica. Postgres aislado (Docker, contenedor desechable) + el
# generate.ts REAL para calcular los planes (scripts/lib/capture-window-plan.mjs,
# que no escribe nada). No toca Supabase.
#
#   V. availability_revision sube con cada cambio de horario/excepción (solo
#      del entrenador que cambia); la 016 es idempotente y no toca datos; la
#      versión sin revisión de apply_window_plan ya no existe.
#   S. Secuencia de la revisión: A calcula → B apaga el día y sincroniza →
#      A intenta aplicar → rechazado; lo publicado es lo de B. A recalcula
#      y aplica sin cambiar nada.
#   C. Concurrencia: escritura de horario en curso → A aplica (espera y se
#      rechaza); A aplicando → escritura de horario (espera a A).
#
#   bash scripts/verify-schedule-revision-db.sh
set -uo pipefail
cd "$(dirname "$0")/.."

NAME="verify-schedule-revision-db-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test postgres:16-alpine >/dev/null || exit 1
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do
  docker exec "$NAME" psql -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done

fail=0
pass() { echo "ok   - $1"; }
bad() { echo "FAIL - $1"; fail=1; }
DB=rev
q() { docker exec -i "$NAME" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -qtA -c "$1" 2>&1; }
run() { docker exec -i "$NAME" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -q 2>&1; }
check() { if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else bad "$1: esperado «$2», obtenido «$3»"; fi; }
checkre() { if [[ "$3" =~ $2 ]]; then pass "$1"; else bad "$1: no casa /$2/ con «$3»"; fi; }

docker exec "$NAME" psql -U postgres -qc "create database $DB" >/dev/null
run < scripts/db/deployed-schema.sql >/dev/null
for f in 008_reservations_no_overlap 011_schema_compat 012_one_off_reservation 013_reservations_slot_fk_restrict 014_apply_window_plan 015_reservations_within_window; do
  out=$(run < migrations/$f.sql) || { bad "$f: $out"; exit 1; }
done

T=11111111-1111-4111-8111-111111111111
OTHER=22222222-2222-4222-8222-222222222222
q "insert into trainers (id, slug) values ('$T', 't'), ('$OTHER', 'o')" >/dev/null
q "insert into availability_slots (trainer_id, session_date, start_time, end_time, generated_by_pattern) values ('$T', '2099-01-01', '09:00', '10:00', true)" >/dev/null
snap() { q "select md5(coalesce((select string_agg(s::text, '|' order by s.id) from availability_slots s), '') || coalesce((select string_agg(r::text, '|' order by r.id) from reservations r), ''))"; }

# ─── V. Revisión ─────────────────────────────────────────────────────────────
before=$(snap)
out=$(run < migrations/016_availability_revision.sql); [[ $? -eq 0 ]] && pass "V1 la 016 se aplica" || { bad "V1: $out"; exit 1; }
out=$(run < migrations/016_availability_revision.sql); [[ $? -eq 0 ]] && pass "V1 idempotente" || bad "V1 dos veces: $out"
check "V1 no toca ventanas ni reservas; revisión 0 de partida" "$before|0|0" "$(snap)|$(q "select availability_revision from trainers where id = '$T'")|$(q "select availability_revision from trainers where id = '$OTHER'")"
checkre "V2 ya no existe apply_window_plan sin revisión" "does not exist" "$(q "select apply_window_plan('$T', '{}'::jsonb)")"
rev() { q "select availability_revision from trainers where id = '$1'"; }
q "insert into trainer_weekly_hours (trainer_id, day_of_week, start_time, end_time) values ('$T', 0, '09:00', '10:00')" >/dev/null
q "update trainer_weekly_hours set end_time = '11:00' where trainer_id = '$T'" >/dev/null
q "insert into trainer_availability_overrides (trainer_id, override_date, is_blocked) values ('$T', '2099-01-01', true)" >/dev/null
q "delete from trainer_availability_overrides where trainer_id = '$T'" >/dev/null
q "delete from trainer_weekly_hours where trainer_id = '$T'" >/dev/null
check "V3 cada cambio de horario o excepción sube la revisión (5 cambios)" "5" "$(rev $T)"
check "V3 la de otro entrenador no cambia" "0" "$(rev $OTHER)"
q "insert into trainer_weekly_hours (trainer_id, day_of_week, start_time, end_time) values ('$OTHER', 0, '09:00', '10:00')" >/dev/null
out=$(q "delete from trainers where id = '$OTHER'"); [[ -z "$out" ]] && pass "V4 borrar un entrenador con horario no choca con el trigger" || bad "V4: $out"

# ─── S. Secuencia A calcula → B guarda y sincroniza → A aplica ──────────────
G=$(python3 -c "import datetime; print((datetime.date.today() + datetime.timedelta(days=3)).isoformat())")
DOW=$(python3 -c "import datetime; print(datetime.date.fromisoformat('$G').weekday())")
q "insert into trainer_weekly_hours (trainer_id, day_of_week, start_time, end_time) values ('$T', $DOW, '09:00', '13:00')" >/dev/null
open_on() { q "select coalesce(string_agg(to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI'), ',' order by start_time), '(nada)') from availability_slots where trainer_id = '$T' and session_date = '$1' and status not in ('blocked', 'full', 'cancelled', 'pending')"; }
# Calcula el plan con el generate.ts real a partir de lo que hay AHORA en la base.
compute() {
  local weekly slots revision
  revision=$(rev $T)
  weekly=$(q "select coalesce(json_agg(json_build_object('day_of_week', day_of_week, 'start_time', start_time, 'end_time', end_time, 'class_type', class_type)), '[]') from trainer_weekly_hours where trainer_id = '$T' and enabled")
  slots=$(q "select coalesce(json_agg(json_build_object('id', s.id, 'session_date', s.session_date, 'start_time', s.start_time, 'end_time', s.end_time,
             'class_type', s.class_type, 'status', s.status, 'current_bookings', s.current_bookings, 'max_capacity', s.max_capacity,
             'generated_by_pattern', s.generated_by_pattern, 'reservations', '[]'::json)), '[]')
             from availability_slots s where s.trainer_id = '$T' and s.session_date >= current_date")
  printf '{"trainerId":"%s","revision":%s,"weekly":%s,"slots":%s}' "$T" "$revision" "$weekly" "$slots" \
    | (source ~/.nvm/nvm.sh >/dev/null 2>&1; nvm use 20 >/dev/null 2>&1; node scripts/lib/capture-window-plan.mjs)
}
applyout() { # applyout <salida de compute>
  local plan revision
  plan=$(python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["plan"], separators=(",", ":")))' <<<"$1")
  revision=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["revision"])' <<<"$1")
  q "select apply_window_plan('$T', '$plan'::jsonb, $revision)"
}

A=$(compute)
checkre "S1 A calcula con el día abierto: su plan crea 09-13 el $G" "\"session_date\":\"$G\",\"start_time\":\"09:00:00\",\"end_time\":\"13:00:00\"" "$A"
q "delete from trainer_weekly_hours where trainer_id = '$T' and day_of_week = $DOW" >/dev/null   # B apaga el día
B=$(compute)
out=$(applyout "$B")
checkre "S2 B guarda (apaga el día) y sincroniza con la revisión nueva: se aplica" '"created": 0' "$out"
check "S2 publicado ese día tras B" "(nada)" "$(open_on $G)"
before=$(snap)
checkre "S3 A intenta aplicar su plan viejo: rechazado (window_plan_stale)" "window_plan_stale" "$(applyout "$A")"
check "S3 nada cambia: sigue lo de B (el día apagado NO se publica)" "$before|(nada)" "$(snap)|$(open_on $G)"
A2=$(compute)
out=$(applyout "$A2")
checkre "S4 A recalcula con la revisión vigente y aplica: nada que crear" '"created": 0' "$out"
check "S4 sigue sin publicarse" "(nada)" "$(open_on $G)"

# ─── C. Concurrencia ─────────────────────────────────────────────────────────
hold() { # hold <sql> <commit|rollback>: transacción abierta 2 s en segundo plano
  docker exec -i "$NAME" psql -U postgres -d $DB -qtA >/dev/null 2>&1 <<SQL &
begin;
$1;
select pg_sleep(2);
$2;
SQL
  sleep 0.7
}
timed() {
  q "do \$\$ declare t0 timestamptz := clock_timestamp(); begin $1; raise notice 'ok waited_ms=%', (extract(epoch from clock_timestamp() - t0) * 1000)::int; exception when others then raise notice '% % waited_ms=%', sqlstate, sqlerrm, (extract(epoch from clock_timestamp() - t0) * 1000)::int; end \$\$" 2>&1 | sed -E 's/^NOTICE: +//'
}
ms() { sed -nE 's/.*waited_ms=([0-9]+).*/\1/p' <<<"$1"; }

R=$(rev $T)
hold "insert into trainer_weekly_hours (trainer_id, day_of_week, start_time, end_time) values ('$T', $DOW, '15:00', '16:00')" commit
r=$(timed "perform apply_window_plan('$T', '{}'::jsonb, $R)"); wait
checkre "C1 cambio de horario en curso → A aplica con la revisión de antes: espera y se rechaza" "window_plan_stale" "$r"
[[ $(ms "$r") -ge 800 ]] && pass "C1 A esperó al cambio de horario ($(ms "$r") ms)" || bad "C1 no esperó ($(ms "$r") ms)"

R=$(rev $T)
hold "select apply_window_plan('$T', '{\"insert\":[{\"session_date\":\"2099-02-02\",\"start_time\":\"09:00\",\"end_time\":\"10:00\"}]}'::jsonb, $R)" commit
r=$(timed "delete from trainer_weekly_hours where trainer_id = '$T' and start_time = '15:00'"); wait
checkre "C2 A aplicando → cambio de horario: el cambio espera a A" "^ok" "$r"
[[ $(ms "$r") -ge 800 ]] && pass "C2 el cambio esperó ($(ms "$r") ms)" || bad "C2 no esperó ($(ms "$r") ms)"
check "C2 A se aplicó con su revisión y el cambio la subió después" "1|$((R + 1))" \
  "$(q "select count(*) from availability_slots where session_date = '2099-02-02'")|$(rev $T)"
checkre "C2 un plan con la revisión de antes del cambio ya no se aplica" "window_plan_stale" "$(q "select apply_window_plan('$T', '{}'::jsonb, $R)")"

exit $fail
