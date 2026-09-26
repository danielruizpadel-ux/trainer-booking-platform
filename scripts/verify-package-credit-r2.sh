#!/bin/bash
# R2 — Un crédito de paquete respalda como mucho UNA reserva viva
# (migraciones 012a + 012b) contra una Postgres 16 LOCAL y desechable en Docker. NUNCA
# conecta con Supabase: no lee .env.local ni usa ninguna URL; todo va por
# `docker exec` a un contenedor sin puertos publicados que crea este script y
# borra al terminar (salvo KEEP=1).
#
# Esquema mínimo (solo lo que tocan 004/006/007/008/010/011/012, no el real de
# Supabase) + migraciones reales 006, 008, 011, 012a y 012b del repo. Con los
# GRANT por defecto de Supabase a anon/authenticated, para comprobar que la
# 012a los revoca en su tabla y sus vistas.
#
#   A. REPRODUCCIÓN con la 011 sola: reserva de paquete → propuesta (las
#      escrituras exactas de proposeReschedule en 44888db) → el crédito parece
#      libre → schedule_package_session crea una TERCERA reserva: dos vivas.
#   B. Datos históricos: la 012b se niega sin la 012a; la 012a informa (sin
#      tocar datos) de las reservas vivas sin evidencia — etiqueta ambigua
#      entre dos paquetes, reserva web del mismo cliente, notes editadas — y
#      de decisiones inválidas o contradictorias; la 012b aborta mientras haya
#      algo bloqueante; con decisiones explícitas se aplica, asigna SOLO con
#      evidencia (enlace, descendencia, decisión) y reenlaza. Las históricas
#      MUERTAS también exigen decisión, y la secuencia de la revisión v2 de
#      Codex (histórica muerta + viva del mismo crédito + reactivar) queda
#      bloqueada. FK ON DELETE RESTRICT: un paquete con reservas no se borra;
#      cancelarlo (status) conserva créditos, índice y trigger.
#   C. Secuencias con la 012: proponer, aceptar, reproponer, rechazar,
#      cancelar, "sin pista", revivir al mover (prohibido en reservas de
#      paquete, permitido en las demás), desagendar con propuesta viva,
#      reservas sin paquete, reglas y atomicidad de propose_reschedule.
#   D. Carreras: proponer ↔ agendar, proponer ↔ desagendar (dos órdenes),
#      revivir ↔ agendar, dos inserciones vivas del mismo crédito contra el
#      índice, y ráfagas mezcladas con invariantes
#      comprobadas tras cada ronda.
#   E. Permisos.
#
#   bash scripts/verify-package-credit-r2.sh
set -u
cd "$(dirname "$0")/.."
C=r2-pkg-pg-verify
TMP=$(mktemp -d)
cleanup() { [ "${KEEP:-0}" = 1 ] || docker rm -f "$C" >/dev/null 2>&1; rm -rf "$TMP"; }
trap cleanup EXIT
# Vigilante: si el script entero pasa de 15 minutos, algo se ha colgado → FAIL y fuera.
( for i in $(seq 1 900); do sleep 1; done; echo "  FAIL VIGILANTE: más de 15 minutos; se aborta"; kill -TERM $$ ) 2>/dev/null &
WATCHDOG=$!; disown $WATCHDOG 2>/dev/null
trap 'kill $WATCHDOG 2>/dev/null; cleanup' EXIT
docker rm -f "$C" >/dev/null 2>&1
docker run -d --name "$C" -e POSTGRES_PASSWORD=local postgres:16-alpine >/dev/null || exit 1
for i in $(seq 1 60); do docker exec "$C" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 1
# Ninguna sentencia puede quedarse esperando indefinidamente.
PGOPTS='-c statement_timeout=60s -c lock_timeout=30s'
psqlc() { docker exec -i -e PGOPTIONS="$PGOPTS" "$C" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
q() { psqlc -At -c "$1"; }
qt() { psqlc -At -v VERBOSITY=terse -c "$1" 2>&1; }
FAIL=0
check() { if [ "$2" == "$3" ]; then echo "  OK   $1 ($2)"; else echo "  FAIL $1: esperado '$3', obtenido '$2'"; FAIL=1; fi; }
contains() { case "$2" in *"$3"*) echo "  OK   $1";; *) echo "  FAIL $1: no contiene '$3': $2"; FAIL=1;; esac; }

psqlc <<'SQL' || exit 1
-- Esquema mínimo local (NO es Supabase).
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema extensions;
-- Como Supabase: todo lo nuevo de public se concede por defecto a anon/authenticated.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
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
  -- 004
  rescheduled_from_id uuid references public.reservations(id) on delete set null, proposal_token text,
  -- 007
  start_time time, end_time time, duration_minutes smallint not null default 60,
  -- 010
  player_id uuid, client_message text, player_count smallint not null default 1, whatsapp_opt_in boolean,
  created_at timestamptz default now(), updated_at timestamptz default now());
-- 004: CHECK de estados y token único
alter table public.reservations add constraint reservations_status_check
  check (status in ('pending_confirmation', 'reschedule_proposed', 'confirmed', 'needs_reschedule', 'cancelled', 'completed'));
create unique index reservations_proposal_token_key on public.reservations (proposal_token) where proposal_token is not null;
SQL
psqlc < migrations/006_class_packages.sql || exit 1
psqlc -c "alter table public.client_packages add column if not exists duration_minutes smallint not null default 60" || exit 1  # 007
psqlc < migrations/008_reservations_no_overlap.sql 2>/dev/null || exit 1
psqlc < migrations/011_package_session_atomic_schedule.sql || exit 1

T=11111111-1111-4111-8111-111111111111
T2=22222222-2222-4222-8222-222222222222
PKG=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
S() { echo "bbbbbbbb-bbbb-4bbb-8bbb-$(printf '%012d' $1)"; }
W() { echo "00000000-0000-4000-8000-$(printf '%012d' $1)"; }
TOK() { printf 'tok%021d' "$1"; }   # 24 caracteres [A-Za-z0-9]

psqlc <<SQL
insert into trainers (id, name) values ('$T','T'), ('$T2','T2');
-- W1..W30: ventanas 08:00-20:00 del entrenador T, días +1..+30 (Kuala Lumpur). W99: de T2.
insert into availability_slots (id, trainer_id, session_date, start_time, end_time)
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '$T',
         (now() at time zone 'Asia/Kuala_Lumpur')::date + n, '08:00', '20:00'
    from generate_series(1, 30) n;
insert into availability_slots (id, trainer_id, session_date, start_time, end_time) values
  ('$(W 99)','$T2',(now() at time zone 'Asia/Kuala_Lumpur')::date + 1,'08:00','20:00'),
  ('$(W 98)','$T',(now() at time zone 'Asia/Kuala_Lumpur')::date - 1,'08:00','20:00');
insert into availability_slots (id, trainer_id, session_date, start_time, end_time, status) values
  ('$(W 97)','$T',(now() at time zone 'Asia/Kuala_Lumpur')::date + 40,'08:00','20:00','blocked');
insert into client_packages (id, trainer_id, client_name, client_email, sessions_total, price_per_session_normal, discount_percent, price_per_session_discounted, price_total, duration_minutes)
  values ('$PKG','$T','Ana','ana@example.com',10,300,10,270,2700,60);
insert into package_sessions (id, client_package_id, session_number)
  select ('bbbbbbbb-bbbb-4bbb-8bbb-' || lpad(n::text, 12, '0'))::uuid, '$PKG', n from generate_series(1,10) n;
SQL

