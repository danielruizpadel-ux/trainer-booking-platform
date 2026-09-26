#!/bin/bash
# R2 — La transición 011 → 012b → código nuevo, con peticiones ANTIGUAS en
# carrera con la migración (revisión v4 de Codex). Postgres 16 LOCAL y
# desechable en Docker; NUNCA Supabase (no lee .env.local). Contenedores sin
# puertos publicados, borrados al terminar (salvo KEEP=1).
#
# Las carreras son DETERMINISTAS: nada depende de pg_sleep ni de medir
# tiempos. Una "barrera" es una sesión que tiene un advisory lock; la sesión
# que debe quedarse a medias espera ese lock DENTRO de su transacción. Que otra
# sesión está bloqueada se comprueba en pg_stat_activity (wait_event_type =
# 'Lock'), no por el tiempo que tarda. Cada sentencia lleva statement_timeout
# y el script entero un vigilante: nada puede quedarse colgado en silencio.
#
# Contenedor 1
#   T5  un escritor con una transacción abierta en reservations: la 012b no
#       consigue el bloqueo en su lock_timeout y ABORTA sin cambiar nada.
#   T1  una llamada a la RPC 011 (cuerpo antiguo) ya dentro de su transacción
#       cuando empieza la 012b: la 012b espera a que termine y su reserva
#       recibe el crédito.
# Contenedor 2 (con una copia de la 012b instrumentada SOLO para pararla justo
# antes del COMMIT, con sus bloqueos tomados)
#   T2  peticiones antiguas que llegan con la 012b en marcha: dos llamadas a la
#       011 (una con el crédito libre, otra con una propuesta viva) y el
#       proposeReschedule de antes de R2 (dos escrituras sueltas). Esperan el
#       bloqueo, siguen con el CÓDIGO ANTIGUO tras el COMMIT (un trigger de
#       prueba lo demuestra: insertan sin crédito) y aun así ninguna reserva
#       queda sin crédito ni hay dos vivas por crédito.
#   T3  el código antiguo después de la migración (la secuencia SQL de la 011):
#       recibe el crédito; si el crédito ya tiene otra viva, 23505 y se deshace.
#   T4  CONTROL sin el trigger de enlace: la reserva antigua queda sin crédito
#       y package_credit_integrity_check lo marca (la comprobación falla de
#       forma segura); reaplicar la 012b lo arregla desde el enlace.
#
#   bash scripts/verify-package-credit-transition.sh
set -u
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
CONTAINERS=()
cleanup() { [ "${KEEP:-0}" = 1 ] || for c in "${CONTAINERS[@]}"; do docker rm -f "$c" >/dev/null 2>&1; done; rm -rf "$TMP"; }
trap cleanup EXIT
# Vigilante: si todo el script tarda más de 10 minutos, algo se ha colgado.
# (bucle de sleep 1, no un sleep 600: al matarlo no deja la salida abierta)
( for i in $(seq 1 600); do sleep 1; done; echo "  FAIL VIGILANTE: el script superó 10 minutos; se aborta"; kill -TERM $$ ) 2>/dev/null &
WATCHDOG=$!
disown $WATCHDOG 2>/dev/null
# Procesos de cada prueba. OJO: nunca un `wait` sin argumentos (esperaría al vigilante).
PIDS=()
join() { local p; for p in "${PIDS[@]}"; do wait "$p"; done; PIDS=(); }
trap 'kill $WATCHDOG 2>/dev/null; cleanup' EXIT

PGOPTS='-c statement_timeout=60s'
FAIL=0
check() { if [ "$2" == "$3" ]; then echo "  OK   $1 ($2)"; else echo "  FAIL $1: esperado '$3', obtenido '$2'"; FAIL=1; fi; }
contains() { case "$2" in *"$3"*) echo "  OK   $1";; *) echo "  FAIL $1: no contiene '$3': $2"; FAIL=1;; esac; }

