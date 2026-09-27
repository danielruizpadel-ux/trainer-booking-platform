#!/usr/bin/env bash
# Paso de la base real a 011 → 021 (docs/PASO_A_PRODUCCION.md) en PostgreSQL
# aislado: contenedor Docker desechable. No lee .env.local ni toca Supabase.
#
# Base "como la real": scripts/db/deployed-schema.sql + 002 + 004 → 010, más
# lo que existe allí y no está en migrations/ (email_logs y whatsapp_logs con
# FK a reservas —una NO ACTION y otra CASCADE, para probar que la limpieza no
# depende de la acción—, public.users, reservations_backup_008) y datos
# representativos: dos entrenadores, ventanas pasadas y futuras (una 'full' y
# una 'blocked'), reservas en todos los estados, una cadena de propuestas,
# una reserva de jugador, paquetes con sesiones enlazadas, reservas vivas sin
# enlace después del primer paquete (lo que en la real bloquea la 019) y
# avisos con y sin reserva.
#
#   L. ops/produccion-021/02_limpieza_datos_prueba.sql: sin rellenar, con
#      recuentos que ya no cuadran, con una FK o un trigger desconocidos y con
#      un escritor con la tabla bloqueada → se para sin cambiar nada; ensayo →
#      nada guardado; borrar → solo reservas, paquetes y dependientes, lo
#      conservado idéntico (recuentos por tabla), ventanas corregidas, la
#      copia de la 008 intacta; se puede repetir.
#   M. Después, 011 → 021 en orden sin decisiones: informe de la 018 vacío,
#      la 019 se aplica, y ops/produccion-021/03_verificacion.sql da V1 todo
#      true, V2 vacía y V3 todo false.
#   X. Control: sin limpiar, la 019 se niega (viva_sin_clasificar); limpiar
#      con 011 → 018 ya aplicadas (y una decisión de la 018) también vale, y
#      tras 019 → 021 con reservas nuevas de paquete y de la web (FK RESTRICT
#      de la 019, cuarentena, booking_requests) la limpieza sigue funcionando.
#
#   bash scripts/verify-prod-transition-db.sh
set -uo pipefail
cd "$(dirname "$0")/.."

NAME="verify-prod-transition-db-$$"
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
DB=
q() { docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qtA -c "$1" 2>&1; }
run() { docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q 2>&1; }
check() { if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else bad "$1: esperado «$2», obtenido «$3»"; fi; }
checkre() { if [[ "$3" =~ $2 ]]; then pass "$1"; else bad "$1: no casa /$2/ con «$(head -c 400 <<<"$3")»"; fi; }

CLEANUP=ops/produccion-021/02_limpieza_datos_prueba.sql
VERIFY=ops/produccion-021/03_verificacion.sql

T1=11111111-1111-4111-8111-111111111111
T2=22222222-2222-4222-8222-222222222222
id() { printf '00000000-0000-4000-8000-%012d' "$1"; }
FUT=2099-10-05
PAST=2026-09-01

make_db() { # make_db <nombre>: base como la real, con datos
  DB=$1
  for _ in $(seq 1 20); do
    docker exec "$NAME" psql -U postgres -qc "create database $DB" >/dev/null 2>&1 && break
    sleep 0.5
  done
  run < scripts/db/supabase-stubs.sql >/dev/null || { bad "stubs"; exit 1; }
  run < scripts/db/deployed-schema.sql >/dev/null || { bad "deployed-schema"; exit 1; }
  for f in migrations/002_*.sql migrations/00[4-9]_*.sql migrations/010_*.sql; do
    out=$(run < "$f") || { bad "base: $f no se aplica: $out"; exit 1; }
  done
  run >/dev/null <<SQL || { bad "fixture"; exit 1; }
-- Lo que existe en la real y no está en migrations/ (docs/DATABASE.md).
create table public.users (id uuid primary key default gen_random_uuid(), email text);
create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations (id),                    -- NO ACTION
  recipient_email text not null, subject text, status text default 'sent', error_message text,
  created_at timestamptz default now());