sched() { qt "select outcome || ':' || coalesce(reservation_id::text,'-') from schedule_package_session('$1','$T','$2','$3','pending_confirmation')"; }
unsched() { qt "select outcome || ':' || coalesce(cancelled_reservation_id::text,'-') from unschedule_package_session('$1','$T',$2)"; }
propose() { qt "select outcome || ':' || coalesce(proposal_id::text,'-') from propose_reschedule('$1','${4:-$T}','$2','$3','$(TOK $5)')"; }
# Las escrituras de proposeReschedule en 44888db (antes de la 012), tal cual.
propose_old() {
  q "update reservations set status='needs_reschedule', updated_at=now() where id='$1' and status in ('pending_confirmation','pending')" >/dev/null
  q "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, client_phone, notes, price, player_id, client_message, player_count, whatsapp_opt_in, start_time, end_time, duration_minutes, status, rescheduled_from_id, proposal_token)
     select trainer_id, '$2', client_name, client_email, client_phone, notes, price, player_id, client_message, player_count, whatsapp_opt_in, '$3', '$3'::time + interval '1 hour', duration_minutes, 'reschedule_proposed', id, '$(TOK $4)' from reservations where id='$1' returning id"
}
accept() { q "update reservations set status='pending_confirmation', proposal_token=null, updated_at=now() where id='$1' and status='reschedule_proposed' returning id"; }
reject() { q "update reservations set status='needs_reschedule', proposal_token=null, updated_at=now() where id='$1' and status='reschedule_proposed' returning id"; }
link_of() { q "select coalesce(reservation_id::text,'') from package_sessions where id='$1'"; }
state_of() { q "select status || ':' || coalesce(reservation_id::text,'-') from package_sessions where id='$1'"; }
st() { q "select status from reservations where id='$1'"; }
LIVE="coalesce(r.status,'') not in ('cancelled','canceled','needs_reschedule')"
# Reservas vivas que nacieron de un crédito: por la etiqueta de notes (sirve también antes de la 012).
live_by_label() { q "select count(*) from reservations r where r.notes like 'Paquete de 10 clases · sesión $1/10%' and $LIVE"; }
live_by_credit() { q "select count(*) from reservations r where r.package_session_id='$1' and $LIVE"; }
# Invariantes de la 012, para todo el paquete:
multi() { q "select count(*) from (select package_session_id from reservations r where package_session_id is not null and $LIVE group by 1 having count(*) > 1) x"; }
unlinked_live() { q "select count(*) from reservations r join package_sessions ps on ps.id = r.package_session_id where $LIVE and ps.reservation_id is distinct from r.id"; }
incoherent() { q "select count(*) from package_sessions where status in ('scheduled','not_scheduled') and (status = 'scheduled') <> (reservation_id is not null)"; }
# Carreras deterministas (ver D): barrera = advisory lock sostenido por otra sesión.
PIDS=()
join() { local p; for p in "${PIDS[@]}"; do wait "$p"; done; PIDS=(); }   # nunca un `wait` a secas
papp() { local app=$1; shift; docker exec -i -e PGAPPNAME="$app" -e PGOPTIONS="$PGOPTS" "$C" psql -U postgres -v ON_ERROR_STOP=1 -q -At -v VERBOSITY=terse "$@"; }
lock_state() { q "select coalesce(wait_event_type, '-') from pg_stat_activity where application_name = '$1' and (('${2:-table}' = 'advisory' and wait_event = 'advisory') or ('${2:-table}' <> 'advisory' and wait_event is distinct from 'advisory'))"; }
wait_lock() { # espera (máx. 20 s) a que APP espere un bloqueo: advisory (la barrera) o table (cualquier otro)
  local app=$1 kind=$2 cond
  if [ "$kind" = advisory ]; then cond="wait_event = 'advisory'"; else cond="wait_event <> 'advisory'"; fi
  for i in $(seq 1 200); do
    [ "$(q "select count(*) from pg_stat_activity where application_name = '$app' and wait_event_type = 'Lock' and $cond")" = 1 ] && return 0
    sleep 0.1
  done
  echo "  FAIL $app no llegó a esperar un bloqueo ($kind)"; q "select application_name, state, wait_event_type, wait_event from pg_stat_activity where application_name like 'r2-%'"; FAIL=1; return 1
}
bg_run() { ( papp "$1" -c "$2" > $TMP/$1.out 2>&1 ) & PIDS+=($!); }
# A: ejecuta SQL dentro de una transacción y se queda esperando la barrera KEY (con sus bloqueos).
hold_start() {
  local key=$1 app=$2 sql=$3
  ( papp "r2-bar$key" -c "select pg_advisory_lock($key)" -c "select pg_sleep(300)" >/dev/null 2>&1 ) & PIDS+=($!)
  for i in $(seq 1 200); do [ "$(q "select count(*) from pg_locks where locktype='advisory' and objid=$key and granted")" = 1 ] && break; sleep 0.1; done
  ( papp "$app" -c "begin" -c "$sql" -c "select pg_advisory_xact_lock($key)" -c "commit" > $TMP/$app.out 2>&1 ) & PIDS+=($!)
  wait_lock "$app" advisory
}
hold_release() { q "select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'r2-bar$1'" >/dev/null; join; }

