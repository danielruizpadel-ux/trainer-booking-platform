#!/bin/bash
# R1 — schedule_package_session / unschedule_package_session (migración 011)
# contra una Postgres 16 LOCAL y desechable en Docker. NUNCA conecta con
# Supabase: no lee .env.local ni usa ninguna URL; todo va por `docker exec` a
# un contenedor sin puertos publicados que crea este script y borra al
# terminar (salvo KEEP=1).
#
# Aplica un esquema mínimo (solo lo que tocan 004/006/007/008/010/011, no el
# real de Supabase), las migraciones 006, 008 y 011 del repo, y comprueba:
#   0. la 011 aborta si falta un requisito, y aplicada dos veces es idempotente
#   1. agendar: intercalado forzado; B espera al bloqueo de A y ve el crédito usado
#   2. agendar: ráfagas de 12 peticiones por crédito, horas distintas sin solape
#   3. agendar: un 23P01 no deja reserva ni crédito a medias
#   4. agendar: reagendar tras cancelar / needs_reschedule, también en paralelo
#   5. agendar: reglas (dueño, paquete, estado, medianoche, datos del paquete)
#   6. agendar: invariantes de la ventana DENTRO de la función (cerrada, fuera
#      de rango, pasada, duración) aunque se llame sin el wrapper TypeScript
#   7. desagendar: fallo forzado DESPUÉS de cancelar la reserva (y al cancelar)
#      → reserva y crédito se quedan exactamente como estaban
#   8. desagendar ↔ reagendar concurrentes, en los dos órdenes, y en ráfaga
#   9. permisos (anon/authenticated no las ejecutan; SECURITY INVOKER)
#  10. control: el flujo ANTIGUO sí reproduce la carrera
#
# Las fechas son relativas a hoy (Asia/Kuala_Lumpur) para que la regla de
# "hora pasada" no haga caducar la prueba. Para los intercalados forzados, B
# no arranca hasta que A está de verdad dentro de su pg_sleep (con el bloqueo).
#
#   bash scripts/verify-package-schedule-concurrency.sh
set -u
cd "$(dirname "$0")/.."
C=r1-pkg-pg-verify
TMP=$(mktemp -d)
cleanup() { [ "${KEEP:-0}" = 1 ] || docker rm -f "$C" >/dev/null 2>&1; rm -rf "$TMP"; }
trap cleanup EXIT
docker rm -f "$C" >/dev/null 2>&1
docker run -d --name "$C" -e POSTGRES_PASSWORD=local postgres:16-alpine >/dev/null || exit 1
for i in $(seq 1 60); do docker exec "$C" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 1
psqlc() { docker exec -i "$C" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
q() { psqlc -At -c "$1"; }
FAIL=0
check() { if [ "$2" == "$3" ]; then echo "  OK   $1 ($2)"; else echo "  FAIL $1: esperado '$3', obtenido '$2'"; FAIL=1; fi; }
contains() { case "$2" in *"$3"*) echo "  OK   $1";; *) echo "  FAIL $1: no contiene '$3': $2"; FAIL=1;; esac; }

psqlc <<'SQL' || exit 1
-- Esquema mínimo local (NO es Supabase): solo lo que tocan 006/008/011.
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
  -- 007
  start_time time, end_time time, duration_minutes smallint not null default 60,
  -- 010
  player_id uuid, client_message text, player_count smallint not null default 1, whatsapp_opt_in boolean,
  created_at timestamptz default now(), updated_at timestamptz default now());
SQL
psqlc < migrations/006_class_packages.sql || exit 1
psqlc -c "alter table public.client_packages add column if not exists duration_minutes smallint not null default 60" || exit 1  # 007
psqlc < migrations/008_reservations_no_overlap.sql 2>/dev/null || exit 1

echo "0) Migración 011"
out=$(psqlc < migrations/011_package_session_atomic_schedule.sql 2>&1)
contains "sin la 004 aborta con un mensaje claro" "$out" "011 requiere la 004"
check "y no deja ninguna función creada" "$(q "select count(*) from pg_proc where proname like '%schedule_package_session'")" "0"
psqlc -c "alter table public.reservations add column proposal_token text" || exit 1  # 004
psqlc < migrations/011_package_session_atomic_schedule.sql || exit 1
psqlc < migrations/011_package_session_atomic_schedule.sql || { echo "011 no es idempotente"; exit 1; }
check "aplicada dos veces: 2 funciones" "$(q "select count(*) from pg_proc where proname in ('schedule_package_session','unschedule_package_session')")" "2"