create table public.whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations (id) on delete cascade,  -- CASCADE a propósito
  phone_number text not null, message text, status text default 'sent', error_message text,
  created_at timestamptz default now());

insert into auth.users (id, email) values ('$(id 901)', 'dani@x'), ('$(id 902)', 'mauri@x'), ('$(id 903)', 'jugador@x'), ('$(id 904)', 'otro@x');
insert into public.trainers (id, slug, auth_user_id) values ('$T1', 'daniel-ruiz', '$(id 901)'), ('$T2', 'mauri', '$(id 902)');
insert into public.players (id, auth_user_id, email, full_name, phone) values ('$(id 801)', '$(id 903)', 'jugador@x', 'Jugador', '0123456789');
insert into public.player_trainers (player_id, trainer_id, status, source) values ('$(id 801)', '$T1', 'active', 'self_signup');
insert into public.trainer_session_prices (trainer_id, duration_minutes, player_count, price_rm)
  select t, d, p, 300 from unnest(array['$T1'::uuid, '$T2'::uuid]) t, unnest(array[60, 90]) d, generate_series(1, 4) p
  on conflict do nothing;
insert into public.trainer_weekly_hours (trainer_id, day_of_week, start_time, end_time) values ('$T1', 1, '09:00', '17:00'), ('$T2', 2, '10:00', '14:00');
insert into public.trainer_availability_overrides (trainer_id, override_date, is_blocked) values ('$T1', '2099-12-25', true);

insert into public.availability_slots (id, trainer_id, session_date, start_time, end_time, status, current_bookings, generated_by_pattern) values
  ('$(id 1)', '$T1', '$FUT', '09:00', '17:00', 'available', 3, true),
  ('$(id 2)', '$T1', '2099-10-06', '09:00', '11:00', 'full', 2, true),
  ('$(id 3)', '$T1', '2099-10-07', '09:00', '17:00', 'blocked', 1, true),
  ('$(id 4)', '$T1', '$PAST', '09:00', '17:00', 'available', 1, true),
  ('$(id 5)', '$T2', '$FUT', '10:00', '14:00', 'available', 1, true),
  ('$(id 6)', '$T2', '2099-10-08', '10:00', '14:00', 'available', 0, true);

-- Paquete del entrenador 1 (antes de las reservas: las vivas sin enlace entran en el informe de la 018).
insert into public.client_packages (id, trainer_id, client_name, client_email, sessions_total, price_per_session_normal,
  price_per_session_discounted, price_total, duration_minutes, created_at) values
  ('$(id 301)', '$T1', 'Cliente paquete', 'pk@x', 5, 300, 270, 1350, 60, '2026-08-01'),
  ('$(id 302)', '$T1', 'Cliente paquete 2', 'pk2@x', 10, 300, 255, 2550, 60, '2026-08-15');
insert into public.package_sessions (id, client_package_id, session_number)
  select ('00000000-0000-4000-8000-' || lpad((400 + n)::text, 12, '0'))::uuid, '$(id 301)', n from generate_series(1, 5) n;
insert into public.package_sessions (id, client_package_id, session_number)
  select ('00000000-0000-4000-8000-' || lpad((500 + n)::text, 12, '0'))::uuid, '$(id 302)', n from generate_series(1, 10) n;

