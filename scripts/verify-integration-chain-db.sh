#!/usr/bin/env bash
# Integración de emdash/pagos-paquetes-t3o2n en emdash/integracion-programa:
# la cadena COMPLETA de migraciones 001 → 019 desde una base vacía y la
# interacción entre los triggers de reservas de la 015 (reserva siempre
# dentro de su ventana), la sincronización atómica (014/016) y la
# programación y los créditos de paquetes (017 → 019).
#
# Postgres aislado en Docker (contenedor desechable). No lee .env.local ni
# toca Supabase.
#
#   A. Cadena: 001 → 019 en orden desde vacío (con scripts/db/supabase-stubs.sql),
#      reaplicar 011 → 019 sin errores, triggers de reservations, 019 sin
#      nada que revisar.
#   P. Paquetes con la 015: agendar dentro / fuera; proponer otra fecha dentro
#      / fuera (atómico: la original y el crédito no cambian); insertar a mano
#      fuera → 23514; desagendar; revivir una reserva de paquete (salta antes
#      la guardia de pagos).
#   C. Carreras con la sincronización: agendar → acortar (la sincronización
#      espera y cierra en vez de acortar), acortar → agendar (espera y
#      out_of_window, crédito libre), acortar → proponer (espera, la original
#      sigue pendiente). El plan no borra ventanas con reservas de paquete.
#   I. Integridad de créditos: package_credit_integrity_check sin filas que
#      bloqueen; ninguna reserva viva fuera de su ventana.
#
#   bash scripts/verify-integration-chain-db.sh
set -uo pipefail
cd "$(dirname "$0")/.."

NAME="verify-integration-chain-db-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test postgres:16-alpine >/dev/null || exit 1
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
# La imagen arranca un servidor temporal durante initdb y luego lo reinicia:
# se espera a que el definitivo acepte conexiones (dos "ready" en el log).
for _ in $(seq 1 120); do
  [[ $(docker logs "$NAME" 2>&1 | grep -c 'database system is ready to accept connections') -ge 2 ]] && break
  sleep 0.5
done

fail=0
pass() { echo "ok   - $1"; }
bad() { echo "FAIL - $1"; fail=1; }
DB=chain
q() { docker exec -i "$NAME" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -qtA -c "$1" 2>&1; }
run() { docker exec -i "$NAME" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -q 2>&1; }
check() { if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else bad "$1: esperado «$2», obtenido «$3»"; fi; }
checkre() { if [[ "$3" =~ $2 ]]; then pass "$1"; else bad "$1: no casa /$2/ con «$3»"; fi; }

# ─── A. Cadena completa ──────────────────────────────────────────────────────
for _ in $(seq 1 20); do
  docker exec "$NAME" psql -U postgres -qc "create database $DB" >/dev/null 2>&1 && break
  sleep 0.5
done
run < scripts/db/supabase-stubs.sql >/dev/null || { bad "stubs"; exit 1; }
applied=()
for f in migrations/0*.sql; do
  out=$(run < "$f") || { bad "A1 $f no se aplica: $out"; exit 1; }
  applied+=("$(basename "$f" .sql | cut -c1-3)")
done
check "A1 cadena completa desde vacío, en orden" "001 002 003 004 005 006 007 008 009 010 011 012 013 014 015 016 017 018 019" "${applied[*]}"
for f in migrations/01[1-9]_*.sql; do
  out=$(run < "$f") || bad "A2 $f no se puede reaplicar: $out"
done
pass "A2 011 → 019 se pueden reaplicar"
check "A3 triggers BEFORE de reservations (orden de disparo)" \
  "reservations_inherit_package_credit,reservations_legacy_quarantine,reservations_package_no_revive,reservations_set_session_date,reservations_within_window,update_reservations_updated_at" \
  "$(q "select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'reservations'::regclass and not tgisinternal and (tgtype & 2) = 2")"
check "A4 FK de reservations a availability_slots: RESTRICT (013); a package_sessions: RESTRICT (019)" "r|r" \
  "$(q "select confdeltype from pg_constraint where conrelid = 'reservations'::regclass and confrelid = 'availability_slots'::regclass")|$(q "select confdeltype from pg_constraint where conrelid = 'reservations'::regclass and confrelid = 'package_sessions'::regclass")"
check "A5 apply_window_plan solo con revisión (016); schedule_package_session de la 019" "1|0|1" \
  "$(q "select count(*) from pg_proc where proname = 'apply_window_plan' and pronargs = 3")|$(q "select count(*) from pg_proc where proname = 'apply_window_plan' and pronargs = 2")|$(q "select count(*) from pg_proc where proname = 'schedule_package_session'")"

