#!/usr/bin/env bash
# Migración 021 (idempotencia y límite de POST /api/reservations) en un
# PostgreSQL aislado: contenedor Docker desechable, la cadena 001 → 021 desde
# vacío con scripts/db/supabase-stubs.sql. No lee .env.local ni toca Supabase.
#
#   I. create_booking_request: crear; repetir (misma clave y huella) devuelve
#      los mismos ids sin filas nuevas; otra huella → key_reused; la misma
#      clave en otro scope es independiente.
#   T. Atomicidad: solape (23P01, 008) y fuera de ventana (23514, 015) → no
#      queda nada, ni reservas (tampoco las otras filas de la petición) ni la
#      clave; la misma clave puede reintentarse después.
#   C. Concurrencia con la misma clave: la segunda espera a la primera y
#      recibe su respuesta (commit) o reserva ella (rollback); 10 a la vez →
#      1 created + 9 replayed y una sola reserva.
#   R. rate_limit_consume: 20 a la vez con límite 5 → exactamente 5; Retry-
#      After dentro de la ventana; para en el primer cubo agotado (el del
#      entrenador no se gasta); la ventana siguiente se abre.
#   S. Seguridad: RLS; anon/authenticated sin tablas ni funciones aunque
#      Supabase dé permisos por defecto; service_role sí. 021 se reaplica.
#
#   bash scripts/verify-booking-idempotency-db.sh
set -uo pipefail
cd "$(dirname "$0")/.."

NAME="verify-booking-idempotency-db-$$"
TMP=$(mktemp -d)
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test postgres:16-alpine >/dev/null || exit 1
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
for _ in $(seq 1 120); do
  [[ $(docker logs "$NAME" 2>&1 | grep -c 'database system is ready to accept connections') -ge 2 ]] && break
  sleep 0.5
done

fail=0
pass() { echo "ok   - $1"; }
bad() { echo "FAIL - $1"; fail=1; }
DB=idem
q() { docker exec -i "$NAME" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -qtA -c "$1" 2>&1; }
run() { docker exec -i "$NAME" psql -U postgres -d $DB -v ON_ERROR_STOP=1 -q 2>&1; }
check() { if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else bad "$1: esperado «$2», obtenido «$3»"; fi; }
checkre() { if [[ "$3" =~ $2 ]]; then pass "$1"; else bad "$1: no casa /$2/ con «$3»"; fi; }

for _ in $(seq 1 20); do
  docker exec "$NAME" psql -U postgres -qc "create database $DB" >/dev/null 2>&1 && break
  sleep 0.5
done
run < scripts/db/supabase-stubs.sql >/dev/null || { bad "stubs"; exit 1; }
# Como Supabase: permisos por defecto para anon/authenticated en lo nuevo. La
# 021 tiene que quitárselos ella.
q "alter default privileges in schema public grant all on tables to anon, authenticated; alter default privileges in schema public grant all on functions to anon, authenticated" >/dev/null
for f in migrations/0*.sql; do
  out=$(run < "$f") || { bad "cadena: $f no se aplica: $out"; exit 1; }
done
out=$(run < migrations/021_booking_idempotency_rate_limit.sql) && pass "S0 021 se reaplica sin errores" || bad "S0 021 no se reaplica: $out"

# ─── Datos ───────────────────────────────────────────────────────────────────
T=11111111-1111-4111-8111-111111111111
W=22222222-2222-4222-8222-222222222222
D=2099-09-07
run >/dev/null <<SQL
insert into trainers (id, name) values ('$T', 'T');
insert into availability_slots (id, trainer_id, session_date, start_time, end_time, class_type, status, generated_by_pattern)
  values ('$W', '$T', '$D', '08:00', '20:00', 'private', 'available', true);
SQL