insert into public.reservations (id, availability_slot_id, trainer_id, client_name, client_email, client_phone, status,
  start_time, end_time, duration_minutes, price, created_at, player_id, whatsapp_opt_in, notes) values
  ('$(id 101)', '$(id 1)', '$T1', 'Web', 'w@x', '1', 'pending_confirmation', '09:00', '10:00', 60, 300, '2026-09-10', null, true, null),
  ('$(id 102)', '$(id 1)', '$T1', 'Jugador', 'jugador@x', '0123456789', 'confirmed', '10:00', '11:30', 90, 450, '2026-09-11', '$(id 801)', false, null),
  ('$(id 103)', '$(id 1)', '$T1', 'Paquete', 'pk@x', '1', 'confirmed', '12:00', '13:00', 60, 270, '2026-09-12', null, null, 'Paquete de 5 clases · sesión 1/5'),
  ('$(id 104)', '$(id 2)', '$T1', 'Cancelada', 'c@x', '1', 'cancelled', '09:00', '10:00', 60, 300, '2026-09-13', null, null, null),
  ('$(id 105)', '$(id 2)', '$T1', 'Original', 'o@x', '1', 'needs_reschedule', '09:00', '10:00', 60, 300, '2026-09-14', null, null, null),
  ('$(id 107)', '$(id 2)', '$T1', 'Llena', 'l@x', '1', 'confirmed', '10:00', '11:00', 60, 300, '2026-09-14', null, null, null),
  ('$(id 108)', '$(id 3)', '$T1', 'Día apagado', 'a@x', '1', 'pending_confirmation', '09:00', '10:00', 60, 300, '2026-09-15', null, null, null),
  ('$(id 109)', '$(id 4)', '$T1', 'Pasada', 'p@x', '1', 'completed', '09:00', '10:00', 60, 300, '2026-08-20', null, null, null),
  ('$(id 110)', '$(id 5)', '$T2', 'Mauri', 'm@x', '1', 'pending_confirmation', '10:00', '11:00', 60, 300, '2026-09-16', null, true, null);
-- Propuesta de otra fecha sobre la 105 (cadena rescheduled_from_id).
insert into public.reservations (id, availability_slot_id, trainer_id, client_name, client_email, client_phone, status,
  start_time, end_time, duration_minutes, price, created_at, rescheduled_from_id, proposal_token) values
  ('$(id 106)', '$(id 1)', '$T1', 'Original', 'o@x', '1', 'reschedule_proposed', '14:00', '15:00', 60, 300, '2026-09-17', '$(id 105)', 'tok-prueba-000000001');
update public.package_sessions set reservation_id = '$(id 103)', status = 'scheduled' where id = '$(id 401)';
update public.package_sessions set reservation_id = '$(id 104)', status = 'not_scheduled' where id = '$(id 402)';

insert into public.email_logs (reservation_id, recipient_email, subject, status) values
  ('$(id 101)', 'w@x', 'Recibida', 'skipped'), ('$(id 102)', 'jugador@x', 'Recibida', 'skipped'),
  ('$(id 110)', 'm@x', 'Recibida', 'skipped'), (null, 'suelto@x', 'Sin reserva', 'skipped');
insert into public.whatsapp_logs (reservation_id, phone_number, message, status) values
  ('$(id 101)', '1', 'hola', 'skipped'), ('$(id 110)', '1', 'hola', 'skipped'), (null, '2', 'suelto', 'skipped');

-- Copia manual de la 008 (CTAS: sin FKs), con una fila que ya no está en reservations.
create table public.reservations_backup_008 as select * from public.reservations;
insert into public.reservations_backup_008 (id, availability_slot_id, trainer_id, client_name, client_email, status, duration_minutes, player_count)
  values ('$(id 199)', '$(id 1)', '$T1', 'Solo en la copia', 's@x', 'cancelled', 60, 1);
SQL
}