# ─── Datos ───────────────────────────────────────────────────────────────────
T=11111111-1111-4111-8111-111111111111
PK=22222222-2222-4222-8222-222222222222
D=2099-08-03
id() { printf '00000000-0000-4000-8000-%012d' "$1"; }
W=$(id 1); W2=$(id 2); W3=$(id 3); W4=$(id 4); W5=$(id 5)
S1=$(id 11); S2=$(id 12); S3=$(id 13); S4=$(id 14); S5=$(id 15)
run >/dev/null <<SQL
insert into trainers (id, name) values ('$T', 'T');
insert into client_packages (id, trainer_id, client_name, client_email, sessions_total, price_per_session_normal, price_per_session_discounted, price_total, duration_minutes)
  values ('$PK', '$T', 'Paquete', 'p@x', 5, 300, 270, 1350, 60);
insert into package_sessions (id, client_package_id, session_number) values
  ('$S1', '$PK', 1), ('$S2', '$PK', 2), ('$S3', '$PK', 3), ('$S4', '$PK', 4), ('$S5', '$PK', 5);
insert into availability_slots (id, trainer_id, session_date, start_time, end_time, class_type, status, generated_by_pattern) values
  ('$W',  '$T', '$D', '09:00', '13:00', 'private', 'available', true),
  ('$W2', '$T', '$D', '14:00', '16:00', 'private', 'available', true),
  ('$W3', '$T', '2099-08-04', '09:00', '17:00', 'private', 'available', true),
  ('$W4', '$T', '2099-08-05', '09:00', '17:00', 'private', 'available', true),
  ('$W5', '$T', '2099-08-06', '09:00', '17:00', 'private', 'available', true);
SQL
sched() { # sched <sesión> <ventana> <inicio> → outcome
  q "select outcome from schedule_package_session('$1', '$T', '$2', '$3', 'pending_confirmation')"
}
credit() { q "select status || '|' || coalesce(reservation_id::text, '-') from package_sessions where id = '$1'"; }
REV="(select availability_revision from trainers where id = '$T')"

# ─── P. Paquetes con la 015 ──────────────────────────────────────────────────
check "P1 agendar dentro de la ventana" "scheduled" "$(sched $S1 $W 10:00)"
R1=$(q "select reservation_id from package_sessions where id = '$S1'")
check "P1 reserva con su crédito (019) y dentro de la ventana" "$S1|10:00:00|11:00:00" "$(q "select package_session_id || '|' || start_time || '|' || end_time from reservations where id = '$R1'")"
check "P2 agendar fuera (12:30–13:30 en 09–13): out_of_window, nada creado" "out_of_window|not_scheduled|-|1" \
  "$(sched $S2 $W 12:30)|$(credit $S2)|$(q "select count(*) from reservations")"
checkre "P3 insertar a mano una reserva de paquete fuera de la ventana → 23514 de la 015" "reservations_within_window" \
  "$(q "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, status, start_time, end_time, duration_minutes, package_session_id) values ('$T', '$W', 'x', 'x@x', 'pending_confirmation', '12:30', '13:30', 60, '$S2')")"
check "P4 proponer otra fecha fuera de la ventana destino (15:30–16:30 en 14–16): out_of_window" "out_of_window" \
  "$(q "select outcome from propose_reschedule('$R1', '$T', '$W2', '15:30', 'tok-fuera-0000000001')")"
check "P4 la original sigue pendiente y el crédito apunta a ella" "pending_confirmation|scheduled|$R1" \
  "$(q "select status from reservations where id = '$R1'")|$(credit $S1)"
check "P5 proponer dentro (14:00–15:00): proposed" "proposed" "$(q "select outcome from propose_reschedule('$R1', '$T', '$W2', '14:00', 'tok-dentro-000000002')")"
P1=$(q "select id from reservations where proposal_token = 'tok-dentro-000000002'")
check "P5 la propuesta hereda el crédito y el crédito pasa a ella; la original needs_reschedule" "$S1|scheduled|$P1|needs_reschedule" \
  "$(q "select package_session_id from reservations where id = '$P1'")|$(credit $S1)|$(q "select status from reservations where id = '$R1'")"
checkre "P6 revivir la original (no viva, de paquete): salta antes la guardia de pagos que la de la 015" "reservations_package_no_revive" \
  "$(q "update reservations set status = 'pending_confirmation', start_time = '12:30', end_time = '13:30' where id = '$R1'")"
check "P7 desagendar: cancela la viva y libera el crédito" "unscheduled|not_scheduled|-" \
  "$(q "select outcome from unschedule_package_session('$S1', '$T', '$P1')")|$(credit $S1)"