echo "A) Reproducción con la 011 sola (antes de la 012)"
R=$(sched $(S 1) $(W 1) 10:00 | cut -d: -f2)
P=$(propose_old $R $(W 2) 11:00 1)
check "la original queda needs_reschedule" "$(st $R)" "needs_reschedule"
check "la propuesta está viva (reschedule_proposed)" "$(st $P)" "reschedule_proposed"
check "el crédito sigue apuntando a la original muerta" "$(link_of $(S 1))" "$R"
Q=$(sched $(S 1) $(W 3) 12:00)
check "BUG: schedule_package_session acepta una tercera reserva" "${Q%%:*}" "scheduled"
Q=${Q#*:}
check "BUG: dos reservas vivas para un crédito (propuesta + nueva)" "$(live_by_label 1)" "2"
# Aceptar la propuesta no lo arregla: sigue viva.
accept $P >/dev/null
check "BUG: tras aceptar la propuesta siguen dos vivas" "$(live_by_label 1)" "2"
# Segundo crédito, estado sano pero típico: propuesta aceptada y crédito en la original muerta.
R2=$(sched $(S 2) $(W 4) 10:00 | cut -d: -f2)
P2=$(propose_old $R2 $(W 5) 11:00 2); accept $P2 >/dev/null
check "crédito 2: apunta a la original muerta, su propuesta aceptada está viva" "$(st $R2):$(st $P2):$(link_of $(S 2))" "needs_reschedule:pending_confirmation:$R2"

# Casos históricos que la 012b NO puede decidir sola (HIGH de la revisión):
#   PKG2      segundo paquete de 10 de Ana con el mismo entrenador → la etiqueta es ambigua
#   PKGT2     paquete de Ana con OTRO entrenador (T2)
#   AMB       viva, etiqueta "sesión 3/10", sin enlace: ¿S3 de PKG o E3 de PKG2?
#   PUB       viva, reserva web normal de Ana (email en mayúsculas), sin etiqueta
#   EDIT/EDP  EDIT (muerta) con notes editadas a mano y su propuesta EDP viva, sin enlace
#   L/LBL     la secuencia de la revisión v2 de Codex: L viva y enlazada al crédito E5;
#             LBL histórica del MISMO crédito, needs_reschedule, sin enlace (etiqueta
#             "sesión 5/10", ambigua entre S5 y E5). Con la 012b anterior, LBL se
#             quedaba sin crédito y reactivarla dejaba dos vivas en E5.
PKG2=aaaaaaaa-aaaa-4aaa-8aaa-000000000002
PKGT2=aaaaaaaa-aaaa-4aaa-8aaa-0000000000f2
E() { echo "eeeeeeee-eeee-4eee-8eee-$(printf '%012d' $1)"; }
F1=ffffffff-ffff-4fff-8fff-000000000001
AMB=cccccccc-cccc-4ccc-8ccc-0000000000a1; PUB=cccccccc-cccc-4ccc-8ccc-0000000000a2
EDIT=cccccccc-cccc-4ccc-8ccc-0000000000a3; EDP=cccccccc-cccc-4ccc-8ccc-0000000000a4
psqlc <<SQL
insert into availability_slots (id, trainer_id, session_date, start_time, end_time)
  select ('00000000-0000-4000-8000-' || lpad((300 + n)::text, 12, '0'))::uuid, '$T',
         (now() at time zone 'Asia/Kuala_Lumpur')::date + 50 + n, '08:00', '20:00'
    from generate_series(1, 6) n;
insert into client_packages (id, trainer_id, client_name, client_email, sessions_total, price_per_session_normal, discount_percent, price_per_session_discounted, price_total, duration_minutes) values
  ('$PKG2','$T','Ana','ana@example.com',10,300,10,270,2700,60),
  ('$PKGT2','$T2','Ana','ana@example.com',5,300,5,285,1425,60);
insert into package_sessions (id, client_package_id, session_number)
  select ('eeeeeeee-eeee-4eee-8eee-' || lpad(n::text, 12, '0'))::uuid, '$PKG2', n from generate_series(1,10) n;
insert into package_sessions (id, client_package_id, session_number) values ('$F1', '$PKGT2', 1);
insert into reservations (id, trainer_id, availability_slot_id, client_name, client_email, notes, status, start_time, end_time) values
  ('$AMB','$T','$(W 301)','Ana','ana@example.com','Paquete de 10 clases · sesión 3/10','confirmed','10:00','11:00'),
  ('$PUB','$T','$(W 302)','Ana','ANA@example.com','reserva web','pending_confirmation','10:00','11:00'),
  ('$EDIT','$T','$(W 303)','Ana','ana@example.com','cliente pidió cambiar de día','needs_reschedule','10:00','11:00');
insert into reservations (id, trainer_id, availability_slot_id, client_name, client_email, notes, status, start_time, end_time, rescheduled_from_id, proposal_token) values
  ('$EDP','$T','$(W 304)','Ana','ana@example.com','cliente pidió cambiar de día','reschedule_proposed','10:00','11:00','$EDIT','$(TOK 900)');
SQL

L=$(sched $(E 5) $(W 305) 14:00 | cut -d: -f2)
LBL=cccccccc-cccc-4ccc-8ccc-0000000000a5
q "insert into reservations (id, trainer_id, availability_slot_id, client_name, client_email, notes, status, start_time, end_time) values ('$LBL','$T','$(W 305)','Ana','ana@example.com','Paquete de 10 clases · sesión 5/10','needs_reschedule','10:00','11:00')" >/dev/null
check "A L viva y enlazada a E5; LBL muerta, sin enlace" "$(state_of $(E 5)):$(st $LBL)" "scheduled:$L:needs_reschedule"

# Revisión v3 de Codex: notes Y email editados → ninguna pista.
#   HID   muerta (needs_reschedule), del crédito E6 según evidencia externa; E6 tiene otra viva L6.
#   HIDL  su variante VIVA: del crédito E7 según evidencia externa; E7 tiene otra viva L7
#         (el estado corrupto que dejaba la carrera de R2).
#   NRM   reserva web normal, muerta, sin pistas (el camino seguro de las reservas normales).
#   OLD   muerta, creada ANTES del primer paquete del entrenador: estructuralmente no es de paquete.
#   T3R   muerta, de un entrenador SIN paquetes: estructuralmente no es de paquete.
L6=$(sched $(E 6) $(W 306) 14:00 | cut -d: -f2)
L7=$(sched $(E 7) $(W 306) 16:00 | cut -d: -f2)
T3=33333333-3333-4333-8333-333333333333
HID=cccccccc-cccc-4ccc-8ccc-0000000000b1; HIDL=cccccccc-cccc-4ccc-8ccc-0000000000b2
NRM=cccccccc-cccc-4ccc-8ccc-0000000000b3; OLD=cccccccc-cccc-4ccc-8ccc-0000000000b4; T3R=cccccccc-cccc-4ccc-8ccc-0000000000b5
psqlc <<SQL
insert into trainers (id, name) values ('$T3', 'T3');
insert into availability_slots (id, trainer_id, session_date, start_time, end_time) values
  ('$(W 307)', '$T3', (now() at time zone 'Asia/Kuala_Lumpur')::date + 57, '08:00', '20:00');
insert into reservations (id, trainer_id, availability_slot_id, client_name, client_email, notes, status, start_time, end_time) values
  ('$HID',  '$T',  '$(W 306)', 'Ana',  'ana.nueva@example.com', 'recolocada por teléfono', 'needs_reschedule',     '10:00', '11:00'),
  ('$HIDL', '$T',  '$(W 306)', 'Ana',  'a.b@example.com',       'ver WhatsApp',            'pending_confirmation', '18:00', '19:00'),
  ('$NRM',  '$T',  '$(W 306)', 'Leo',  'leo@example.com',       'reserva web',             'cancelled',            '08:00', '09:00'),
  ('$T3R',  '$T3', '$(W 307)', 'Bea',  'bea@example.com',       'reserva web',             'cancelled',            '10:00', '11:00');
insert into reservations (id, trainer_id, availability_slot_id, client_name, client_email, notes, status, start_time, end_time, created_at) values
  ('$OLD',  '$T',  '$(W 306)', 'Ana',  'ana@example.com',       'antigua',                 'cancelled',            '12:00', '13:00',
   (select min(created_at) from client_packages where trainer_id = '$T') - interval '1 day');
SQL
check "A HIDL y L7 vivas a la vez (el crédito E7 ya respalda dos, sin que nada lo diga)" "$(st $HIDL):$(state_of $(E 7))" "pending_confirmation:scheduled:$L7"

echo "B) 012a → decisiones explícitas → 012b"
report() { q "select string_agg(problema || '=' || n, ' ' order by problema) from (select problema, count(*) n from package_credit_backfill_report group by 1) x"; }
blocking_of() { q "select coalesce(string_agg(reservation_id::text, ',' order by reservation_id), '-') from package_credit_backfill_report where problema = '$1'"; }
has_col() { q "select count(*) from information_schema.columns where table_name='reservations' and column_name='package_session_id'"; }
out=$(psqlc < migrations/012b_package_credit_single_live.sql 2>&1)
contains "B0 sin la 012a, la 012b se niega" "$out" "012b requiere la 012a"
check "B0 y no deja nada" "$(has_col):$(q "select count(*) from pg_proc where proname='propose_reschedule'")" "0:0"
psqlc < migrations/012a_package_credit_preparation.sql || { echo "  FAIL la 012a no se aplica"; FAIL=1; }
psqlc < migrations/012a_package_credit_preparation.sql || { echo "  FAIL la 012a no es idempotente"; FAIL=1; }
check "B1 la 012a no toca datos" "$(has_col):$(state_of $(S 1)):$(st $P)" "0:scheduled:$Q:pending_confirmation"
check "B1 informe inicial" "$(report)" "muerta_sin_clasificar=5 viva_sin_clasificar=5"
check "B1 viva_sin_clasificar: P, AMB, PUB, EDP y HIDL (nunca por suposición)" "$(blocking_of viva_sin_clasificar)" "$(printf '%s\n' $P $AMB $PUB $EDP $HIDL | sort | paste -sd, -)"
check "B1 muerta_sin_clasificar: R, EDIT, LBL, HID y NRM (irán a cuarentena)" "$(blocking_of muerta_sin_clasificar)" "$(printf '%s\n' $R $EDIT $LBL $HID $NRM | sort | paste -sd, -)"
check "B1 HID (notes y email editados) SÍ sale: criterio estructural, sin pistas" "$(q "select problema || ' | ' || cardinality(candidatos) || ' | ' || (detalle like 'sin pistas%') from package_credit_backfill_report where reservation_id='$HID'")" "muerta_sin_clasificar | 0 | true"
check "B1 HIDL (viva, editada) también, y bloquea" "$(q "select problema || ' | ' || (detalle like 'sin pistas%') from package_credit_backfill_report where reservation_id='$HIDL'")" "viva_sin_clasificar | true"
check "B1 fuera de la revisión: la anterior al primer paquete y la del entrenador sin paquetes" "$(q "select count(*) from package_credit_backfill_report where reservation_id in ('$OLD','$T3R')")" "0"
check "B1 varios candidatos → el detalle pide evidencia externa" "$(q "select (detalle like '%2 créditos candidatos: elegir uno exige evidencia externa%') from package_credit_backfill_report where reservation_id='$AMB'")" "t"
check "B1 volumen por entrenador y tipo (lo que hay que revisar a mano)" "$(q "select string_agg(problema || '=' || n, ' ' order by problema) from (select problema, count(*) n from package_credit_backfill_report where trainer_id='$T' group by 1) x")" "muerta_sin_clasificar=5 viva_sin_clasificar=5"
check "B1 LBL: candidatos S5 y E5, ninguno elegido" "$(q "select array_length(candidatos,1) || ':' || ('$(S 5)' = any(candidatos)) || ':' || ('$(E 5)' = any(candidatos)) from package_credit_backfill_report where reservation_id='$LBL'")" "2:true:true"
check "B1 AMB: dos candidatos (S3 de PKG y E3 de PKG2), ninguno elegido" "$(q "select array_length(candidatos,1) || ':' || ('$(S 3)' = any(candidatos)) || ':' || ('$(E 3)' = any(candidatos)) from package_credit_backfill_report where reservation_id='$AMB'")" "2:true:true"
check "B1 PUB: pista por email (en mayúsculas), 20 candidatos, pide evidencia externa" "$(q "select (detalle like 'pista: email de un paquete de este entrenador · 20 créditos candidatos: elegir uno exige evidencia externa%') from package_credit_backfill_report where reservation_id='$PUB'")" "t"
out=$(psqlc < migrations/012b_package_credit_single_live.sql 2>&1)
contains "B2 con vivas sin clasificar, la 012b ABORTA y dice cuántas" "$out" "(viva_sin_clasificar: 5)"
check "B2 y no cambia nada" "$(has_col):$(state_of $(S 1))" "0:scheduled:$Q"

# Decisiones, unas buenas y otras mal a propósito.
psqlc <<SQL
insert into package_credit_resolutions (reservation_id, package_session_id, decided_by, reason) values
  ('$P',    '$(S 1)', 'test', 'propuesta aceptada de la sesión 1'),
  ('$AMB',  '$(E 3)', 'test', 'era del segundo paquete'),
  ('$PUB',  null,     'test', 'reserva web pagada aparte'),
  ('$EDIT', '$F1',    'test', 'MAL: crédito de otro entrenador'),
  ('$R2',   null,     'test', 'MAL: contradice el enlace'),
  ('$P2',   '$(E 2)', 'test', 'MAL: contradice la descendencia'),
  ('$LBL',  null,     'test', 'MAL: lleva la etiqueta de paquete'),
  ('$HIDL', '$(E 7)', 'test', 'evidencia externa: el cliente pagó la sesión 7 del segundo paquete');
SQL
check "B3 informe con decisiones erróneas" "$(report)" "credito_con_varias_vivas=4 evidencia_contradictoria=2 muerta_sin_clasificar=3 resolucion_invalida=3"
check "B3 contradictorias: R2 (enlace vs no-paquete) y P2" "$(blocking_of evidencia_contradictoria)" "$(printf '%s\n' $R2 $P2 | sort | paste -sd, -)"
check "B3 inválidas: EDIT (crédito de T2), y LBL y R2 (llevan etiqueta y se declararon no-paquete)" "$(blocking_of resolucion_invalida)" "$(printf '%s\n' $EDIT $LBL $R2 | sort | paste -sd, -)"
check "B3 muertas sin clasificar: R, HID y NRM" "$(blocking_of muerta_sin_clasificar)" "$(printf '%s\n' $R $HID $NRM | sort | paste -sd, -)"
check "B3 varias vivas: P y Q en S1, y HIDL y L7 en E7 (la decisión destapa el duplicado)" "$(blocking_of credito_con_varias_vivas)" "$(printf '%s\n' $P $Q $HIDL $L7 | sort | paste -sd, -)"
check "B3 EDP ya no está sin resolver: hereda la decisión de su original EDIT" "$(q "select count(*) from package_credit_backfill_report where reservation_id='$EDP'")" "0"
out=$(psqlc < migrations/012b_package_credit_single_live.sql 2>&1)
contains "B4 la 012b aborta y lista cada tipo bloqueante (las muertas no)" "$out" "(credito_con_varias_vivas: 4, evidencia_contradictoria: 2, resolucion_invalida: 3)"
check "B4 y no cambia nada" "$(has_col)" "0"

# Arreglos explícitos.
psqlc <<SQL
delete from package_credit_resolutions where reservation_id in ('$R2', '$P2');
update package_credit_resolutions set package_session_id = '$(E 4)', reason = 'sesión 4 del segundo paquete' where reservation_id = '$EDIT';
update package_credit_resolutions set package_session_id = '$(E 5)', reason = 'la sesión 5 del segundo paquete (como L)' where reservation_id = '$LBL';
insert into package_credit_resolutions (reservation_id, package_session_id, decided_by, reason) values ('$R', '$(S 1)', 'test', 'original de la propuesta P');
update reservations set status = 'cancelled' where id in ('$Q', '$HIDL');
SQL
check "B5 solo quedan muertas sin clasificar (no bloquean): HID y NRM" "$(report):$(blocking_of muerta_sin_clasificar)" "muerta_sin_clasificar=2:$(printf '%s\n' $HID $NRM | sort | paste -sd, -)"
psqlc < migrations/012b_package_credit_single_live.sql || { echo "  FAIL la 012b no se aplica tras resolver"; FAIL=1; }
psqlc < migrations/012b_package_credit_single_live.sql || { echo "  FAIL la 012b no es idempotente"; FAIL=1; }
psqlc < migrations/012a_package_credit_preparation.sql || { echo "  FAIL la 012a no se puede reaplicar después"; FAIL=1; }
check "B6 aplicada: 3 funciones" "$(q "select count(*) from pg_proc where proname in ('schedule_package_session','unschedule_package_session','propose_reschedule')")" "3"
pid() { q "select coalesce(package_session_id::text, '-') from reservations where id='$1'"; }
check "B6 S1: R y P por decisión, Q por el enlace" "$(pid $R):$(pid $P):$(pid $Q)" "$(S 1):$(S 1):$(S 1)"
check "B6 S2: R2 y P2 por enlace + descendencia" "$(pid $R2):$(pid $P2)" "$(S 2):$(S 2)"
check "B6 AMB en E3 (la decisión), no en S3" "$(pid $AMB)" "$(E 3)"
check "B6 PUB sin crédito (declarada no-paquete)" "$(pid $PUB)" "-"
check "B6 EDIT y EDP en E4 (decisión + descendencia)" "$(pid $EDIT):$(pid $EDP)" "$(E 4):$(E 4)"
check "B6 enlaces siguen a la viva: S1→P, S2→P2, E3→AMB, E4→EDP" \
  "$(state_of $(S 1)) $(state_of $(S 2)) $(state_of $(E 3)) $(state_of $(E 4))" \
  "scheduled:$P scheduled:$P2 scheduled:$AMB scheduled:$EDP"
check "B6 ninguna viva de paquete sin crédito salvo PUB" "$(q "select coalesce(string_agg(id::text, ','), '-') from reservations r where package_session_id is null and $LIVE and lower(client_email) = 'ana@example.com'")" "$PUB"
check "B6 S1 ya no admite otra reserva" "$(sched $(S 1) $(W 6) 12:00 | cut -d: -f1)" "already_scheduled"
contains "B6 revivir la original R de S1 → no se permite (trigger)" "$(qt "update reservations set status='pending_confirmation' where id='$R'")" "reservations_package_no_revive"
check "B6 invariantes: multi / sin enlazar / incoherentes" "$(multi):$(unlinked_live):$(incoherent)" "0:0:0"
check "B6 ninguna reserva de Ana (viva O muerta) sin crédito salvo PUB (declarada) y OLD (anterior al primer paquete)" "$(q "select coalesce(string_agg(id::text, ',' order by id), '-') from reservations r where package_session_id is null and lower(client_email) = 'ana@example.com'")" "$(printf '%s\n' $PUB $OLD | sort | paste -sd, -)"
check "B6 tras la 012b el informe solo tiene las de la cuarentena (la columna cuenta como evidencia)" "$(report)" "muerta_sin_clasificar=2"
check "B6 cuarentena: HID y NRM" "$(q "select string_agg(reservation_id::text, ',' order by reservation_id) from package_credit_quarantine")" "$(printf '%s\n' $HID $NRM | sort | paste -sd, -)"
check "B6 E7: HIDL con crédito (muerta), L7 la única viva" "$(pid $HIDL):$(live_by_credit $(E 7)):$(state_of $(E 7))" "$(E 7):1:scheduled:$L7"

echo "B8) La secuencia de Codex (v2), después de la 012b"
check "B8 LBL (histórica, muerta) lleva el crédito E5 por decisión explícita" "$(pid $LBL)" "$(E 5)"
check "B8 L sigue siendo la única viva de E5 y la enlazada" "$(live_by_credit $(E 5)):$(state_of $(E 5))" "1:scheduled:$L"
contains "B8 reactivar LBL → no se permite (trigger)" "$(qt "update reservations set status='pending_confirmation' where id='$LBL'")" "reservations_package_no_revive"
check "B8 sigue una sola viva en E5" "$(live_by_credit $(E 5)):$(st $LBL)" "1:needs_reschedule"
# Y la vista, ya con la columna, no marca las que la app deja atrás: se reagenda S2 y la
# anterior (P2, ya sin enlace) no aparece como "sin resolver".
q "update reservations set status='cancelled' where id='$P2'" >/dev/null
check "B8 reagendar un crédito deja la anterior atrás" "$(sched $(S 2) $(W 6) 15:00 | cut -d: -f1)" "scheduled"
check "B8 y el informe no cambia (solo la cuarentena)" "$(report)" "muerta_sin_clasificar=2"
out=$(psqlc < migrations/012b_package_credit_single_live.sql 2>&1)
check "B8 la 012b se puede reaplicar después" "$(echo "$out" | grep -c ERROR)" "0"

echo "B7) Integridad de package_session_id (FK)"
contains "crédito inexistente → 23503" "$(qt "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, status, start_time, end_time, package_session_id) values ('$T','$(W 305)','X','x@example.com','cancelled','10:00','11:00','99999999-9999-4999-8999-999999999999')")" "reservations_package_session_id_fkey"
contains "cambiar a un crédito inexistente → 23503" "$(qt "update reservations set package_session_id='99999999-9999-4999-8999-999999999999' where id='$PUB'")" "reservations_package_session_id_fkey"
check "la FK es ON DELETE RESTRICT" "$(q "select confdeltype from pg_constraint where conname='reservations_package_session_id_fkey'")" "r"
before_del="$(pid $AMB):$(pid $EDIT):$(pid $EDP):$(pid $L):$(pid $LBL)"
contains "borrar un paquete con reservas (vivas e históricas) → 23503" "$(qt "delete from client_packages where id='$PKG2'")" "reservations_package_session_id_fkey"
check "y no cambia nada: paquete, sesiones y créditos intactos" "$(q "select count(*) from client_packages where id='$PKG2'"):$(q "select count(*) from package_sessions where client_package_id='$PKG2'"):$(pid $AMB):$(pid $EDIT):$(pid $EDP):$(pid $L):$(pid $LBL)" "1:10:$before_del"
contains "borrar una sesión suelta con reservas → 23503" "$(qt "delete from package_sessions where id='$(E 3)'")" "reservations_package_session_id_fkey"
# Cancelación normal del paquete: status = 'cancelled'.
q "update client_packages set status='cancelled' where id='$PKG2'" >/dev/null
check "cancelar el paquete: sus reservas conservan el crédito" "$(pid $AMB):$(pid $EDIT):$(pid $EDP):$(pid $L):$(pid $LBL)" "$before_del"
check "cancelado: no se agenda más" "$(sched $(E 6) $(W 305) 16:00 | cut -d: -f1)" "package_inactive"
contains "cancelado: el índice sigue protegiendo sus créditos" "$(qt "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, status, start_time, end_time, package_session_id) values ('$T','$(W 305)','Ana','ana@example.com','confirmed','17:00','18:00','$(E 3)')")" "reservations_one_live_per_package_session"
contains "cancelado: el trigger sigue impidiendo reactivar" "$(qt "update reservations set status='pending_confirmation' where id='$LBL'")" "reservations_package_no_revive"
check "cancelado: se puede desagendar (devolver) una sesión viva" "$(unsched $(E 5) "'$L'")" "unscheduled:$L"
check "cancelado: invariantes" "$(multi):$(unlinked_live):$(incoherent)" "0:0:0"
# Un paquete SIN reservas sí se puede borrar (el rollback de lib/packages/create.ts).
PKG3=aaaaaaaa-aaaa-4aaa-8aaa-000000000003
q "insert into client_packages (id, trainer_id, client_name, client_email, sessions_total, price_per_session_normal, discount_percent, price_per_session_discounted, price_total) values ('$PKG3','$T','Bea','bea@example.com',5,300,5,285,1425)" >/dev/null
q "insert into package_sessions (client_package_id, session_number) select '$PKG3', n from generate_series(1,5) n" >/dev/null
check "un paquete sin reservas se borra (con sus sesiones)" "$(q "delete from client_packages where id='$PKG3' returning 'borrado'"):$(q "select count(*) from package_sessions where client_package_id='$PKG3'")" "borrado:0"