T=11111111-1111-4111-8111-111111111111
T2=22222222-2222-4222-8222-222222222222
PKG=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
PKG90=aaaaaaaa-aaaa-4aaa-8aaa-000000000090
PKG45=aaaaaaaa-aaaa-4aaa-8aaa-000000000045
S() { echo "bbbbbbbb-bbbb-4bbb-8bbb-$(printf '%012d' $1)"; }
W() { echo "00000000-0000-4000-8000-$(printf '%012d' $1)"; }
# Día n a partir de hoy en Kuala Lumpur (n >= 1: siempre futuro).
D() { q "select ((now() at time zone 'Asia/Kuala_Lumpur')::date + $1)::text"; }

psqlc <<SQL
insert into trainers (id, name) values ('$T','T'), ('$T2','T2');
-- W1..W8: ventanas 08:00-20:00 del entrenador T, días +1..+8. W9: del entrenador T2.
insert into availability_slots (id, trainer_id, session_date, start_time, end_time)
  select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '$T',
         (now() at time zone 'Asia/Kuala_Lumpur')::date + n, '08:00', '20:00'
    from generate_series(1, 8) n;
insert into availability_slots (id, trainer_id, session_date, start_time, end_time) values
  ('$(W 9)','$T2',(now() at time zone 'Asia/Kuala_Lumpur')::date + 1,'08:00','20:00'),
  -- W10 bloqueada, W11 full, W12 ayer, W13 hoy 00:00-23:59
  ('$(W 10)','$T',(now() at time zone 'Asia/Kuala_Lumpur')::date + 20,'08:00','20:00'),
  ('$(W 11)','$T',(now() at time zone 'Asia/Kuala_Lumpur')::date + 21,'08:00','20:00'),
  ('$(W 12)','$T',(now() at time zone 'Asia/Kuala_Lumpur')::date - 1,'08:00','20:00'),
  ('$(W 13)','$T',(now() at time zone 'Asia/Kuala_Lumpur')::date,'00:00','23:59');
update availability_slots set status = 'blocked' where id = '$(W 10)';
update availability_slots set status = 'full' where id = '$(W 11)';
insert into client_packages (id, trainer_id, client_name, client_email, sessions_total, price_per_session_normal, discount_percent, price_per_session_discounted, price_total, duration_minutes) values
  ('$PKG','$T','Ana','ana@example.com',10,300,10,270,2700,60),
  ('$PKG90','$T','Bea','bea@example.com',5,450,5,427.5,2137.5,90),
  ('$PKG45','$T','Cai','cai@example.com',5,300,5,285,1425,45);
-- S(1..10) del paquete de 60; S(91..95) del de 90; S(45) del de 45 (duración inválida).
insert into package_sessions (id, client_package_id, session_number)
  select ('bbbbbbbb-bbbb-4bbb-8bbb-' || lpad(n::text, 12, '0'))::uuid, '$PKG', n from generate_series(1,10) n;
insert into package_sessions (id, client_package_id, session_number)
  select ('bbbbbbbb-bbbb-4bbb-8bbb-' || lpad((90 + n)::text, 12, '0'))::uuid, '$PKG90', n from generate_series(1,5) n;
insert into package_sessions (id, client_package_id, session_number) values ('$(S 45)', '$PKG45', 1);
SQL