# ─── C. Carreras con la sincronización (014/016) ─────────────────────────────
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
  q "do \$\$ declare t0 timestamptz := clock_timestamp(); r text; begin $1; raise notice 'ok % waited_ms=%', r, (extract(epoch from clock_timestamp() - t0) * 1000)::int; exception when others then raise notice '% % waited_ms=%', sqlstate, sqlerrm, (extract(epoch from clock_timestamp() - t0) * 1000)::int; end \$\$" 2>&1 | sed -E 's/^NOTICE: +//'
}
ms() { sed -nE 's/.*waited_ms=([0-9]+).*/\1/p' <<<"$1"; }

# Agendar → acortar
hold "select * from schedule_package_session('$S3', '$T', '$W3', '14:00', 'confirmed')" commit
r=$(timed "select apply_window_plan('$T', '{\"update_end\":[{\"id\":\"$W3\",\"end_time\":\"12:00\"}]}'::jsonb, $REV)::text into r"); wait
checkre "C1 agendar → acortar: la sincronización espera a la reserva de paquete" "^ok .*\"shrink_blocked\": 1" "$r"
[[ $(ms "$r") -ge 800 ]] && pass "C1 esperó $(ms "$r") ms" || bad "C1 no esperó ($(ms "$r") ms)"
check "C1 la ventana no se acorta (se cierra) y el crédito sigue con su reserva dentro" "17:00:00|blocked|scheduled" \
  "$(q "select end_time || '|' || status from availability_slots where id = '$W3'")|$(q "select status from package_sessions where id = '$S3'")"

# Acortar → agendar
hold "select apply_window_plan('$T', '{\"update_end\":[{\"id\":\"$W4\",\"end_time\":\"12:00\"}]}'::jsonb, $REV)" commit
r=$(timed "select outcome into r from schedule_package_session('$S4', '$T', '$W4', '14:00', 'confirmed')"); wait
checkre "C2 acortar → agendar: agendar espera y ve el rango nuevo: out_of_window" "^ok out_of_window" "$r"
[[ $(ms "$r") -ge 800 ]] && pass "C2 esperó $(ms "$r") ms" || bad "C2 no esperó ($(ms "$r") ms)"
check "C2 ventana 09–12 y crédito libre (nada a medias)" "12:00:00|not_scheduled|-" \
  "$(q "select end_time from availability_slots where id = '$W4'")|$(credit $S4)"

# Acortar → proponer otra fecha
check "C3 prep: agendar S5 en W (09–13) a las 09:00" "scheduled" "$(sched $S5 $W 09:00)"
R5=$(q "select reservation_id from package_sessions where id = '$S5'")
hold "select apply_window_plan('$T', '{\"update_end\":[{\"id\":\"$W5\",\"end_time\":\"12:00\"}]}'::jsonb, $REV)" commit
r=$(timed "select outcome into r from propose_reschedule('$R5', '$T', '$W5', '14:00', 'tok-carrera-00000003')"); wait
checkre "C3 acortar → proponer: espera y out_of_window" "^ok out_of_window" "$r"
check "C3 la original sigue pendiente y el crédito con ella" "pending_confirmation|scheduled|$R5" \
  "$(q "select status from reservations where id = '$R5'")|$(credit $S5)"

check "C4 el plan no borra una ventana con reservas de paquete: la cierra (kept)" "t" \
  "$(q "select (apply_window_plan('$T', '{\"delete\":[\"$W2\"]}'::jsonb, $REV)->>'kept')::int = 1")"
check "C4 la ventana sigue, con su historial de paquete" "1|blocked" \
  "$(q "select count(*) from availability_slots where id = '$W2'")|$(q "select status from availability_slots where id = '$W2'")"

# ─── I. Integridad ───────────────────────────────────────────────────────────
check "I1 package_credit_integrity_check sin filas que bloqueen" "0" "$(q "select count(*) from package_credit_integrity_check where bloquea")"
check "I2 ninguna reserva viva fuera de su ventana" "0" \
  "$(q "select count(*) from reservations r join availability_slots s on s.id = r.availability_slot_id where coalesce(r.status,'') not in ('cancelled','canceled','needs_reschedule') and (r.start_time < s.start_time or r.end_time > s.end_time)")"
check "I3 cada crédito agendado apunta a exactamente una reserva viva suya" "0" \
  "$(q "select count(*) from package_sessions ps where ps.status = 'scheduled' and (select count(*) from reservations r where r.package_session_id = ps.id and coalesce(r.status,'') not in ('cancelled','canceled','needs_reschedule')) <> 1")"

exit $fail