G1="guest:$(printf 'a%.0s' {1..64})"
G2="guest:$(printf 'b%.0s' {1..64})"
H1=$(printf '1%.0s' {1..64})
H2=$(printf '2%.0s' {1..64})
key() { printf '00000000-0000-4000-9000-%012d' "$1"; }
row() { # row <inicio> <fin>
  printf '{"trainer_id":"%s","availability_slot_id":"%s","player_id":null,"client_name":"Ana","client_email":"ana@example.com","client_phone":"0123","whatsapp_opt_in":false,"client_message":null,"player_count":1,"start_time":"%s","end_time":"%s","duration_minutes":60,"price":300,"status":"pending_confirmation","created_at":"2099-01-01T00:00:00Z"}' "$T" "$W" "$1" "$2"
}
rows() { local out="" s; while [[ $# -gt 0 ]]; do s=$(row "$1" "$2"); out+="${out:+,}$s"; shift 2; done; echo "[$out]"; }
RESP='{"success":true,"total":300}'
create_sql() { # create_sql <scope> <clave> <huella> <filas>
  echo "select outcome || '|' || coalesce(array_to_string(reservation_ids, ','), '-') || '|' || coalesce(response->>'total', '-') || '|' || coalesce(jsonb_array_length(response->'reservationIds')::text, '-') from create_booking_request('$1', '$2', '$3', '$4'::jsonb, '$RESP'::jsonb)"
}
create() { q "set role service_role; $(create_sql "$@")"; }
live() { q "select count(*) from reservations where status <> 'cancelled'"; }

# ─── I. Crear / repetir / reutilizar ─────────────────────────────────────────
K1=$(key 1)
r1=$(create "$G1" "$K1" "$H1" "$(rows 09:00 10:00 10:00 11:00)")
checkre "I1 crear: created con 2 ids, respuesta con total e ids" "^created\|[0-9a-f-]{36},[0-9a-f-]{36}\|300\|2$" "$r1"
IDS1=$(cut -d'|' -f2 <<<"$r1")
check "I1 2 reservas y la clave guardada con los mismos ids" "2|$IDS1" \
  "$(live)|$(q "select array_to_string(reservation_ids, ',') from booking_requests where scope = '$G1' and idempotency_key = '$K1'")"
r=$(create "$G1" "$K1" "$H1" "$(rows 09:00 10:00 10:00 11:00)")
check "I2 repetir (respuesta perdida): replayed, mismos ids, ninguna fila nueva" "replayed|$IDS1|300|2|2" "$r|$(live)"
r=$(create "$G1" "$K1" "$H2" "$(rows 12:00 13:00)")
check "I3 misma clave, otra huella: key_reused, nada creado ni enseñado" "key_reused|-|-|-|2" "$r|$(live)"
r=$(create "$G2" "$K1" "$H1" "$(rows 12:00 13:00)")
checkre "I4 la misma clave en otro scope es otra petición (no ve la del primero)" "^created\|[0-9a-f-]{36}\|300\|1$" "$r"
[[ "$(cut -d'|' -f2 <<<"$r")" != "$IDS1" ]] && pass "I4 ids distintos a los del otro scope" || bad "I4 devolvió los ids de otro scope"
checkre "I5 scope o entrada inválidos → 22023" "booking_request_invalid" "$(create "anon:x" "$(key 5)" "$H1" "$(rows 14:00 15:00)")"
checkre "I5 sin filas → 22023" "booking_request_invalid" "$(create "$G1" "$(key 5)" "$H1" "[]")"

# ─── T. Atomicidad ───────────────────────────────────────────────────────────
before=$(live)
K2=$(key 2)
r=$(create "$G1" "$K2" "$H1" "$(rows 15:00 16:00 09:30 10:30)")
checkre "T1 una fila libre + una que solapa: 23P01 de la 008" "reservations_no_overlap" "$r"
check "T1 no queda ninguna fila (tampoco la libre) ni la clave" "$before|0" \
  "$(live)|$(q "select count(*) from booking_requests where idempotency_key = '$K2'")"
r=$(create "$G1" "$K2" "$H1" "$(rows 15:00 16:00)")
checkre "T2 la misma clave se puede reintentar tras el rechazo" "^created\|" "$r"
K3=$(key 3)
r=$(create "$G1" "$K3" "$H1" "$(rows 19:30 20:30)")
checkre "T3 fuera de la ventana: 23514 de la 015" "reservations_within_window" "$r"
check "T3 nada guardado" "0" "$(q "select count(*) from booking_requests where idempotency_key = '$K3'")"

# ─── C. Concurrencia con la misma clave ──────────────────────────────────────
hold() { # hold <sql> <commit|rollback>: transacción abierta 2 s en segundo plano
  docker exec -i "$NAME" psql -U postgres -d $DB -qtA >/dev/null 2>&1 <<SQL &
set role service_role;
begin;
$1;
select pg_sleep(2);
$2;
SQL
  sleep 0.7
}
timed() { # timed <sql que devuelve una fila de texto> → "<texto> waited_ms=<n>"
  q "set role service_role; select ($1) || ' waited_ms=' || (extract(epoch from clock_timestamp() - now()) * 1000)::int"
}
ms() { sed -nE 's/.*waited_ms=([0-9]+).*/\1/p' <<<"$1"; }

K4=$(key 4)
hold "$(create_sql "$G1" "$K4" "$H1" "$(rows 16:00 17:00)")" commit
r=$(timed "$(create_sql "$G1" "$K4" "$H1" "$(rows 16:00 17:00)")"); wait
checkre "C1 misma clave mientras la primera sigue abierta → espera y replayed" "^replayed\|[0-9a-f-]{36}\|300\|1 " "$r"
[[ $(ms "$r") -ge 800 ]] && pass "C1 esperó $(ms "$r") ms" || bad "C1 no esperó ($(ms "$r") ms)"
check "C1 una sola reserva a las 16:00" "1" "$(q "select count(*) from reservations where start_time = '16:00'")"
check "C1 recibe los ids de la primera" "$(q "select array_to_string(reservation_ids, ',') from booking_requests where idempotency_key = '$K4'")" "$(cut -d'|' -f2 <<<"$r")"

K5=$(key 5)
hold "$(create_sql "$G1" "$K5" "$H1" "$(rows 17:00 18:00)")" rollback
r=$(timed "$(create_sql "$G1" "$K5" "$H1" "$(rows 17:00 18:00)")"); wait
checkre "C2 la primera se deshace → la que esperaba reserva ella (created)" "^created\|" "$r"
[[ $(ms "$r") -ge 800 ]] && pass "C2 esperó $(ms "$r") ms" || bad "C2 no esperó ($(ms "$r") ms)"
check "C2 una sola reserva a las 17:00" "1" "$(q "select count(*) from reservations where start_time = '17:00'")"

K6=$(key 6)
SQL6=$(create_sql "$G2" "$K6" "$H1" "$(rows 18:00 19:00)")
for i in $(seq 1 10); do
  q "set role service_role; $SQL6" >"$TMP/c3-$i" &
done
wait
check "C3 10 a la vez con la misma clave: 1 created + 9 replayed" "1|9" \
  "$(cat "$TMP"/c3-* | grep -c '^created|')|$(cat "$TMP"/c3-* | grep -c '^replayed|')"
check "C3 todas con los mismos ids; una sola reserva a las 18:00" "1|1" \
  "$(cut -d'|' -f2 "$TMP"/c3-* | sort -u | wc -l | tr -d ' ')|$(q "select count(*) from reservations where start_time = '18:00'")"

# Claves distintas a la misma hora a la vez: la 008 deja una.
for i in $(seq 1 6); do
  q "set role service_role; $(create_sql "$G2" "$(key $((60 + i)))" "$H1" "$(rows 19:00 20:00)")" >"$TMP/c4-$i" &
done
wait
check "C4 6 claves distintas a la misma hora: 1 created, el resto 23P01, una reserva" "1|5|1" \
  "$(cat "$TMP"/c4-* | grep -c '^created|')|$(cat "$TMP"/c4-* | grep -c 'reservations_no_overlap')|$(q "select count(*) from reservations where start_time = '19:00'")"

# ─── R. Límite ───────────────────────────────────────────────────────────────
consume() { q "set role service_role; select allowed || '|' || coalesce(bucket, '-') || '|' || retry_after from rate_limit_consume($1)"; }
for i in $(seq 1 20); do
  consume "array['email:burst'], array[5], 600" >"$TMP/r1-$i" &
done
wait
check "R1 20 a la vez con límite 5: exactamente 5 pasan" "5|15" \
  "$(cat "$TMP"/r1-* | grep -c '^true|')|$(cat "$TMP"/r1-* | grep -c '^false|email:burst|')"
ra=$(cat "$TMP"/r1-* | grep '^false|' | head -1 | cut -d'|' -f3)
[[ "$ra" -ge 1 && "$ra" -le 600 ]] && pass "R1 Retry-After dentro de la ventana ($ra s)" || bad "R1 Retry-After fuera de rango: «$ra»"
check "R1 contador compartido: 20 golpes en un solo registro" "20" "$(q "select sum(hits) from rate_limit_counters where bucket = 'email:burst'")"

for i in 1 2 3; do consume "array['email:solo','trainer:$T'], array[1, 100], 600" >/dev/null; done
check "R2 bloqueado por su email, no gasta el cupo del entrenador" "3|1" \
  "$(q "select hits from rate_limit_counters where bucket = 'email:solo'")|$(q "select hits from rate_limit_counters where bucket = 'trainer:$T'")"
check "R2 el cubo que bloquea es el primero agotado" "false|email:solo" "$(consume "array['email:solo','trainer:$T'], array[1, 100], 600" | cut -d'|' -f1,2)"

consume "array['phone:roll'], array[1], 2" >/dev/null
r=$(consume "array['phone:roll'], array[1], 2")
checkre "R3 ventana de 2 s: el segundo se bloquea con Retry-After 1–2" "^false\|phone:roll\|[12]$" "$r"
sleep "$(cut -d'|' -f3 <<<"$r")"; sleep 0.2
checkre "R3 en la ventana siguiente vuelve a pasar" "^true\|" "$(consume "array['phone:roll'], array[1], 2")"
checkre "R4 cubos y límites de distinta longitud → 22023" "rate_limit_invalid" "$(consume "array['a','b'], array[1], 600")"

# ─── S. Seguridad ────────────────────────────────────────────────────────────
check "S1 RLS activo en las dos tablas" "t|t" \
  "$(q "select relrowsecurity from pg_class where oid = 'public.booking_requests'::regclass")|$(q "select relrowsecurity from pg_class where oid = 'public.rate_limit_counters'::regclass")"
for role in anon authenticated; do
  checkre "S2 $role no lee booking_requests" "permission denied for table booking_requests" "$(q "set role $role; select * from booking_requests")"
  checkre "S2 $role no escribe rate_limit_counters" "permission denied for table rate_limit_counters" "$(q "set role $role; delete from rate_limit_counters")"
  checkre "S2 $role no ejecuta create_booking_request" "permission denied for function create_booking_request" "$(q "set role $role; $(create_sql "$G1" "$(key 90)" "$H1" "$(rows 08:00 09:00)")")"
  checkre "S2 $role no ejecuta rate_limit_consume" "permission denied for function rate_limit_consume" "$(q "set role $role; select * from rate_limit_consume(array['x'], array[1], 60)")"
done
check "S3 service_role sí (la app)" "t" "$(q "set role service_role; select count(*) >= 0 from booking_requests")"
check "S4 la respuesta guardada no lleva datos de contacto" "0" \
  "$(q "select count(*) from booking_requests where response::text ~* 'ana@example|0123|Ana'")"

exit $fail