call() { echo "select outcome || ':' || coalesce(reservation_id::text,'-') from schedule_package_session('$1','$2','$3','$4','pending_confirmation')"; }
uncall() { echo "select outcome || ':' || coalesce(cancelled_reservation_id::text,'-') from unschedule_package_session('$1','$2',$3)"; }
link_of() { q "select coalesce(reservation_id::text,'') from package_sessions where id='$1'"; }
state_of() { q "select status || ':' || coalesce(reservation_id::text,'-') from package_sessions where id='$1'"; }
res_status() { q "select status from reservations where id='$1'"; }
live_for_session() { q "select count(*) from reservations r join client_packages cp on r.client_email = cp.client_email where cp.id = (select client_package_id from package_sessions where id='$1') and r.notes like '%sesión ' || (select session_number from package_sessions where id='$1') || '/%' and coalesce(r.status,'') not in ('cancelled','canceled','needs_reschedule')"; }
orphans() { q "select count(*) from reservations r where r.notes like 'Paquete de %' and coalesce(r.status,'') not in ('cancelled','canceled','needs_reschedule') and not exists (select 1 from package_sessions ps where ps.reservation_id = r.id)"; }
incoherent() { q "select count(*) from package_sessions where (status = 'scheduled') <> (reservation_id is not null)"; }
# Espera a que otra conexión esté dentro de pg_sleep (es decir, ya tiene sus bloqueos).
wait_holder() { for i in $(seq 1 100); do [ "$(q "select count(*) from pg_stat_activity where state = 'active' and query like '%pg_sleep%' and pid <> pg_backend_pid()")" -ge 1 ] && return 0; sleep 0.1; done; echo "  FAIL A nunca llegó a pg_sleep"; FAIL=1; }
# A: la sentencia $1 dentro de una transacción que se queda 2 s abierta con sus bloqueos.
hold() { psqlc -At -c "begin;" -c "$1" -c "select pg_sleep(2);" -c "commit;" 2>&1 | grep -vE '^(BEGIN|COMMIT)?$'; }
now_s() { python3 -c 'import time;print(time.time())'; }
waited() { python3 -c "print(1 if $2 - $1 >= 1.0 else 0)"; }

echo "1) Agendar: A bloquea el crédito 2 s; B pide el MISMO crédito a otra hora"
hold "$(call $(S 1) $T $(W 1) 09:00)" > $TMP/a.out &
wait_holder; t0=$(now_s)
B=$(q "$(call $(S 1) $T $(W 1) 14:00)" 2>&1); t1=$(now_s)
wait; A=$(grep -E '^[a-z_]+:' $TMP/a.out)
check "A agenda" "${A%%:*}" "scheduled"
check "B ve el crédito ya usado" "${B%%:*}" "already_scheduled"
check "B esperó al bloqueo de A (FOR UPDATE)" "$(waited $t0 $t1)" "1"
check "reservas vivas de la sesión 1" "$(live_for_session $(S 1))" "1"
check "enlace = reserva de A" "$(link_of $(S 1))" "${A#*:}"

echo "2) Agendar: 12 peticiones en paralelo por crédito, horas distintas sin solape (sesiones 2..5)"
for n in 2 3 4 5; do
  for h in 08 09 10 11 12 13 14 15 16 17 18 19; do ( q "$(call $(S $n) $T $(W $n) $h:00)" > $TMP/burst_${n}_$h.out 2>&1 ) & done
  wait
  check "sesión $n: exactamente 1 scheduled" "$(cat $TMP/burst_${n}_*.out | grep -c '^scheduled:')" "1"
  check "sesión $n: 11 already_scheduled" "$(cat $TMP/burst_${n}_*.out | grep -c '^already_scheduled:')" "11"
  check "sesión $n: 1 reserva viva" "$(live_for_session $(S $n))" "1"
done
check "reservas vivas huérfanas" "$(orphans)" "0"

echo "3) Agendar: solape con otra reserva viva → 23P01, rollback completo"
ERR=$(q "$(call $(S 6) $T $(W 1) 09:30)" 2>&1)
contains "error de reservations_no_overlap" "$ERR" "reservations_no_overlap"
check "sesión 6 sigue not_scheduled" "$(state_of $(S 6))" "not_scheduled:-"
check "sin reserva nueva de la sesión 6" "$(q "select count(*) from reservations where notes like '%sesión 6/10%'")" "0"

echo "4) Agendar: crédito con reserva cancelada se reagenda una sola vez, también en paralelo"
q "update reservations set status='cancelled' where id = '$(link_of $(S 1))'" >/dev/null
for h in 16 17 18 19; do ( q "$(call $(S 1) $T $(W 1) $h:00)" > $TMP/re_$h.out 2>&1 ) & done; wait
check "reagendado exactamente 1 vez" "$(cat $TMP/re_*.out | grep -c '^scheduled:')" "1"
check "reservas vivas de la sesión 1" "$(live_for_session $(S 1))" "1"
q "update reservations set status='needs_reschedule' where id = '$(link_of $(S 1))'" >/dev/null
check "needs_reschedule libera el crédito" "$(q "$(call $(S 1) $T $(W 1) 12:00)" | cut -d: -f1)" "scheduled"
q "update reservations set status='confirmed' where id = '$(link_of $(S 1))'" >/dev/null
check "confirmed ocupa el crédito" "$(q "$(call $(S 1) $T $(W 1) 18:00)" | cut -d: -f1)" "already_scheduled"
check "reservas vivas huérfanas" "$(orphans)" "0"