echo "B9) Revisión v3 de Codex: notes y email editados, después de la 012b"
contains "B9 reactivar HID (en cuarentena) → no se permite" "$(qt "update reservations set status='pending_confirmation' where id='$HID'")" "reservations_legacy_unclassified"
check "B9 E6 sigue con UNA viva (L6); HID sigue muerta y sin crédito" "$(live_by_credit $(E 6)):$(st $HID):$(pid $HID)" "1:needs_reschedule:-"
contains "B9 ni siquiera a confirmed" "$(qt "update reservations set status='confirmed' where id='$HID'")" "reservations_legacy_unclassified"
check "B9 mover sin reactivar (sigue muerta) sí se puede" "$(q "update reservations set start_time='11:00', end_time='12:00' where id='$HID' returning status")" "needs_reschedule"
cls() { q "select classify_legacy_reservation('$1', $2, '$3', '$4')"; }
check "B9 clasificar sin motivo → invalid" "$(cls $HID "'$(E 6)'" Dani ' ')" "invalid"
check "B9 clasificar con crédito de otro entrenador → forbidden" "$(cls $HID "'$F1'" Dani 'x')" "forbidden"
check "B9 clasificar una que no está en cuarentena → not_quarantined" "$(cls $L6 "'$(E 6)'" Dani 'x')" "not_quarantined"
check "B9 crédito inexistente → not_found" "$(cls $HID "'99999999-9999-4999-8999-999999999999'" Dani 'x')" "not_found"
check "B9 los intentos fallidos no cambian nada" "$(pid $HID):$(q "select count(*) from package_credit_quarantine where reservation_id='$HID'")" "-:1"
check "B9 clasificar HID en E6 (evidencia externa)" "$(cls $HID "'$(E 6)'" Dani 'evidencia externa: pago de la sesión 6 del segundo paquete')" "classified"
check "B9 HID lleva E6, sale de la cuarentena y la decisión queda auditada" "$(pid $HID):$(q "select count(*) from package_credit_quarantine where reservation_id='$HID'"):$(q "select decided_by || ' / ' || reason from package_credit_resolutions where reservation_id='$HID'")" "$(E 6):0:Dani / evidencia externa: pago de la sesión 6 del segundo paquete"
contains "B9 reactivar HID ahora → no se permite (reserva de paquete muerta)" "$(qt "update reservations set status='pending_confirmation' where id='$HID'")" "reservations_package_no_revive"
check "B9 E6 nunca tuvo dos vivas" "$(live_by_credit $(E 6)):$(multi)" "1:0"
# El camino seguro de las reservas normales.
contains "B9 NRM (web, en cuarentena) tampoco se reactiva sin clasificar" "$(qt "update reservations set status='pending_confirmation' where id='$NRM'")" "reservations_legacy_unclassified"
check "B9 clasificar NRM como 'no es de paquete'" "$(cls $NRM null Dani 'reserva web cobrada con tarjeta')" "classified"
check "B9 y ya se mueve/reactiva como cualquier reserva normal" "$(q "update reservations set status='pending_confirmation' where id='$NRM' returning status"):$(pid $NRM)" "pending_confirmation:-"
check "B9 fuera de la revisión se reactivan sin clasificar: anterior al primer paquete y entrenador sin paquetes" "$(q "update reservations set status='pending_confirmation' where id='$OLD' returning status"):$(q "update reservations set status='pending_confirmation' where id='$T3R' returning status")" "pending_confirmation:pending_confirmation"
POST=cccccccc-cccc-4ccc-8ccc-0000000000b6
q "insert into reservations (id, trainer_id, availability_slot_id, client_name, client_email, status, start_time, end_time) values ('$POST','$T','$(W 306)','Ana','ana@example.com','cancelled','19:00','20:00')" >/dev/null
check "B9 una reserva creada DESPUÉS de la 012b no entra en la revisión y se reactiva" "$(q "select count(*) from package_credit_backfill_report where reservation_id='$POST'"):$(q "update reservations set status='pending_confirmation' where id='$POST' returning status")" "0:pending_confirmation"
check "B9 una etiqueta de paquete no se declara 'no es de paquete' (ni al clasificar)" "$(q "insert into package_credit_quarantine (reservation_id) values ('$LBL') returning 'q'"):$(q "update reservations set package_session_id = null where id = '$LBL' returning 'x'" >/dev/null; cls $LBL null Dani 'x')" "q:label_requires_credit"
q "update reservations set package_session_id = '$(E 5)' where id = '$LBL'; delete from package_credit_quarantine where reservation_id = '$LBL'" >/dev/null
check "B9 el informe queda vacío tras clasificar" "$(report)" ""
check "B9 el corte no se mueve al reaplicar la 012b" "$(q "select applied_at from package_credit_cutoff")" "$(psqlc < migrations/012b_package_credit_single_live.sql >/dev/null 2>&1; q "select applied_at from package_credit_cutoff")"
check "B9 invariantes" "$(multi):$(unlinked_live):$(incoherent)" "0:0:0"