counts() { # recuentos de las tablas conservadas y limpiadas
  q "select concat_ws('|',
      (select count(*) from auth.users), (select count(*) from players), (select count(*) from player_trainers),
      (select count(*) from trainers), (select count(*) from users), (select count(*) from class_types),
      (select count(*) from trainer_session_prices), (select count(*) from trainer_weekly_hours),
      (select count(*) from trainer_availability_overrides), (select count(*) from availability_slots),
      (select count(*) from reservations_backup_008), (select count(*) from reservations),
      (select count(*) from client_packages), (select count(*) from package_sessions),
      (select count(*) from email_logs), (select count(*) from whatsapp_logs))"
}
fill() { # fill <modo> → archivo de limpieza con el PASO 0 rellenado con C5
  local vals
  vals=$(q "select concat_ws(E'\t', (select count(*) from reservations), coalesce((select max(created_at)::text from reservations), ''),
            (select count(*) from client_packages), (select count(*) from package_sessions),
            coalesce((select max(created_at)::text from client_packages), ''))")
  python3 - "$CLEANUP" "$1" "$vals" > "$TMP/limpieza.sql" <<'PY'
import sys
src, modo, vals = open(sys.argv[1]).read(), sys.argv[2], sys.argv[3].split('\t')
lit = lambda v: f"'{v}'::text" if v else "null::text"
for ph, val in [("null::bigint /*RESERVAS_TOTAL*/", f"{vals[0]}::bigint"),
                ("null::text   /*ULTIMA_RESERVA*/", lit(vals[1])),
                ("null::bigint /*PAQUETES_TOTAL*/", f"{vals[2]}::bigint"),
                ("null::bigint /*SESIONES_TOTAL*/", f"{vals[3]}::bigint"),
                ("null::text   /*ULTIMO_PAQUETE*/", lit(vals[4])),
                ("'ensayo'::text /*MODO*/", f"'{modo}'::text")]:
    assert src.count(ph) == 1, ph
    src = src.replace(ph, val)
print(src)
PY
}
cleanup() { docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qtA -F'|' < "$TMP/limpieza.sql" 2>&1; }

# ═══ Base 1: limpieza al empezar (procedimiento recomendado) ════════════════
make_db real1
check "F0 base como la real: FK reservas → ventanas CASCADE y reservations_no_overlap" "c|1" \
  "$(q "select confdeltype from pg_constraint where conrelid = 'reservations'::regclass and confrelid = 'availability_slots'::regclass")|$(q "select count(*) from pg_constraint where conname = 'reservations_no_overlap'")"
BEFORE=$(counts)
check "F1 datos de partida" "4|1|1|2|0|3|16|2|1|6|11|10|2|15|4|3" "$BEFORE"

out=$(run < "$CLEANUP")
checkre "L1 sin rellenar el PASO 0 → se para" "rellena el PASO 0" "$out"
check "L1 nada cambia" "$BEFORE" "$(counts)"

fill ensayo; q "insert into reservations (availability_slot_id, trainer_id, client_name, client_email, status, start_time, end_time, duration_minutes) values ('$(id 6)', '$T2', 'Tarde', 't@x', 'pending_confirmation', '10:00', '11:00', 60)" >/dev/null
out=$(cleanup)
checkre "L2 entra una reserva después de medir → se para (¿escritores?)" "las reservas no son las medidas" "$out"
q "delete from reservations where client_name = 'Tarde'" >/dev/null
check "L2 nada cambia" "$BEFORE" "$(counts)"

q "create table public.facturas (id serial primary key, reservation_id uuid references public.reservations (id))" >/dev/null
fill ensayo; out=$(cleanup)
checkre "L3 FK desconocida hacia reservations → se para y la nombra" "FK desconocida.*facturas\.reservation_id" "$out"
q "drop table public.facturas" >/dev/null
q "create function public.audit_x() returns trigger language plpgsql as \$\$ begin return old; end \$\$; create trigger audit_reservas before delete on public.reservations for each row execute function public.audit_x()" >/dev/null
out=$(cleanup)
checkre "L4 trigger desconocido al borrar → se para y lo nombra" "triggers desconocidos.*audit_reservas" "$out"
q "drop trigger audit_reservas on public.reservations; drop function public.audit_x()" >/dev/null
check "L3/L4 nada cambia" "$BEFORE" "$(counts)"

docker exec -i "$NAME" psql -U postgres -d "$DB" -qtA >/dev/null 2>&1 <<SQL &
begin;
lock table public.reservations in row exclusive mode;
select pg_sleep(8);
commit;
SQL
sleep 0.7
out=$(cleanup); wait
checkre "L5 un escritor con la tabla en uso → la limpieza falla por lock_timeout" "lock timeout" "$out"
check "L5 nada cambia" "$BEFORE" "$(counts)"