echo "5) Agendar: reglas"
check "otro entrenador → forbidden" "$(q "$(call $(S 7) $T2 $(W 9) 10:00)" | cut -d: -f1)" "forbidden"
check "ventana de otro entrenador → forbidden" "$(q "$(call $(S 7) $T $(W 9) 10:00)" | cut -d: -f1)" "forbidden"
check "sesión inexistente → not_found" "$(q "$(call 99999999-9999-4999-8999-999999999999 $T $(W 1) 10:00)" | cut -d: -f1)" "not_found"
check "ventana inexistente → not_found" "$(q "$(call $(S 7) $T 99999999-9999-4999-8999-999999999999 10:00)" | cut -d: -f1)" "not_found"
check "estado no permitido → invalid" "$(q "select outcome from schedule_package_session('$(S 7)','$T','$(W 6)','10:00','completed')")" "invalid"
check "cruza medianoche → invalid" "$(q "$(call $(S 7) $T $(W 6) 23:30)" | cut -d: -f1)" "invalid"
q "update package_sessions set status='completed' where id='$(S 8)'" >/dev/null
check "sesión completed → already_scheduled" "$(q "$(call $(S 8) $T $(W 6) 10:00)" | cut -d: -f1)" "already_scheduled"
q "update client_packages set status='cancelled' where id='$PKG'" >/dev/null
check "paquete no activo → package_inactive" "$(q "$(call $(S 7) $T $(W 6) 10:00)" | cut -d: -f1)" "package_inactive"
q "update client_packages set status='active' where id='$PKG'" >/dev/null
check "fila creada con datos del paquete" \
  "$(q "select client_name||'|'||client_email||'|'||price||'|'||start_time||'|'||end_time||'|'||duration_minutes||'|'||player_count||'|'||whatsapp_opt_in||'|'||session_date||'|'||notes from reservations where id='$(link_of $(S 2))'")" \
  "Ana|ana@example.com|270|$(q "select start_time from reservations where id='$(link_of $(S 2))'")|$(q "select (start_time + interval '60 minutes')::time from reservations where id='$(link_of $(S 2))'")|60|1|false|$(D 2)|Paquete de 10 clases · sesión 2/10"

