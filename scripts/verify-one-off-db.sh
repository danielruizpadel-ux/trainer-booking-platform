#!/usr/bin/env bash
# Clase puntual: la protección de la BASE, en un Postgres aislado (Docker,
# contenedor desechable). No toca Supabase.
#
# Esquema mínimo de availability_slots / reservations (las columnas que usan
# la 008 y la clase puntual, con la restricción única real de las ventanas)
# + migrations/008_reservations_no_overlap.sql TAL CUAL. Luego las mismas
# escrituras que hace lib/reservations/one-off.ts:
#   - ventana propia `blocked` + reserva dentro → session_date sale del trigger
#   - otra reserva viva que la solape, en OTRA ventana (abierta o puntual)
#     → 23P01 reservations_no_overlap
#   - misma ventana exacta dos veces → 23505 (restricción única)
#   - cancelada la clase puntual, el tramo vuelve a admitir una reserva
#
#   bash scripts/verify-one-off-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="verify-one-off-db-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test postgres:16-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null && docker exec "$NAME" psql -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done

psql() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql <<'SQL'
create schema extensions;
create table public.trainers (id uuid primary key);
create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id),
  session_date date not null,
  start_time time not null,
  end_time time not null,
  class_type text not null default 'private',
  max_capacity int default 1,
  current_bookings int default 0,
  status text default 'available',
  generated_by_pattern boolean not null default false,
  unique (trainer_id, session_date, start_time, end_time)
);
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  availability_slot_id uuid not null references public.availability_slots(id),
  trainer_id uuid not null references public.trainers(id),
  client_name text not null,
  client_email text not null,
  status text default 'pending_confirmation',
  start_time time,
  end_time time,
  duration_minutes smallint not null default 60
);
SQL
psql < migrations/008_reservations_no_overlap.sql

# expect <descripción> <código esperado | ok> <sql>
fail=0
expect() {
  local what="$1" want="$2" sql="$3" out code
  out=$(docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -v VERBOSITY=verbose -c "$sql" 2>&1) && code=ok || code=$(grep -oE 'ERROR:  [0-9A-Z]{5}' <<<"$out" | head -1 | awk '{print $2}')
  if [[ "$code" == "$want" ]]; then echo "ok   - $what ($code)"; else echo "FAIL - $what: esperado $want, obtenido $code"; echo "$out"; fail=1; fi
}

T=11111111-1111-4111-8111-111111111111
D=2099-01-05
psql -c "insert into trainers values ('$T');"
psql -c "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern)
         values ('00000000-0000-4000-8000-00000000000a', '$T', '$D', '09:00', '13:00', 'available', true);"
psql -c "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time)
         values ('00000000-0000-4000-8000-00000000000a', '$T', 'Base', 'b@x', 'confirmed', '10:00', '11:00');"

expect "ventana puntual blocked 12:30–14:00 (solapa la abierta; no hay restricción entre ventanas)" ok \
  "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern, current_bookings)
   values ('00000000-0000-4000-8000-0000000000b1', '$T', '$D', '12:30', '14:00', 'blocked', false, 1);"
expect "reserva puntual dentro" ok \
  "insert into reservations (id, availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time, duration_minutes)
   values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', '$T', 'Ana', 'a@x', 'confirmed', '12:30', '14:00', 90);"
got=$(docker exec "$NAME" psql -U postgres -tAc "select session_date from reservations where id = '00000000-0000-4000-8000-0000000000c1'")
if [[ "$got" == "$D" ]]; then echo "ok   - session_date de la reserva puntual sale del trigger ($got)"; else echo "FAIL - session_date: $got"; fail=1; fi

expect "reserva en la ventana ABIERTA que pisa la puntual (12:00–13:00)" 23P01 \
  "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time)
   values ('00000000-0000-4000-8000-00000000000a', '$T', 'Web', 'w@x', 'pending_confirmation', '12:00', '13:00');"
expect "otra ventana puntual 13:00–14:00 se crea (la ventana sola no ocupa)" ok \
  "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status, generated_by_pattern)
   values ('00000000-0000-4000-8000-0000000000b2', '$T', '$D', '13:00', '14:00', 'blocked', false);"
expect "…pero su reserva choca con la puntual viva" 23P01 \
  "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time)
   values ('00000000-0000-4000-8000-0000000000b2', '$T', 'Eva', 'e@x', 'confirmed', '13:00', '14:00');"
expect "la misma ventana exacta dos veces (dos peticiones a la vez)" 23505 \
  "insert into availability_slots (trainer_id, session_date, start_time, end_time, status, generated_by_pattern)
   values ('$T', '$D', '12:30', '14:00', 'blocked', false);"
expect "puntual pegada [) 14:00–15:00 no choca" ok \
  "insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status)
   values ('00000000-0000-4000-8000-0000000000b3', '$T', '$D', '14:00', '15:00', 'blocked');
   insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time)
   values ('00000000-0000-4000-8000-0000000000b3', '$T', 'Leo', 'l@x', 'confirmed', '14:00', '15:00');"
expect "cancelar la puntual" ok \
  "update reservations set status = 'cancelled' where id = '00000000-0000-4000-8000-0000000000c1';"
expect "cancelada, el tramo admite otra reserva (reutilizando la ventana blocked)" ok \
  "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time, duration_minutes)
   values ('00000000-0000-4000-8000-0000000000b1', '$T', 'Ana 2', 'a2@x', 'pending_confirmation', '12:30', '14:00', 90);"

exit $fail