out=$(cleanup)
checkre "L6 ensayo: lo hace todo y lo deshace, con el resumen" "ENSAYO OK.*reservations: 10.*package_sessions: 15.*client_packages: 2" "$out"
check "L6 nada guardado" "$BEFORE" "$(counts)"

fill borrar; out=$(cleanup)
checkre "L7 borrar: termina con la tabla de recuentos" "public.reservations\|se limpia\|10\|0\|10" "$out"
check "L7 conservado idéntico; reservas, paquetes, sesiones 0; avisos: solo los sin reserva" \
  "4|1|1|2|0|3|16|2|1|6|11|0|0|0|1|1" "$(counts)"
check "L7 la copia de la 008 intacta (incluida la fila que solo estaba allí)" "11|1" \
  "$(q "select count(*) from reservations_backup_008")|$(q "select count(*) from reservations_backup_008 where id = '$(id 199)'")"
check "L7 ventanas: ninguna borrada; contador a 0 y 'full' → available; 'blocked' se queda" \
  "6|0|available|blocked|0" \
  "$(q "select count(*) from availability_slots")|$(q "select coalesce(sum(current_bookings), 0) from availability_slots where id <> '$(id 6)'")|$(q "select status from availability_slots where id = '$(id 2)'")|$(q "select status from availability_slots where id = '$(id 3)'")|$(q "select current_bookings from availability_slots where id = '$(id 6)'")"
check "L7 jugador, su relación y su cuenta de Auth siguen" "1|1|1" \
  "$(q "select count(*) from players where id = '$(id 801)'")|$(q "select count(*) from player_trainers where player_id = '$(id 801)'")|$(q "select count(*) from auth.users where id = '$(id 903)'")"

fill borrar; out=$(cleanup)
checkre "L8 se puede repetir (0 reservas): no borra nada más" "public.reservations\|se limpia\|0\|0\|0" "$out"
check "L8 recuentos iguales" "4|1|1|2|0|3|16|2|1|6|11|0|0|0|1|1" "$(counts)"

# ─── M. 011 → 021 sobre la base limpia ───────────────────────────────────────
applied=()
for f in migrations/01[1-9]_*.sql migrations/02[0-1]_*.sql; do
  out=$(run < "$f") || { bad "M1 $f no se aplica: $out"; break; }
  applied+=("$(basename "$f" .sql | cut -c1-3)")
  [[ "$f" == migrations/018_* ]] && check "M2 tras la 018, el informe está vacío (nada que decidir)" "0" "$(q "select count(*) from package_credit_backfill_report")"
done
check "M1 011 → 021 en orden, sin decisiones" "011 012 013 014 015 016 017 018 019 020 021" "${applied[*]}"
V=$(docker exec -i "$NAME" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qtA -F'|' < "$VERIFY" 2>&1)
check "M3 03_verificacion V1: todas las migraciones presentes" "t|t|t|t|t|t|t|t|t|t|t|t|t|t|t|t|t|t" "$(sed -n 1p <<<"$V")"
check "M3 V3: anon/authenticated sin acceso a lo nuevo" "f|f|f|f|f|f|f|f" "$(grep -E '^[tf](\|[tf]){7}$' <<<"$V" | tail -1)"
check "M3 V2 vacía y V4 con lo conservado" "4|1|1|2|16|2|1|3|6|0|0" "$(tail -1 <<<"$V")"
check "M4 se conserva el horario y los precios de Dani" "1|8" \
  "$(q "select count(*) from trainer_weekly_hours where trainer_id = '$T1'")|$(q "select count(*) from trainer_session_prices where trainer_id = '$T1'")"