echo "6) Agendar: invariantes de la ventana dentro de la función (llamada directa, sin wrapper)"
check "ventana blocked → window_closed" "$(q "$(call $(S 7) $T $(W 10) 10:00)" | cut -d: -f1)" "window_closed"
check "ventana full → window_closed" "$(q "$(call $(S 7) $T $(W 11) 10:00)" | cut -d: -f1)" "window_closed"
check "empieza antes de la ventana → out_of_window" "$(q "$(call $(S 7) $T $(W 6) 07:30)" | cut -d: -f1)" "out_of_window"
check "acaba después de la ventana (60') → out_of_window" "$(q "$(call $(S 7) $T $(W 6) 19:30)" | cut -d: -f1)" "out_of_window"
check "acaba justo al cierre (60') → scheduled" "$(q "$(call $(S 7) $T $(W 6) 19:00)" | cut -d: -f1)" "scheduled"
check "90': 18:30 cabe → scheduled" "$(q "$(call $(S 91) $T $(W 7) 18:30)" | cut -d: -f1)" "scheduled"
check "90': 19:00 no cabe → out_of_window" "$(q "$(call $(S 92) $T $(W 7) 19:00)" | cut -d: -f1)" "out_of_window"
check "reserva de 90' con end_time correcto" "$(q "select end_time from reservations where id='$(link_of $(S 91))'")" "20:00:00"
check "ventana de ayer → past" "$(q "$(call $(S 9) $T $(W 12) 10:00)" | cut -d: -f1)" "past"
nowkl=$(q "select to_char(now() at time zone 'Asia/Kuala_Lumpur', 'HH24:MI')")
hh=${nowkl%%:*}
if [ "$hh" -ge 1 ] && [ "$hh" -le 21 ]; then
  prev=$(printf '%02d:00' $((10#$hh - 1))); next=$(printf '%02d:00' $((10#$hh + 1)))
  check "hoy, una hora antes ($prev KL) → past" "$(q "$(call $(S 9) $T $(W 13) $prev)" | cut -d: -f1)" "past"
  check "hoy, una hora después ($next KL) → scheduled" "$(q "$(call $(S 9) $T $(W 13) $next)" | cut -d: -f1)" "scheduled"
else
  echo "  SKIP hoy ±1 h: son las $nowkl en KL (fuera de 01–21 h)"
fi
check "duración del paquete fuera de 60/90 → invalid" "$(q "$(call $(S 45) $T $(W 8) 10:00)" | cut -d: -f1)" "invalid"
check "ninguno de los rechazos dejó reserva ni crédito" "$(q "select count(*) from package_sessions where id in ('$(S 92)','$(S 45)') and status <> 'not_scheduled'")" "0"
check "créditos incoherentes (scheduled ⇔ reservation_id)" "$(incoherent)" "0"

echo "7) Desagendar: fallo forzado → reserva y crédito como estaban"
# S(3) tiene una reserva viva (sección 2). El trigger de prueba falla en el
# UPDATE de package_sessions, que la función hace DESPUÉS de cancelar la
# reserva; el mensaje incluye el estado que la reserva tenía en ese momento
# dentro de la transacción, para demostrar que la cancelación sí llegó a escribirse.
R3=$(link_of $(S 3)); ST3=$(res_status $R3)
psqlc <<'SQL'
create table public.fault (step text primary key);
create function public.fault_ps() returns trigger language plpgsql as $f$
declare s text;
begin
  if exists (select 1 from public.fault where step = 'after_cancel') then
    select status into s from public.reservations where id = old.reservation_id;
    raise exception 'fallo forzado tras cancelar; reserva en la transacción = %', s;
  end if;
  return new;
end $f$;
create trigger fault_ps before update on public.package_sessions for each row execute function public.fault_ps();
create function public.fault_res() returns trigger language plpgsql as $f$
begin
  if exists (select 1 from public.fault where step = 'on_cancel') then
    raise exception 'fallo forzado al cancelar';
  end if;
  return new;
end $f$;
create trigger fault_res before update on public.reservations for each row execute function public.fault_res();
insert into public.fault values ('after_cancel');
SQL
ERR=$(q "$(uncall $(S 3) $T "'$R3'")" 2>&1)
contains "la función falla después de cancelar" "$ERR" "fallo forzado tras cancelar; reserva en la transacción = cancelled"
check "la reserva sigue en su estado anterior" "$(res_status $R3)" "$ST3"
check "el crédito sigue enlazado a ella" "$(state_of $(S 3))" "scheduled:$R3"
q "delete from public.fault; insert into public.fault values ('on_cancel')" >/dev/null
ERR=$(q "$(uncall $(S 3) $T "'$R3'")" 2>&1)
contains "la función falla al cancelar" "$ERR" "fallo forzado al cancelar"
check "la reserva sigue en su estado anterior" "$(res_status $R3)" "$ST3"
check "el crédito sigue enlazado a ella" "$(state_of $(S 3))" "scheduled:$R3"
q "delete from public.fault" >/dev/null
check "sin fallo: unscheduled y cancela la reserva vista" "$(q "$(uncall $(S 3) $T "'$R3'")")" "unscheduled:$R3"
check "reserva cancelada" "$(res_status $R3)" "cancelled"
check "crédito devuelto" "$(state_of $(S 3))" "not_scheduled:-"
q "drop trigger fault_ps on public.package_sessions; drop trigger fault_res on public.reservations; drop table public.fault" >/dev/null

echo "7b) Desagendar: reglas"
R4=$(link_of $(S 4))
check "otro entrenador → forbidden, nada cambia" "$(q "$(uncall $(S 4) $T2 "'$R4'")" | cut -d: -f1):$(state_of $(S 4))" "forbidden:scheduled:$R4"
check "reserva esperada distinta → changed, nada cambia" "$(q "$(uncall $(S 4) $T "'$(S 99)'")" | cut -d: -f1):$(res_status $R4)" "changed:pending_confirmation"
check "no agendada → not_scheduled" "$(q "$(uncall $(S 10) $T null)" | cut -d: -f1)" "not_scheduled"
q "update reservations set status='reschedule_proposed', proposal_token='tok-r4' where id='$R4'" >/dev/null
check "propuesta pendiente: se cancela y el token deja de valer" "$(q "$(uncall $(S 4) $T "'$R4'")" | cut -d: -f1):$(q "select status || ':' || coalesce(proposal_token,'-') from reservations where id='$R4'")" "unscheduled:cancelled:-"
R5=$(link_of $(S 5)); q "update reservations set status='cancelled' where id='$R5'" >/dev/null
check "reserva ya cancelada: suelta el crédito sin cancelar nada" "$(q "$(uncall $(S 5) $T "'$R5'")")" "unscheduled:-"

echo "8) Desagendar ↔ reagendar concurrentes"
# 8a. Reserva viva X. A desagenda (bloqueo 2 s); B agenda el mismo crédito → espera y agenda Y.
X=$(link_of $(S 2))
hold "$(uncall $(S 2) $T "'$X'")" > $TMP/a.out &
wait_holder; t0=$(now_s)
B=$(q "$(call $(S 2) $T $(W 2) 16:00)" 2>&1); t1=$(now_s); wait
check "8a: A desagenda X" "$(grep -E '^[a-z_]+:' $TMP/a.out)" "unscheduled:$X"
check "8a: B esperó a A" "$(waited $t0 $t1)" "1"
check "8a: B agenda después" "${B%%:*}" "scheduled"
check "8a: X cancelada, crédito en Y" "$(res_status $X):$(link_of $(S 2))" "cancelled:${B#*:}"
check "8a: 1 reserva viva" "$(live_for_session $(S 2))" "1"
# 8b. Reserva X cancelada. B reagenda primero (bloqueo 2 s) → Y; A desagenda esperando X → changed; Y intacta.
Y=${B#*:}; q "update reservations set status='cancelled' where id='$Y'" >/dev/null
hold "$(call $(S 2) $T $(W 2) 17:00)" > $TMP/b.out &
wait_holder; t0=$(now_s)
A=$(q "$(uncall $(S 2) $T "'$Y'")" 2>&1); t1=$(now_s); wait
Z=$(grep -E '^scheduled:' $TMP/b.out | cut -d: -f2)
check "8b: B reagenda" "$(grep -cE '^scheduled:' $TMP/b.out)" "1"
check "8b: A esperó a B" "$(waited $t0 $t1)" "1"
check "8b: A ve que el crédito cambió" "${A%%:*}" "changed"
check "8b: la reserva nueva sigue viva y enlazada" "$(res_status $Z):$(link_of $(S 2))" "pending_confirmation:$Z"
# 8c. Dos desagendados a la vez → uno lo hace, el otro ve not_scheduled.
for i in 1 2; do ( q "$(uncall $(S 2) $T "'$Z'")" > $TMP/un_$i.out 2>&1 ) & done; wait
check "8c: exactamente un unscheduled" "$(cat $TMP/un_*.out | grep -c '^unscheduled:')" "1"
check "8c: el otro not_scheduled" "$(cat $TMP/un_*.out | grep -c '^not_scheduled:')" "1"
# 8d. Ráfaga mezclada: por crédito, 6 agendados + 6 desagendados (con la reserva vista al
#     empezar la ronda), 6 rondas. Invariantes comprobadas después de CADA ronda.
#     Errores en una línea (VERBOSITY=terse) para poder contarlos.
qt() { psqlc -At -v VERBOSITY=terse -c "$1"; }
bad_multi=0; bad_orph=0; bad_incoh=0; bad_dead=0
for round in 1 2 3 4 5 6; do
  for n in 91 93 94 95; do
    seen=$(link_of $(S $n)); exp=$([ -n "$seen" ] && echo "'$seen'" || echo null)
    w=$(( (n % 4) + round % 2 + 1 ))
    for h in 08:00 09:30 11:00 12:30 14:00 15:30; do ( qt "$(call $(S $n) $T $(W $w) $h)" > $TMP/mix_${round}_${n}_s_$h.out 2>&1 ) & done
    for i in 1 2 3 4 5 6; do ( qt "$(uncall $(S $n) $T "$exp")" > $TMP/mix_${round}_${n}_u_$i.out 2>&1 ) & done
  done
  wait
  for n in 91 93 94 95; do [ "$(live_for_session $(S $n))" -le 1 ] || bad_multi=$((bad_multi + 1)); done
  bad_orph=$((bad_orph + $(orphans)))
  bad_incoh=$((bad_incoh + $(incoherent)))
  bad_dead=$((bad_dead + $(q "select count(*) from package_sessions ps join reservations r on r.id = ps.reservation_id where ps.status='scheduled' and coalesce(r.status,'') in ('cancelled','canceled','needs_reschedule') and ps.client_package_id='$PKG90'")))
done
cat $TMP/mix_* > $TMP/mix_all.txt
echo "  8d: resultados $(sed 's/.*reservations_no_overlap.*/23P01/; s/:.*//' $TMP/mix_all.txt | sort | uniq -c | awk '{printf "%s=%s ", $2, $1}')"
check "8d: ningún crédito con más de una reserva viva (6 rondas)" "$bad_multi" "0"
check "8d: reservas vivas huérfanas (6 rondas)" "$bad_orph" "0"
check "8d: créditos incoherentes (6 rondas)" "$bad_incoh" "0"
check "8d: ningún crédito scheduled con su reserva cancelada (6 rondas)" "$bad_dead" "0"
check "8d: hubo agendados Y desagendados con éxito" "$([ $(grep -c '^scheduled:' $TMP/mix_all.txt) -ge 6 ] && [ $(grep -c '^unscheduled:' $TMP/mix_all.txt) -ge 6 ] && echo si)" "si"
check "8d: sin errores inesperados" "$(grep -vcE '^(scheduled|already_scheduled|unscheduled|not_scheduled|changed):|reservations_no_overlap' $TMP/mix_all.txt)" "0"
grep -vE '^(scheduled|already_scheduled|unscheduled|not_scheduled|changed):|reservations_no_overlap' $TMP/mix_all.txt | sort | uniq -c | head -5

echo "9) Permisos"
for fn in "$(call $(S 10) $T $(W 8) 10:00)" "$(uncall $(S 10) $T null)"; do
  check "anon no puede ejecutar" "$(q "set role anon; $fn" 2>&1 | grep -c 'permission denied')" "1"
  check "authenticated no puede ejecutar" "$(q "set role authenticated; $fn" 2>&1 | grep -c 'permission denied')" "1"
done
check "service_role puede ejecutar las dos" "$(q "select has_function_privilege('service_role','public.schedule_package_session(uuid,uuid,uuid,time,text)','execute') and has_function_privilege('service_role','public.unschedule_package_session(uuid,uuid,uuid)','execute')")" "t"
check "SECURITY INVOKER las dos" "$(q "select bool_or(prosecdef) from pg_proc where proname in ('schedule_package_session','unschedule_package_session')")" "f"

echo "10) CONTROL: el flujo ANTIGUO (leer, insertar, enlazar; sin bloqueo) con dos peticiones a la vez"
old() {
  [ "$(q "select status from package_sessions where id='$(S 10)'")" = not_scheduled ] || { echo busy; return; }
  sleep 0.5
  id=$(q "insert into reservations (trainer_id, availability_slot_id, client_name, client_email, notes, start_time, end_time) values ('$T','$(W 8)','Ana','ana@example.com','Paquete de 10 clases · sesión 10/10','$1','$1'::time + interval '1 hour') returning id")
  q "update package_sessions set reservation_id='$id', status='scheduled' where id='$(S 10)'" >/dev/null; echo "scheduled:$id"
}
before=$(orphans)
old 10:00 > $TMP/old_a.out & old 15:00 > $TMP/old_b.out & wait
check "flujo antiguo: las DOS peticiones 'agendan' (la carrera existe)" "$(cat $TMP/old_*.out | grep -c '^scheduled:')" "2"
check "flujo antiguo: 2 reservas vivas para un crédito" "$(live_for_session $(S 10))" "2"
check "flujo antiguo: 1 huérfana nueva" "$(( $(orphans) - before ))" "1"

echo; [ $FAIL = 0 ] && echo "TODO OK" || echo "HAY FALLOS"
exit $FAIL
