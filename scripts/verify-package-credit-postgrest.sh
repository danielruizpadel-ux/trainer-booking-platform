#!/bin/bash
# R2 — la FK reservations.package_session_id (019) y los embeds de PostgREST.
# Levanta Postgres 16 + PostgREST v12.2.3 LOCALES en una red Docker privada y
# desechable; PostgREST se publica SOLO en 127.0.0.1 en un puerto libre. NUNCA
# Supabase: no lee .env.local. Borra todo al terminar (salvo KEEP=1).
#
# Emula lo imprescindible de Supabase: rol authenticator → service_role
# (BYPASSRLS, con permisos sobre public). Ejecuta el código TypeScript REAL
# con scripts/verify-package-credit-postgrest.mjs:
#   before  017 + 018: embeds con pista, agendar por RPC
#   after   019: sin pista → PGRST201; con pista todo sigue; R2 por la API real
#
#   bash scripts/verify-package-credit-postgrest.sh
set -u
cd "$(dirname "$0")/.."
NET=r2-rest-verify; PG=r2-rest-pg; REST=r2-rest-api
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
cleanup() { [ "${KEEP:-0}" = 1 ] || { docker rm -f "$PG" "$REST" >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1; }; }
trap cleanup EXIT
cleanup
docker network create "$NET" >/dev/null || exit 1
docker run -d --name "$PG" --network "$NET" -e POSTGRES_PASSWORD=local postgres:16-alpine >/dev/null || exit 1
for i in $(seq 1 60); do docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 1
psqlc() { docker exec -i "$PG" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
FAIL=0

psqlc <<'SQL' || exit 1
create role anon nologin; create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login password 'auth' noinherit;
grant service_role to authenticator;
create schema extensions;
grant usage on schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on tables to anon, authenticated;
create table public.trainers (id uuid primary key default gen_random_uuid(), name text, slug text, class_durations smallint[] not null default '{60}', updated_at timestamptz default now());
create table public.availability_slots (
  id uuid primary key default gen_random_uuid(), trainer_id uuid not null references public.trainers(id),
  session_date date not null, start_time time not null, end_time time not null,
  class_type text default 'private', status text default 'available', current_bookings int default 0, max_capacity int default 1,
  updated_at timestamptz default now());
create table public.reservations (
  id uuid primary key default gen_random_uuid(), trainer_id uuid not null references public.trainers(id),
  availability_slot_id uuid references public.availability_slots(id),
  client_name text not null, client_email text not null, client_phone text, notes text, price numeric,
  status text default 'pending_confirmation',
  rescheduled_from_id uuid references public.reservations(id) on delete set null, proposal_token text,
  start_time time, end_time time, duration_minutes smallint not null default 60,
  player_id uuid, client_message text, player_count smallint not null default 1, whatsapp_opt_in boolean,
  created_at timestamptz default now(), updated_at timestamptz default now());
SQL
psqlc < migrations/006_class_packages.sql || exit 1
psqlc -c "alter table public.client_packages add column if not exists duration_minutes smallint not null default 60" || exit 1
psqlc < migrations/008_reservations_no_overlap.sql 2>/dev/null || exit 1
psqlc < migrations/017_package_session_atomic_schedule.sql || exit 1
psqlc < migrations/018_package_credit_preparation.sql || exit 1
psqlc <<'SQL' || exit 1
insert into trainers (id, name, slug) values ('11111111-1111-4111-8111-111111111111', 'T', 't');
insert into availability_slots (id, trainer_id, session_date, start_time, end_time)
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '11111111-1111-4111-8111-111111111111',
         (now() at time zone 'Asia/Kuala_Lumpur')::date + n, '08:00', '20:00'
    from generate_series(1, 6) n;
insert into client_packages (id, trainer_id, client_name, client_email, sessions_total, price_per_session_normal, discount_percent, price_per_session_discounted, price_total, duration_minutes)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Ana','ana@example.com',10,300,10,270,2700,60);
insert into package_sessions (id, client_package_id, session_number)
  select ('bbbbbbbb-bbbb-4bbb-8bbb-' || lpad(n::text, 12, '0'))::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', n from generate_series(1,3) n;
SQL

docker run -d --name "$REST" --network "$NET" -p "127.0.0.1:$PORT:3000" \
  -e PGRST_DB_URI="postgres://authenticator:auth@$PG:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=service_role postgrest/postgrest:v12.2.3 >/dev/null || exit 1
URL="http://127.0.0.1:$PORT"
# Espera a que PostgREST tenga su caché de esquema (y, tras la 019, la columna nueva).
ready() { for i in $(seq 1 60); do curl -s "$URL/$1" | grep -q '^\[' && return 0; sleep 1; done; echo "  FAIL PostgREST no sirve /$1"; FAIL=1; return 1; }
ready "trainers?select=id" || exit 1

echo "== fase before (017 + 018, sin 019)"
out=$(POSTGREST_URL="$URL" PHASE=before node --test scripts/verify-package-credit-postgrest.mjs 2>&1); rc=$?
echo "$out" | grep -E "^(not )?ok|^# (pass|fail)"
[ $rc = 0 ] || { FAIL=1; echo "$out" | grep -A20 "^not ok" | head -40; }

# Una reserva histórica muerta, sin evidencia (web, cancelada): irá a cuarentena.
psqlc -c "insert into reservations (id, trainer_id, availability_slot_id, client_name, client_email, notes, status, start_time, end_time) values ('cccccccc-cccc-4ccc-8ccc-0000000000c1','11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000005','Mia','mia@example.com','reserva web','cancelled','15:00','16:00')" >/dev/null || exit 1
echo "== 019 (informe de la 018: solo la muerta sin clasificar, que no bloquea)"
psqlc -At -c "select string_agg(problema || '=' || n, ' ') from (select problema, count(*) n from package_credit_backfill_report group by 1) x"
psqlc < migrations/019_package_credit_single_live.sql || exit 1
ready "reservations?select=package_session_id&limit=1" || exit 1

echo "== fase after (019)"
out=$(POSTGREST_URL="$URL" PHASE=after node --test scripts/verify-package-credit-postgrest.mjs 2>&1); rc=$?
echo "$out" | grep -E "^(not )?ok|^# (pass|fail)"
[ $rc = 0 ] || { FAIL=1; echo "$out" | grep -A20 "^not ok" | head -40; }

echo; [ $FAIL = 0 ] && echo "TODO OK" || echo "HAY FALLOS"
exit $FAIL