echo "C) Secuencias con la 012"
# C1 — La secuencia de R2: reserva → propuesta → el crédito NO queda libre.
R=$(sched $(S 3) $(W 7) 10:00 | cut -d: -f2)
check "C1 la reserva nace con el crédito" "$(q "select package_session_id from reservations where id='$R'")" "$(S 3)"
P=$(propose $R $(W 8) 11:00 "" 11)
check "C1 propuesta creada" "${P%%:*}" "proposed"; P=${P#*:}
check "C1 original needs_reschedule, propuesta viva con el crédito heredado" "$(st $R):$(st $P):$(q "select package_session_id from reservations where id='$P'")" "needs_reschedule:reschedule_proposed:$(S 3)"
check "C1 el crédito apunta a la propuesta" "$(state_of $(S 3))" "scheduled:$P"
check "C1 agendar una tercera → already_scheduled" "$(sched $(S 3) $(W 9) 12:00 | cut -d: -f1)" "already_scheduled"
check "C1 una sola viva" "$(live_by_credit $(S 3))" "1"
# C2 — Aceptar: sigue ocupando el crédito.
check "C2 aceptar" "$(accept $P)" "$P"
check "C2 agendar → already_scheduled" "$(sched $(S 3) $(W 9) 12:00 | cut -d: -f1)" "already_scheduled"
# C3 — Reproponer sobre la aceptada: el crédito sigue a la nueva.
P3=$(propose $P $(W 10) 13:00 "" 12); check "C3 reproponer" "${P3%%:*}" "proposed"; P3=${P3#*:}
check "C3 la aceptada pasa a needs_reschedule, el crédito apunta a la nueva" "$(st $P):$(state_of $(S 3))" "needs_reschedule:scheduled:$P3"
check "C3 agendar → already_scheduled" "$(sched $(S 3) $(W 9) 12:00 | cut -d: -f1)" "already_scheduled"
# C4 — Rechazar: el crédito queda libre y se reagenda.
check "C4 rechazar" "$(reject $P3)" "$P3"
check "C4 ninguna viva" "$(live_by_credit $(S 3))" "0"
Q=$(sched $(S 3) $(W 9) 12:00); check "C4 reagendar tras rechazo" "${Q%%:*}" "scheduled"; Q=${Q#*:}
check "C4 el crédito apunta a la nueva" "$(state_of $(S 3))" "scheduled:$Q"
# C5 — Revivir al mover (→ pending_confirmation) una reserva de paquete muerta: no se permite
#      (trigger reservations_package_no_revive, 23514 → moveReservation 409).
ERR=$(qt "update reservations set status='pending_confirmation', start_time='15:00', end_time='16:00' where id='$P3'")
contains "C5 revivir la propuesta rechazada → no se permite" "$ERR" "reservations_package_no_revive"
ERR=$(qt "update reservations set status='confirmed' where id='$R'")
contains "C5 revivir la original (a confirmed) → no se permite" "$ERR" "reservations_package_no_revive"
check "C5 sigue una sola viva, la enlazada" "$(live_by_credit $(S 3)):$(state_of $(S 3))" "1:scheduled:$Q"
check "C5 mover (sin revivir) una reserva de paquete viva sí se puede" "$(q "update reservations set start_time='13:00', end_time='14:00' where id='$Q' returning status")" "pending_confirmation"
# El índice sigue siendo la red: una segunda viva del mismo crédito por cualquier camino → 23505.
contains "C5 insertar otra viva del mismo crédito → 23505" "$(qt "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, status, start_time, end_time, package_session_id) values ('$T','$(W 13)','Ana','ana@example.com','confirmed','16:00','17:00','$(S 3)')")" "reservations_one_live_per_package_session"
# C6 — Cancelar la propuesta (Reservas → Cancelar) libera el crédito.
R=$(sched $(S 4) $(W 11) 10:00 | cut -d: -f2); P=$(propose $R $(W 12) 11:00 "" 13 | cut -d: -f2)
q "update reservations set status='cancelled', proposal_token=null where id='$P'" >/dev/null
check "C6 tras cancelar la propuesta se puede agendar" "$(sched $(S 4) $(W 13) 12:00 | cut -d: -f1)" "scheduled"
# C7 — "Sin pista" sin propuesta (regla de siempre): el crédito queda libre.
R=$(sched $(S 5) $(W 14) 10:00 | cut -d: -f2)
q "update reservations set status='needs_reschedule' where id='$R'" >/dev/null
contains "C7 revivirla con el crédito libre tampoco (se agenda desde el paquete)" "$(qt "update reservations set status='pending_confirmation' where id='$R'")" "reservations_package_no_revive"
check "C7 needs_reschedule sin propuesta → se puede agendar" "$(sched $(S 5) $(W 15) 12:00 | cut -d: -f1)" "scheduled"
# C8 — Desagendar con la propuesta viva: la cancela y devuelve el crédito.
R=$(sched $(S 6) $(W 16) 10:00 | cut -d: -f2); P=$(propose $R $(W 17) 11:00 "" 14 | cut -d: -f2)
check "C8 desagendar esperando la ORIGINAL (vista antigua) → changed" "$(unsched $(S 6) "'$R'" | cut -d: -f1)" "changed"
check "C8 desagendar esperando la propuesta → cancela la propuesta" "$(unsched $(S 6) "'$P'")" "unscheduled:$P"
check "C8 propuesta cancelada, token anulado, crédito libre" "$(q "select status || ':' || coalesce(proposal_token,'-') from reservations where id='$P'"):$(state_of $(S 6))" "cancelled:-:not_scheduled:-"
# C9 — Reservas sin paquete: propose_reschedule funciona igual, sin crédito.
q "insert into reservations (id, trainer_id, availability_slot_id, client_name, client_email, status, start_time, end_time, player_id, client_message, player_count, whatsapp_opt_in, price, notes)
   values ('cccccccc-cccc-4ccc-8ccc-000000000001','$T','$(W 18)','Leo','leo@example.com','pending_confirmation','10:00','11:00','dddddddd-dddd-4ddd-8ddd-000000000001','Hola',3,true,350,'interna')" >/dev/null
N=cccccccc-cccc-4ccc-8ccc-000000000001
P=$(propose $N $(W 18) 10:30 "" 15); check "C9 proponer en la misma ventana, solapando con la original" "${P%%:*}" "proposed"; P=${P#*:}
check "C9 la propuesta copia los datos y no lleva crédito" \
  "$(q "select client_name||'|'||client_email||'|'||player_id||'|'||client_message||'|'||player_count||'|'||whatsapp_opt_in||'|'||price||'|'||notes||'|'||start_time||'|'||end_time||'|'||rescheduled_from_id||'|'||coalesce(package_session_id::text,'-') from reservations where id='$P'")" \
  "Leo|leo@example.com|dddddddd-dddd-4ddd-8ddd-000000000001|Hola|3|true|350|interna|10:30:00|11:30:00|$N|-"
check "C9 una reserva SIN paquete muerta sí se puede reactivar al mover (como siempre)" "$(q "update reservations set status='pending_confirmation', start_time='15:00', end_time='16:00' where id='$N' returning status")" "pending_confirmation"
# C10 — Atomicidad: un solape (23P01) deshace todo; la original sigue pendiente y el crédito igual.
R=$(sched $(S 7) $(W 19) 10:00 | cut -d: -f2)
q "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, status, start_time, end_time) values ('$T','$(W 20)','X','x@example.com','confirmed','11:00','12:00')" >/dev/null
ERR=$(propose $R $(W 20) 11:30 "" 16)
contains "C10 solape → 23P01" "$ERR" "reservations_no_overlap"
check "C10 la original sigue pendiente y el crédito en ella" "$(st $R):$(state_of $(S 7))" "pending_confirmation:scheduled:$R"
check "C10 no quedó propuesta" "$(q "select count(*) from reservations where rescheduled_from_id='$R'")" "0"
# C11 — Reglas de propose_reschedule (todas sin escribir nada).
check "C11 otro entrenador → forbidden" "$(propose $R $(W 21) 10:00 $T2 17 | cut -d: -f1)" "forbidden"
check "C11 ventana de otro entrenador → forbidden" "$(propose $R $(W 99) 10:00 "" 18 | cut -d: -f1)" "forbidden"
check "C11 misma franja → same_range" "$(propose $R $(W 19) 10:00 "" 19 | cut -d: -f1)" "same_range"
check "C11 ventana bloqueada → window_closed" "$(propose $R $(W 97) 10:00 "" 20 | cut -d: -f1)" "window_closed"
check "C11 fuera de la ventana → out_of_window" "$(propose $R $(W 21) 19:30 "" 21 | cut -d: -f1)" "out_of_window"
check "C11 ayer → past" "$(propose $R $(W 98) 10:00 "" 22 | cut -d: -f1)" "past"
check "C11 token no válido → invalid" "$(qt "select outcome from propose_reschedule('$R','$T','$(W 21)','10:00','corto')")" "invalid"
check "C11 reserva inexistente → not_found" "$(propose 99999999-9999-4999-8999-999999999999 $(W 21) 10:00 "" 23 | cut -d: -f1)" "not_found"
check "C11 sobre una confirmada → not_pending" "$(q "update reservations set status='confirmed' where id='$R'"; propose $R $(W 21) 10:00 "" 24 | cut -d: -f1)" "not_pending"
check "C11 nada cambió" "$(st $R):$(state_of $(S 7)):$(q "select count(*) from reservations where rescheduled_from_id='$R'")" "confirmed:scheduled:$R:0"
check "invariantes tras C: multi / sin enlazar / incoherentes" "$(multi):$(unlinked_live):$(incoherent)" "0:0:0"

echo "D) Carreras (deterministas: se observa en pg_stat_activity quién espera a quién; nada de medir tiempos)"
# D1 — proponer (A, a medias) ↔ agendar el mismo crédito (B): B espera el bloqueo del crédito y ve el crédito ocupado.
R=$(sched $(S 8) $(W 22) 10:00 | cut -d: -f2)
hold_start 601 r2-A "select outcome from propose_reschedule('$R','$T','$(W 23)','11:00','$(TOK 31)')"
bg_run r2-B "select outcome || ':' || coalesce(reservation_id::text,'-') from schedule_package_session('$(S 8)','$T','$(W 24)','12:00','pending_confirmation')"
wait_lock r2-B table
check "D1 agendar está bloqueado por la propuesta en curso (observado)" "$(lock_state r2-B)" "Lock"
hold_release 601
check "D1 proponer" "$(cat $TMP/r2-A.out)" "proposed"
check "D1 agendar → already_scheduled" "$(cut -d: -f1 $TMP/r2-B.out)" "already_scheduled"
check "D1 una sola viva" "$(live_by_credit $(S 8))" "1"
# D2 — desagendar (A) ↔ proponer sobre la original (B): B espera y ve la original cancelada.
R=$(sched $(S 9) $(W 25) 10:00 | cut -d: -f2)
hold_start 602 r2-A "select outcome from unschedule_package_session('$(S 9)','$T','$R')"
bg_run r2-B "select outcome || ':' || coalesce(proposal_id::text,'-') from propose_reschedule('$R','$T','$(W 26)','11:00','$(TOK 32)')"
wait_lock r2-B table
check "D2 proponer está bloqueado por el desagendado en curso (observado)" "$(lock_state r2-B)" "Lock"
hold_release 602
check "D2 desagendar" "$(cat $TMP/r2-A.out)" "unscheduled"
check "D2 proponer → not_pending" "$(cut -d: -f1 $TMP/r2-B.out)" "not_pending"
check "D2 ninguna viva, crédito libre" "$(live_by_credit $(S 9)):$(state_of $(S 9))" "0:not_scheduled:-"
# D3 — proponer (A) ↔ desagendar con la vista antigua (B): → changed; la propuesta sigue viva y enlazada.
R=$(sched $(S 9) $(W 27) 10:00 | cut -d: -f2)
hold_start 603 r2-A "select outcome || ':' || proposal_id from propose_reschedule('$R','$T','$(W 28)','11:00','$(TOK 33)')"
bg_run r2-B "select outcome || ':' || coalesce(cancelled_reservation_id::text,'-') from unschedule_package_session('$(S 9)','$T','$R')"
wait_lock r2-B table
check "D3 desagendar está bloqueado por la propuesta en curso (observado)" "$(lock_state r2-B)" "Lock"
hold_release 603
P=$(cut -d: -f2 $TMP/r2-A.out)
check "D3 desagendar → changed" "$(cut -d: -f1 $TMP/r2-B.out)" "changed"
check "D3 la propuesta sigue viva y enlazada" "$(st $P):$(state_of $(S 9))" "reschedule_proposed:scheduled:$P"
# D4 — agendar (A, a medias) ↔ revivir la reserva muerta enlazada (B): B se rechaza por su propia fila
#      mientras A SIGUE a medias (no depende de A).
q "update reservations set status='needs_reschedule' where id='$P'" >/dev/null
hold_start 604 r2-A "select outcome from schedule_package_session('$(S 9)','$T','$(W 30)','12:00','pending_confirmation')"
B=$(qt "update reservations set status='pending_confirmation' where id='$P'")
contains "D4 revivir → no se permite" "$B" "reservations_package_no_revive"
check "D4 y A seguía a medias cuando B respondió (B no esperó a A)" "$(lock_state r2-A advisory)" "Lock"
hold_release 604
check "D4 agendar" "$(cat $TMP/r2-A.out)" "scheduled"
check "D4 una sola viva, enlazada" "$(live_by_credit $(S 9)):$(unlinked_live)" "1:0"
# D5 — La red del índice: dos inserciones vivas del mismo crédito por fuera de las funciones.
#      La segunda espera a la primera (observado) y falla con 23505.
X=cccccccc-cccc-4ccc-8ccc-0000000000d5
hold_start 605 r2-A "insert into reservations (id, trainer_id, availability_slot_id, client_name, client_email, status, start_time, end_time, package_session_id) values ('$X','$T','$(W 29)','Ana','ana@example.com','confirmed','08:00','09:00','$(S 10)') returning 'inserted'"
bg_run r2-B "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, status, start_time, end_time, package_session_id) values ('$T','$(W 29)','Ana','ana@example.com','confirmed','15:00','16:00','$(S 10)')"
wait_lock r2-B table
check "D5 la segunda está bloqueada por la primera (observado)" "$(lock_state r2-B)" "Lock"
hold_release 605
check "D5 la primera entra" "$(cat $TMP/r2-A.out)" "inserted"
contains "D5 la segunda → 23505" "$(cat $TMP/r2-B.out)" "reservations_one_live_per_package_session"
q "update reservations set status='cancelled' where id='$X'" >/dev/null
# D5b — Autocomprobación de los detectores de D6: un psql que no termina y una espera de bloqueo
#       tienen que acabar como TIMEOUT / lock_timeout registrados, no colgando la prueba.
hold_start 606 r2-A "select id from package_sessions where id='$(S 10)' for update"
cat > $TMP/selftest.sh <<'EOSH'
rm -rf /tmp/d6r && mkdir -p /tmp/d6r
run() {
  timeout 3 psql -U postgres -q -At -v VERBOSITY=terse -f - > /tmp/d6r/$1.out 2>&1
  rc=$?
  if [ $rc -eq 124 ] || [ $rc -eq 143 ]; then echo "TIMEOUT $1" >> /tmp/d6r/$1.out; fi
}
run cuelga <<'EOSQL' &
select pg_sleep(60);
EOSQL
PGOPTIONS='-c lock_timeout=1s' run bloqueo <<'EOSQL' &
select id from package_sessions where id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000010' for update;
EOSQL
wait
EOSH
docker exec -i "$C" sh -c 'cat > /tmp/selftest.sh' < $TMP/selftest.sh
docker exec "$C" sh /tmp/selftest.sh
hold_release 606
check "D5b un psql que no termina queda marcado TIMEOUT" "$(docker exec "$C" sh -c 'grep -c TIMEOUT /tmp/d6r/cuelga.out')" "1"
check "D5b una espera de bloqueo acaba en lock_timeout" "$(docker exec "$C" sh -c 'grep -c "lock timeout" /tmp/d6r/bloqueo.out')" "1"
# D6 — Ráfagas: por crédito y ronda, en paralelo: 4 proponer sobre la reserva vista, 4 agendar,
#      2 desagendar (con la vista), 1 aceptar, 1 rechazar y 1 intento de revivir (siempre rechazado).
#      Invariantes tras cada ronda.
#      Cada ronda es UN docker exec que lanza los psql dentro del contenedor, cada uno con
#      `timeout` (busybox), statement_timeout y lock_timeout; y la ronda entera tiene un límite en el
#      host. Un atasco es un FAIL con volcado de pg_stat_activity/pg_locks, nunca un cuelgue.
#      (Antes eran ~52 `docker exec` simultáneos por ronda: la hipótesis más probable del cuelgue que
#      vio Codex es el propio docker CLI/daemon con esa ráfaga; en Postgres cualquier espera acaba en
#      un resultado, un error o la detección de interbloqueos.)
q "insert into package_sessions (id, client_package_id, session_number) select ('bbbbbbbb-bbbb-4bbb-8bbb-' || lpad((100 + n)::text, 12, '0'))::uuid, '$PKG', 10 + n from generate_series(1,4) n" >/dev/null
q "insert into availability_slots (id, trainer_id, session_date, start_time, end_time) select ('00000000-0000-4000-8000-' || lpad((200 + n)::text, 12, '0'))::uuid, '$T', (now() at time zone 'Asia/Kuala_Lumpur')::date + 100 + n, '06:00', '22:00' from generate_series(1, 40) n" >/dev/null
bad_multi=0; bad_unlinked=0; bad_incoh=0; stuck=0; k=100
: > $TMP/d6_all.txt
job() { # nombre, sql → una línea del script de la ronda
  printf 'run %s <<'"'"'EOSQL'"'"' &\n%s\nEOSQL\n' "$1" "$2" >> $TMP/round.sh
}
for round in 1 2 3 4 5 6 7 8; do
  cat > $TMP/round.sh <<'EOSH'
export PGOPTIONS='-c statement_timeout=20s -c lock_timeout=15s'
rm -rf /tmp/d6r && mkdir -p /tmp/d6r
run() {
  timeout 30 psql -U postgres -q -At -v VERBOSITY=terse -f - > /tmp/d6r/$1.out 2>&1
  rc=$?
  if [ $rc -eq 124 ] || [ $rc -eq 143 ]; then echo "TIMEOUT $1" >> /tmp/d6r/$1.out; fi
}
EOSH
  for c in 1 2 3 4; do
    s=$(S $((100 + c))); seen=$(link_of $s); exp=$([ -n "$seen" ] && echo "'$seen'" || echo null)
    w=$((200 + (round - 1) * 5 + c))
    if [ -n "$seen" ]; then
      for h in 06:00 08:00 10:00 12:00; do k=$((k + 1)); job "p${c}_$h" "select outcome || ':' || coalesce(proposal_id::text,'-') from propose_reschedule('$seen','$T','$(W $w)','$h','$(TOK $k)')"; done
      job "acc$c" "update reservations set status='pending_confirmation', proposal_token=null where id=(select id from reservations where rescheduled_from_id='$seen' and status='reschedule_proposed' limit 1) returning 'accepted:'"
      job "rej$c" "update reservations set status='needs_reschedule', proposal_token=null where id=(select id from reservations where rescheduled_from_id='$seen' and status='reschedule_proposed' order by created_at desc limit 1) returning 'rejected:'"
      job "rev$c" "update reservations set status='pending_confirmation' where id='$seen' and status='needs_reschedule' returning 'revived:'"
    fi
    for h in 14:00 16:00 18:00 20:00; do job "s${c}_$h" "select outcome || ':' || coalesce(reservation_id::text,'-') from schedule_package_session('$s','$T','$(W $w)','$h','pending_confirmation')"; done
    for i in 1 2; do job "u${c}_$i" "select outcome || ':' || coalesce(cancelled_reservation_id::text,'-') from unschedule_package_session('$s','$T',$exp)"; done
  done
  echo 'wait' >> $TMP/round.sh
  docker exec -i "$C" sh -c 'cat > /tmp/round.sh' < $TMP/round.sh
  ( docker exec "$C" sh /tmp/round.sh ) & rp=$!
  for i in $(seq 1 600); do kill -0 $rp 2>/dev/null || break; sleep 0.1; done
  if kill -0 $rp 2>/dev/null; then
    stuck=$((stuck + 1)); echo "  FAIL D6 ronda $round atascada más de 60 s; estado:"
    q "select application_name, state, wait_event_type, wait_event, left(query, 90) from pg_stat_activity where datname = 'postgres' and pid <> pg_backend_pid()"
    q "select locktype, mode, granted, pid from pg_locks where not granted"
    kill $rp 2>/dev/null
  fi
  wait $rp 2>/dev/null
  docker exec "$C" sh -c 'cat /tmp/d6r/*.out' >> $TMP/d6_all.txt
  bad_multi=$((bad_multi + $(multi))); bad_unlinked=$((bad_unlinked + $(unlinked_live))); bad_incoh=$((bad_incoh + $(incoherent)))
done
echo "  D6 resultados: $(sed 's/.*reservations_package_no_revive.*/no_revive/; s/.*reservations_one_live_per_package_session.*/23505/; s/.*reservations_no_overlap.*/23P01/; s/.*lock timeout.*/lock_timeout/; s/.*statement timeout.*/statement_timeout/; s/.*deadlock.*/40P01/; s/:.*//' $TMP/d6_all.txt | grep -v '^$' | sort | uniq -c | awk '{printf "%s=%s ", $2, $1}')"
check "D6 ninguna ronda atascada" "$stuck" "0"
check "D6 ningún psql agotó su timeout" "$(grep -c '^TIMEOUT' $TMP/d6_all.txt)" "0"
check "D6 ningún crédito con dos vivas (8 rondas)" "$bad_multi" "0"
check "D6 ninguna viva sin que el crédito apunte a ella (8 rondas)" "$bad_unlinked" "0"
check "D6 créditos incoherentes (8 rondas)" "$bad_incoh" "0"
check "D6 hubo propuestas, agendados y desagendados con éxito" "$([ $(grep -c '^proposed:' $TMP/d6_all.txt) -ge 4 ] && [ $(grep -c '^scheduled:' $TMP/d6_all.txt) -ge 4 ] && [ $(grep -c '^unscheduled:' $TMP/d6_all.txt) -ge 4 ] && echo si)" "si"
check "D6 ningún intento de revivir tuvo éxito" "$(grep -c '^revived:' $TMP/d6_all.txt)" "0"
check "D6 sin errores inesperados (solo outcomes, revivir rechazado, 23505 del crédito o 23P01)" "$(grep -v '^$' $TMP/d6_all.txt | grep -vcE '^(proposed|scheduled|already_scheduled|unscheduled|not_scheduled|changed|not_pending|accepted|rejected):|reservations_package_no_revive|reservations_one_live_per_package_session|reservations_no_overlap')" "0"
grep -v '^$' $TMP/d6_all.txt | grep -vE '^(proposed|scheduled|already_scheduled|unscheduled|not_scheduled|changed|not_pending|accepted|rejected):|reservations_package_no_revive|reservations_one_live_per_package_session|reservations_no_overlap' | sort | uniq -c | head -5

check "D package_credit_integrity_check sin filas que bloqueen tras todas las carreras" "$(q "select count(*) from package_credit_integrity_check where bloquea")" "0"

echo "E) Permisos"
for fn in "select * from propose_reschedule('$R','$T','$(W 21)','10:00','$(TOK 90)')" "select * from schedule_package_session('$(S 10)','$T','$(W 21)','10:00','pending_confirmation')" "select * from unschedule_package_session('$(S 10)','$T',null)"; do
  check "anon no puede: ${fn:14:28}" "$(q "set role anon; $fn" 2>&1 | grep -c 'permission denied')" "1"
  check "authenticated no puede: ${fn:14:28}" "$(q "set role authenticated; $fn" 2>&1 | grep -c 'permission denied')" "1"
done
check "service_role puede las tres" "$(q "select bool_and(has_function_privilege('service_role', p.oid, 'execute')) from pg_proc p where proname in ('propose_reschedule','schedule_package_session','unschedule_package_session')")" "t"
check "SECURITY INVOKER las tres" "$(q "select bool_or(prosecdef) from pg_proc where proname in ('propose_reschedule','schedule_package_session','unschedule_package_session')")" "f"
for obj in package_credit_resolutions package_credit_backfill_report package_credit_backfill_mapping package_credit_quarantine package_credit_cutoff package_credit_integrity_check; do
  check "anon no puede leer $obj" "$(q "set role anon; select count(*) from $obj" 2>&1 | grep -c 'permission denied')" "1"
  check "authenticated no puede leer $obj" "$(q "set role authenticated; select count(*) from $obj" 2>&1 | grep -c 'permission denied')" "1"
done
check "authenticated no puede escribir decisiones" "$(q "set role authenticated; insert into package_credit_resolutions (reservation_id, decided_by, reason) values ('$PUB','x','x')" 2>&1 | grep -c 'permission denied')" "1"
check "las tablas de decisiones, cuarentena y corte llevan RLS" "$(q "select count(*) from pg_class where relname in ('package_credit_resolutions','package_credit_quarantine','package_credit_cutoff') and relrowsecurity")" "3"
check "anon no puede clasificar" "$(q "set role anon; select classify_legacy_reservation('$PUB', null, 'x', 'x')" 2>&1 | grep -c 'permission denied')" "1"
check "authenticated no puede clasificar" "$(q "set role authenticated; select classify_legacy_reservation('$PUB', null, 'x', 'x')" 2>&1 | grep -c 'permission denied')" "1"
check "service_role puede clasificar; SECURITY INVOKER" "$(q "select has_function_privilege('service_role','public.classify_legacy_reservation(uuid,uuid,text,text)','execute') || ':' || prosecdef from pg_proc where proname='classify_legacy_reservation'")" "true:false"
check "las vistas son security_invoker" "$(q "select count(*) from pg_class where relname in ('package_credit_backfill_report','package_credit_backfill_mapping') and 'security_invoker=true' = any(reloptions)")" "2"

echo; [ $FAIL = 0 ] && echo "TODO OK" || echo "HAY FALLOS"
exit $FAIL
