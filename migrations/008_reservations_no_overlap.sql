-- 008 — La base de datos impide dos reservas vivas solapadas del mismo entrenador
--
-- Requiere la 007 aplicada antes (rango start_time/end_time en reservations).
--
-- Hasta ahora el solapamiento solo lo comprobaba la app: leía las reservas
-- vivas del día, decidía en memoria e insertaba después. Dos peticiones casi
-- simultáneas (dos clientes, o un cliente y el entrenador desde el dashboard)
-- pasaban las dos la comprobación y se quedaban la misma hora. Aquí lo
-- garantiza Postgres con una restricción EXCLUDE: el segundo insert/update
-- falla con el código 23P01 y la app lo traduce a un 409.
--
--   * reservations.session_date: la fecha de su ventana. `reservations` no
--     tenía fecha propia (vivía en availability_slots) y sin ella no se puede
--     escribir la restricción. La rellena SIEMPRE un trigger desde la ventana,
--     también cuando una reprogramación cambia availability_slot_id; la app no
--     la escribe.
--   * "Reserva viva" es exactamente la regla de la app, reservationHoldsSlot
--     (lib/availability/slot-status.ts): todo estado que NO sea cancelled,
--     canceled o needs_reschedule, y también un status NULL. Si esa regla
--     cambia, hay que cambiar el WHERE de abajo.
--   * El rango es '[)': 09:00–10:00 y 10:00–11:00 no chocan.
--   * Solo entran filas con session_date, start_time y end_time: un rango con
--     un extremo NULL sería infinito y bloquearía el calendario entero.
--
-- ANTES DE APLICAR: ejecuta la consulta del PASO 0 (abajo, comentada). Si
-- devuelve filas, hay solapes que ya existen y la restricción no se podrá
-- crear: resuélvelos a mano (cancelar / mover) y vuelve a ejecutarla.
--
-- Aplicar en Supabase → SQL Editor → Run. Idempotente. Va en una transacción:
-- si la restricción no se puede crear, no se queda nada a medias.

-- ─── PASO 0 (solo lectura, ejecutar ANTES por separado) ─────────────────────
--
-- with live as (
--   select r.id, r.trainer_id, r.status, s.session_date,
--          coalesce(r.start_time, s.start_time) as start_time,
--          coalesce(r.end_time, s.start_time + least(interval '60 minutes', s.end_time - s.start_time)) as end_time
--     from public.reservations r
--     join public.availability_slots s on s.id = r.availability_slot_id
--    where coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
-- )
-- select a.trainer_id, a.session_date,
--        a.id as reserva_a, a.status as estado_a, a.start_time as inicio_a, a.end_time as fin_a,
--        b.id as reserva_b, b.status as estado_b, b.start_time as inicio_b, b.end_time as fin_b
--   from live a
--   join live b
--     on a.trainer_id = b.trainer_id
--    and a.session_date = b.session_date
--    and a.id < b.id
--    and a.start_time < b.end_time
--    and b.start_time < a.end_time
--  order by a.trainer_id, a.session_date, a.start_time;
--
-- ────────────────────────────────────────────────────────────────────────────

begin;

-- tsrange + igualdad de uuid en el mismo índice GiST.
create extension if not exists btree_gist with schema extensions;

-- 1. Fecha propia de la reserva.
alter table public.reservations
  add column if not exists session_date date;

comment on column public.reservations.session_date is
  'Fecha de su ventana (availability_slots.session_date). La mantiene el trigger reservations_set_session_date; la app no la escribe. Migración 008.';

-- 2. Trigger: session_date siempre sale de la ventana, al crear y al mover.
create or replace function public.reservations_set_session_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  window_date date;
begin
  select s.session_date into window_date
    from public.availability_slots s
   where s.id = new.availability_slot_id;
  new.session_date := window_date;
  return new;
end;
$$;

drop trigger if exists reservations_set_session_date on public.reservations;
create trigger reservations_set_session_date
  before insert or update of availability_slot_id, session_date
  on public.reservations
  for each row
  execute function public.reservations_set_session_date();

-- Si alguna vez cambia la fecha de una ventana, sus reservas la siguen.
create or replace function public.availability_slots_propagate_session_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.reservations
     set session_date = new.session_date
   where availability_slot_id = new.id;
  return null;
end;
$$;

drop trigger if exists availability_slots_propagate_session_date on public.availability_slots;
create trigger availability_slots_propagate_session_date
  after update of session_date
  on public.availability_slots
  for each row
  when (old.session_date is distinct from new.session_date)
  execute function public.availability_slots_propagate_session_date();

-- 3. Backfill.
--    Reservas anteriores a la 007 que sigan sin rango: el mismo rango que les
--    da la app (reservationRange en lib/reservations/slots.ts), para que
--    también queden protegidas.
update public.reservations r
   set start_time = s.start_time,
       end_time = s.start_time + least(interval '60 minutes', s.end_time - s.start_time)
  from public.availability_slots s
 where r.availability_slot_id = s.id
   and r.start_time is null;

--    Fecha de todas las reservas existentes (el trigger la saca de la ventana).
update public.reservations r
   set session_date = s.session_date
  from public.availability_slots s
 where r.availability_slot_id = s.id
   and r.session_date is distinct from s.session_date;

create index if not exists reservations_trainer_date_idx
  on public.reservations (trainer_id, session_date);

-- 4. La restricción.
alter table public.reservations
  drop constraint if exists reservations_no_overlap;
alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (
    trainer_id with =,
    tsrange(session_date + start_time, session_date + end_time, '[)') with &&
  )
  where (
    session_date is not null
    and start_time is not null
    and end_time is not null
    and coalesce(status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
  );

comment on constraint reservations_no_overlap on public.reservations is
  'Dos reservas vivas (reservationHoldsSlot) del mismo entrenador no pueden solaparse. Rango [inicio, fin). Error 23P01 → la app responde 409. Migración 008.';

commit;