C=
psqlc() { docker exec -i -e PGOPTIONS="$PGOPTS" "$C" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
q() { psqlc -At -c "$1"; }
qt() { psqlc -At -v VERBOSITY=terse -c "$1" 2>&1; }
# Sesión con nombre (application_name) para poder observarla.
papp() { local app=$1; shift; docker exec -i -e PGAPPNAME="$app" -e PGOPTIONS="$PGOPTS" "$C" psql -U postgres -v ON_ERROR_STOP=1 -q -At -v VERBOSITY=terse "$@"; }
# Espera (máx. 20 s) a que la sesión APP esté esperando un bloqueo. KIND=advisory
# para la barrera; KIND=table para cualquier otro (relación, fila, transacción).
wait_lock() {
  local app=$1 kind=$2 cond
  if [ "$kind" = advisory ]; then cond="wait_event = 'advisory'"; else cond="wait_event <> 'advisory'"; fi
  for i in $(seq 1 200); do
    [ "$(q "select count(*) from pg_stat_activity where application_name = '$app' and wait_event_type = 'Lock' and $cond")" = 1 ] && return 0
    sleep 0.1
  done
  echo "  FAIL $app no llegó a esperar un bloqueo ($kind); estado:"; q "select application_name, state, wait_event_type, wait_event, left(query, 80) from pg_stat_activity where application_name like 'r2t-%'"
  FAIL=1; return 1
}
# Barrera KEY: una sesión la sostiene hasta release.
barrier_hold() {
  ( papp "r2t-bar$1" -c "select pg_advisory_lock($1)" -c "select pg_sleep(300)" >/dev/null 2>&1 ) & PIDS+=($!)
  for i in $(seq 1 200); do
    [ "$(q "select count(*) from pg_locks where locktype = 'advisory' and objid = $1 and granted")" = 1 ] && return 0
    sleep 0.1
  done
  echo "  FAIL la barrera $1 no se tomó"; FAIL=1
}
barrier_release() { q "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'r2t-bar$1'" >/dev/null; }

new_db() {
  C=$1; CONTAINERS+=("$C")
  docker rm -f "$C" >/dev/null 2>&1
  docker run -d --name "$C" -e POSTGRES_PASSWORD=local postgres:16-alpine >/dev/null || exit 1
  for i in $(seq 1 60); do docker exec "$C" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  sleep 1
  psqlc <<'SQL' || exit 1
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema extensions;
create table public.trainers (id uuid primary key default gen_random_uuid(), name text);
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
  psqlc < migrations/006_class_packages.sql >/dev/null || exit 1
  psqlc -c "alter table public.client_packages add column if not exists duration_minutes smallint not null default 60" || exit 1
  psqlc < migrations/008_reservations_no_overlap.sql >/dev/null 2>&1 || exit 1
  psqlc < migrations/011_package_session_atomic_schedule.sql >/dev/null || exit 1
  psqlc < migrations/012a_package_credit_preparation.sql >/dev/null || exit 1
  psqlc <<SQL || exit 1
insert into trainers (id, name) values ('$T', 'T');
insert into availability_slots (id, trainer_id, session_date, start_time, end_time)
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '$T',
         (now() at time zone 'Asia/Kuala_Lumpur')::date + n, '08:00', '20:00'
    from generate_series(1, 9) n;
insert into client_packages (id, trainer_id, client_name, client_email, sessions_total, price_per_session_normal, discount_percent, price_per_session_discounted, price_total, duration_minutes)
  values ('$PKG','$T','Ana','ana@example.com',10,300,10,270,2700,60);
insert into package_sessions (id, client_package_id, session_number)
  select ('bbbbbbbb-bbbb-4bbb-8bbb-' || lpad(n::text, 12, '0'))::uuid, '$PKG', n from generate_series(1,10) n;
SQL
}

T=11111111-1111-4111-8111-111111111111
PKG=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
S() { echo "bbbbbbbb-bbbb-4bbb-8bbb-$(printf '%012d' $1)"; }
W() { echo "00000000-0000-4000-8000-$(printf '%012d' $1)"; }
sched_sql() { echo "select outcome || ':' || coalesce(reservation_id::text,'-') from schedule_package_session('$1','$T','$2','$3','pending_confirmation')"; }
pid() { q "select coalesce(package_session_id::text, '-') from reservations where id='$1'"; }
LIVE="coalesce(r.status,'') not in ('cancelled','canceled','needs_reschedule')"
live_by_credit() { q "select count(*) from reservations r where r.package_session_id='$1' and $LIVE"; }
live_linked_or_credit() { q "select count(*) from reservations r where (r.package_session_id='$1' or r.id = (select reservation_id from package_sessions where id='$1')) and $LIVE"; }
integrity() { q "select coalesce(string_agg(problema || '=' || n, ' ' order by problema), '') from (select problema, count(*) n from package_credit_integrity_check group by 1) x"; }
has_col() { q "select count(*) from information_schema.columns where table_name='reservations' and column_name='package_session_id'"; }

# ══════════════════════════════════════════════════════════════════════════
echo "Contenedor 1"
new_db r2t-pg-1

echo "T5) escritores activos: la 012b aborta por lock_timeout sin cambiar nada"
barrier_hold 501
( papp r2t-writer -c "begin" -c "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, status, start_time, end_time) values ('$T','$(W 9)','Leo','leo@example.com','pending_confirmation','10:00','11:00') returning 'insertada:' || id" -c "select pg_advisory_xact_lock(501)" -c "commit" > $TMP/writer.out 2>&1 ) & PIDS+=($!)
wait_lock r2t-writer advisory
out=$(psqlc < migrations/012b_package_credit_single_live.sql 2>&1)
contains "T5 la 012b falla por el bloqueo (no espera indefinidamente)" "$out" "lock timeout"
check "T5 y no deja nada (ni columna ni funciones nuevas)" "$(has_col):$(q "select count(*) from pg_proc where proname='propose_reschedule'")" "0:0"
barrier_release 501; join
check "T5 el escritor termina bien después" "$(grep -c '^insertada:' $TMP/writer.out)" "1"
# Esa reserva web es anterior al corte y viva: la 012a exige decidirla (lo que haría el operador).
WEB=$(grep '^insertada:' $TMP/writer.out | cut -d: -f2)
check "T5 la reserva del escritor sale como viva_sin_clasificar (bloquearía la 012b)" "$(q "select problema from package_credit_backfill_report where reservation_id='$WEB'")" "viva_sin_clasificar"
q "insert into package_credit_resolutions (reservation_id, package_session_id, decided_by, reason) values ('$WEB', null, 'test', 'reserva web de la prueba T5')" >/dev/null

echo "T1) una llamada a la 011 ya en curso cuando empieza la 012b"
barrier_hold 502
( papp r2t-A -c "begin" -c "$(sched_sql $(S 1) $(W 1) 10:00)" -c "select pg_advisory_xact_lock(502)" -c "commit" > $TMP/A.out 2>&1 ) & PIDS+=($!)
wait_lock r2t-A advisory
( papp r2t-M -f - < migrations/012b_package_credit_single_live.sql > $TMP/M.out 2>&1; echo "exit=$?" >> $TMP/M.out ) & PIDS+=($!)
wait_lock r2t-M table
check "T1 la 012b espera (observado en pg_stat_activity, no por tiempo)" "$(q "select wait_event_type from pg_stat_activity where application_name='r2t-M'")" "Lock"
barrier_release 502; join
A1=$(grep -E '^scheduled:' $TMP/A.out | cut -d: -f2)
check "T1 la 011 terminó (cuerpo antiguo: sin crédito en el insert)" "$(grep -cE '^scheduled:' $TMP/A.out)" "1"
check "T1 la 012b terminó bien" "$(grep -c "exit=0" $TMP/M.out)" "1"
check "T1 la reserva de la 011 recibió el crédito (por el enlace)" "$(pid $A1)" "$(S 1)"
check "T1 integridad" "$(integrity)" ""
check "T1 nada bloqueante en el informe" "$(q "select count(*) from package_credit_backfill_report where problema <> 'muerta_sin_clasificar'")" "0"

# ══════════════════════════════════════════════════════════════════════════
echo "Contenedor 2"
new_db r2t-pg-2
# Datos de antes: Y con la carrera de R2 a medias (original muerta, propuesta
# viva, crédito apuntando a la original), O pendiente con su crédito.
RY=$(q "$(sched_sql $(S 2) $(W 2) 10:00)" | cut -d: -f2)
q "update reservations set status='needs_reschedule' where id='$RY'" >/dev/null
PY=$(q "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, notes, status, start_time, end_time, rescheduled_from_id, proposal_token) select trainer_id, '$(W 3)', client_name, client_email, notes, 'reschedule_proposed', '11:00', '12:00', id, 'tokY00000000000000000000' from reservations where id='$RY' returning id")
O=$(q "$(sched_sql $(S 3) $(W 4) 10:00)" | cut -d: -f2)
# Trigger SOLO de prueba: registra si una reserva llegó al INSERT sin crédito
# (así se sabe que la escribió el código antiguo). Se dispara antes que
# reservations_inherit_package_credit (orden alfabético).
psqlc <<'SQL' >/dev/null
create table public.test_insert_audit (reservation_id uuid primary key, credit_at_insert uuid, has_column boolean);
create function public.test_audit_insert() returns trigger language plpgsql as $f$
begin
  insert into public.test_insert_audit
  values (new.id,
          case when to_jsonb(new) ? 'package_session_id' then (to_jsonb(new) ->> 'package_session_id')::uuid end,
          to_jsonb(new) ? 'package_session_id');
  return new;
end $f$;
create trigger aaa_test_audit_insert before insert on public.reservations for each row execute function public.test_audit_insert();
SQL
# Copia de la 012b parada justo antes del COMMIT (con todo hecho y los bloqueos tomados).
awk '{ if ($0 == "commit;") print "select pg_advisory_xact_lock(503);"; print }' migrations/012b_package_credit_single_live.sql > $TMP/012b_paused.sql
check "copia instrumentada: una sola línea añadida" "$(diff migrations/012b_package_credit_single_live.sql $TMP/012b_paused.sql | grep -c '^>')" "1"

echo "T2) peticiones antiguas que llegan con la 012b en marcha"
barrier_hold 503
( papp r2t-M -f - < $TMP/012b_paused.sql > $TMP/M.out 2>&1; echo "exit=$?" >> $TMP/M.out ) & PIDS+=($!)
wait_lock r2t-M advisory
check "T2 la 012b está a punto de hacer COMMIT, con sus bloqueos" "$(q "select count(*) from pg_locks l join pg_stat_activity a using (pid) where a.application_name='r2t-M' and l.mode='ExclusiveLock' and l.relation in ('public.reservations'::regclass, 'public.package_sessions'::regclass) and l.granted")" "2"
( papp r2t-B1 -c "$(sched_sql $(S 1) $(W 5) 10:00)" > $TMP/B1.out 2>&1 ) & PIDS+=($!)
( papp r2t-B2 -c "$(sched_sql $(S 2) $(W 6) 10:00)" > $TMP/B2.out 2>&1 ) & PIDS+=($!)
# proposeReschedule de antes de R2: dos escrituras sueltas.
( papp r2t-C -c "update reservations set status='needs_reschedule' where id='$O' and status='pending_confirmation' returning 'liberada'" > $TMP/C.out 2>&1
  papp r2t-C2 -c "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, notes, status, start_time, end_time, rescheduled_from_id, proposal_token) select trainer_id, '$(W 7)', client_name, client_email, notes, 'reschedule_proposed', '11:00', '12:00', id, 'tokO00000000000000000000' from reservations where id='$O' returning 'propuesta:' || id" >> $TMP/C.out 2>&1 ) & PIDS+=($!)
wait_lock r2t-B1 table; wait_lock r2t-B2 table; wait_lock r2t-C table
check "T2 las tres peticiones antiguas esperan el bloqueo (observado)" "$(q "select count(*) from pg_stat_activity where application_name in ('r2t-B1','r2t-B2','r2t-C') and wait_event_type='Lock'")" "3"
check "T2 y ven la función ANTIGUA (la 012b aún no ha hecho COMMIT)" "$(q "select count(*) from pg_proc where proname='propose_reschedule'")" "0"
barrier_release 503; join
check "T2 la 012b terminó bien" "$(grep -c 'exit=0' $TMP/M.out)" "1"
B1=$(grep -E '^scheduled:' $TMP/B1.out | cut -d: -f2)
check "T2 B1 (011 antigua, crédito libre) agenda" "$(cut -d: -f1 $TMP/B1.out)" "scheduled"
check "T2 B1 insertó con el cuerpo ANTIGUO: sin crédito en el INSERT" "$(q "select coalesce(credit_at_insert::text, 'null') from test_insert_audit where reservation_id='$B1'")" "null"
check "T2 B1 recibió el crédito por el trigger de enlace" "$(pid $B1)" "$(S 1)"
check "T2 B2 (011 antigua, con propuesta viva) → already_scheduled: el enlace ya apunta a la propuesta" "$(cut -d: -f1 $TMP/B2.out)" "already_scheduled"
check "T2 S2 sigue con UNA viva (la propuesta)" "$(live_by_credit $(S 2)):$(pid $PY)" "1:$(S 2)"
CP=$(grep -E '^propuesta:' $TMP/C.out | cut -d: -f2)
check "T2 C (proposeReschedule antiguo) liberó la original y creó la propuesta" "$(grep -c '^liberada' $TMP/C.out):$([ -n "$CP" ] && echo si)" "1:si"
check "T2 C insertó sin crédito y lo heredó de la original" "$(q "select coalesce(credit_at_insert::text, 'null') from test_insert_audit where reservation_id='$CP'"):$(pid $CP)" "null:$(S 3)"
check "T2 integridad: nada bloqueante; solo el aviso del enlace desfasado de C" "$(integrity)" "enlace_desfasado=1"
check "T2 S3: el agendado nuevo ve la propuesta y no crea otra" "$(q "$(sched_sql $(S 3) $(W 8) 10:00)" | cut -d: -f1):$(live_by_credit $(S 3))" "already_scheduled:1"
check "T2 ningún crédito con dos vivas" "$(for n in 1 2 3; do live_linked_or_credit $(S $n); done | sort -u | tr '\n' ' ')" "1 "

echo "T3) el código antiguo DESPUÉS de la migración (la secuencia de la 011)"
old011() { # $1 crédito, $2 ventana, $3 hora: INSERT sin crédito y DESPUÉS el enlace, en una transacción (como la 011)
  psqlc -At -v VERBOSITY=terse <<SQL 2>&1
begin;
insert into reservations (trainer_id, availability_slot_id, client_name, client_email, notes, status, start_time, end_time)
values ('$T', '$2', 'Ana', 'ana@example.com', 'Paquete de 10 clases · sesión x/10', 'pending_confirmation', '$3', '$3'::time + interval '1 hour')
returning id as rid \gset
update package_sessions set reservation_id = :'rid', status = 'scheduled' where id = '$1' returning 'enlazada:' || reservation_id;
commit;
SQL
}
out=$(old011 $(S 4) $(W 8) 14:00); R4=$(echo "$out" | grep -E '^enlazada:' | cut -d: -f2)
check "T3 la secuencia antigua con crédito libre: la reserva recibe el crédito" "$(pid $R4)" "$(S 4)"
before=$(q "select count(*) from reservations")
out=$(old011 $(S 1) $(W 9) 14:00)
contains "T3 con el crédito ya ocupado: 23505 y se deshace" "$out" "reservations_one_live_per_package_session"
check "T3 no quedó ninguna reserva nueva; S1 sigue con una viva" "$(q "select count(*) from reservations"):$(live_by_credit $(S 1))" "$before:1"
check "T3 integridad" "$(integrity)" "enlace_desfasado=1"

echo "T4) CONTROL: sin el trigger de enlace, la comprobación lo detecta"
q "alter table package_sessions disable trigger package_sessions_link_carries_credit" >/dev/null
out=$(old011 $(S 5) $(W 9) 16:00); R5=$(echo "$out" | grep -E '^enlazada:' | cut -d: -f2)
check "T4 sin el trigger la reserva antigua queda SIN crédito (el hueco de v4)" "$(pid $R5)" "-"
check "T4 package_credit_integrity_check lo marca como bloqueante" "$(q "select problema || ':' || bloquea from package_credit_integrity_check where reservation_id='$R5'")" "enlace_sin_credito:true"
psqlc < migrations/012b_package_credit_single_live.sql >/dev/null 2>&1
check "T4 reaplicar la 012b lo arregla desde el enlace (y vuelve a crear el trigger)" "$(pid $R5):$(q "select tgenabled from pg_trigger where tgname='package_sessions_link_carries_credit'")" "$(S 5):O"
check "T4 integridad: vacía (la 012b reaplicada también reenlaza el crédito de C a su propuesta viva)" "$(integrity)" ""

kill $WATCHDOG 2>/dev/null
echo; [ $FAIL = 0 ] && echo "TODO OK" || echo "HAY FALLOS"
exit $FAIL