# ═══ Base 2: control y variante tardía ══════════════════════════════════════
make_db real2
for f in migrations/01[1-8]_*.sql; do out=$(run < "$f") || { bad "X0 $f: $out"; break; }; done
checkre "X1 SIN limpiar, el informe de la 018 tiene reservas vivas por decidir" "^viva_sin_clasificar\|[1-9]" \
  "$(q "select problema || '|' || count(*) from package_credit_backfill_report where problema = 'viva_sin_clasificar' group by problema")"
out=$(run < migrations/019_package_credit_single_live.sql)
checkre "X1 y la 019 se niega (por eso se limpia antes)" "reservas históricas sin resolver" "$out"
q "insert into package_credit_resolutions (reservation_id, package_session_id, decided_by, reason) values ('$(id 101)', null, 'Dani', 'reserva web de prueba')" >/dev/null
fill borrar; out=$(cleanup)
checkre "X2 limpiar con 011 → 018 aplicadas (y una decisión): funciona" "package_credit_resolutions\|se limpia\|1\|0\|1" "$out"
check "X2 conservado idéntico" "4|1|1|2|0|3|16|2|1|6|11|0|0|0|1|1" "$(counts)"
for f in migrations/019_*.sql migrations/02[0-1]_*.sql; do out=$(run < "$f") || bad "X3 $f no se aplica tras limpiar: $out"; done
check "X3 019 → 021 se aplican" "0" "$(q "select count(*) from package_credit_integrity_check where bloquea")"

# Reservas nuevas con todo lo de 019/021 en marcha y otra limpieza.
q "insert into client_packages (id, trainer_id, client_name, client_email, sessions_total, price_per_session_normal, price_per_session_discounted, price_total, duration_minutes) values ('$(id 303)', '$T1', 'Nuevo', 'n@x', 5, 300, 270, 1350, 60); insert into package_sessions (id, client_package_id, session_number) values ('$(id 601)', '$(id 303)', 1), ('$(id 602)', '$(id 303)', 2)" >/dev/null
check "X4 prep: agendar una sesión (019: reserva con package_session_id)" "scheduled" \
  "$(q "select outcome from schedule_package_session('$(id 601)', '$T1', '$(id 1)', '15:00', 'confirmed')")"
q "select * from create_booking_request('guest:$(printf 'a%.0s' {1..64})', '$(id 700)', '$(printf '1%.0s' {1..64})', '[{\"trainer_id\":\"$T2\",\"availability_slot_id\":\"$(id 6)\",\"player_id\":null,\"client_name\":\"W\",\"client_email\":\"w@x\",\"client_phone\":\"1\",\"whatsapp_opt_in\":false,\"client_message\":null,\"player_count\":1,\"start_time\":\"12:00\",\"end_time\":\"13:00\",\"duration_minutes\":60,\"price\":300,\"status\":\"pending_confirmation\",\"created_at\":\"2099-01-01T00:00:00Z\"}]'::jsonb, '{\"success\":true}'::jsonb)" >/dev/null
check "X4 prep: 2 reservas, una con crédito; 1 clave de la 021" "2|1|1" \
  "$(q "select count(*) from reservations")|$(q "select count(*) from reservations where package_session_id is not null")|$(q "select count(*) from booking_requests")"
checkre "X4 borrar el paquete a mano lo impide la FK RESTRICT de la 019 (la limpieza no depende de eso)" "violates foreign key constraint" \
  "$(q "delete from client_packages where id = '$(id 303)'")"
fill borrar; out=$(cleanup)
checkre "X5 limpiar después de la 021 funciona (booking_requests incluida)" "booking_requests\|se limpia\|1\|0\|1" "$out"
check "X5 reservas, paquetes y claves a 0; conservado igual" "0|0|0|0|4|1" \
  "$(q "select count(*) from reservations")|$(q "select count(*) from client_packages")|$(q "select count(*) from package_sessions")|$(q "select count(*) from booking_requests")|$(q "select count(*) from auth.users")|$(q "select count(*) from players")"
check "X5 integridad de la 019 tras limpiar" "0" "$(q "select count(*) from package_credit_integrity_check where bloquea")"

exit $fail
