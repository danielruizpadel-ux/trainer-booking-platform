-- 015 — Una reserva viva no puede quedar fuera del horario de su ventana
--
-- Requiere 007 (rango en reservations) y 008 (fecha + reservations_no_overlap).
-- Numeración: ver docs/estado-integracion.md (choque con pagos-paquetes).
--
-- Hasta ahora solo la app comprobaba que [start_time, end_time) de una
-- reserva cabe en su ventana (fitsInWindow / bookableStarts), con lo que
-- LEYÓ. Si mientras tanto la ventana se acortaba (sincronización del horario,
-- 014), la reserva entraba igual: la FK solo mira que la ventana exista
-- (probado en scripts/verify-window-plan-db.sh, C4). Aquí lo garantiza la
-- base, en los dos sentidos:
--
--   reservations_within_window (BEFORE INSERT / UPDATE OF availability_slot_id,
--   start_time, end_time, status ON reservations)
--     Para una reserva VIVA (misma regla que la 008: todo estado salvo
--     cancelled, canceled y needs_reschedule) con rango: bloquea su ventana
--     con FOR SHARE y comprueba que el rango cabe en el de la ventana.
--     Cubre todos los caminos: web pública, reserva manual, clase puntual
--     (012), mover / proponer otra hora y paquetes.
--
--   availability_slots_keep_reservations_inside (BEFORE UPDATE OF
--   start_time, end_time ON availability_slots)
--     Rechaza cambiar el rango de una ventana si alguna reserva viva suya
--     quedaría fuera. (apply_window_plan ya cierra la ventana en ese caso en
--     vez de acortarla; esto cubre cualquier otro UPDATE.)
--
-- Concurrencia: FOR SHARE es incompatible con el FOR UPDATE de
-- apply_window_plan y con el bloqueo de cualquier UPDATE de la ventana. Si la
-- reserva va primero, el acortamiento espera y ve la reserva; si el
-- acortamiento va primero, la reserva espera y ve el rango nuevo.
--
-- Error: SQLSTATE 23514 con 'reservations_within_window' en el mensaje; la
-- app lo trata como "franja ya no disponible" (409), igual que el 23P01.
--
-- ANTES DE APLICAR (solo lectura): reservas vivas que ya están fuera de su
-- ventana. Si las hay, la migración se para (no las toca): resuélvelas a mano.
--
--   select r.id, r.status, s.session_date, r.start_time, r.end_time, s.start_time as ventana_inicio, s.end_time as ventana_fin
--     from public.reservations r join public.availability_slots s on s.id = r.availability_slot_id
--    where r.start_time is not null and r.end_time is not null
--      and coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
--      and (r.start_time < s.start_time or r.end_time > s.end_time);
--
-- Aplicar en Supabase → SQL Editor → Run (como postgres). Idempotente. En una
-- transacción; no cambia ningún dato.

begin;

do $$
declare
  n integer;
  sample text;
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'reservations_no_overlap' and conrelid = 'public.reservations'::regclass
  ) then
    raise exception '015 requiere la 008: no existe la restricción reservations_no_overlap';
  end if;

  select count(*), string_agg(x.id::text, ', ')
    into n, sample
    from (
      select r.id
        from public.reservations r
        join public.availability_slots s on s.id = r.availability_slot_id
       where r.start_time is not null and r.end_time is not null
         and coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
         and (r.start_time < s.start_time or r.end_time > s.end_time)
       order by r.id
       limit 5
    ) x;
  if n > 0 then
    raise exception '015: hay reservas vivas fuera del horario de su ventana (p. ej. %); resuélvelas antes (consulta en la cabecera)', sample;
  end if;
end $$;

create or replace function public.reservations_within_window()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  w record;
begin
  if new.start_time is null or new.end_time is null
     or coalesce(new.status, '') in ('cancelled', 'canceled', 'needs_reschedule') then
    return new;
  end if;
  -- FOR SHARE: espera a quien esté cambiando la ventana y ve su rango final;
  -- y mientras esta reserva no termine, nadie puede acortarla.
  select s.start_time, s.end_time into w
    from availability_slots s
   where s.id = new.availability_slot_id
     for share;
  if not found then
    return new; -- la FK lo rechaza
  end if;
  if new.start_time < w.start_time or new.end_time > w.end_time then
    raise exception using
      errcode = '23514',
      message = 'reservations_within_window: la reserva queda fuera del horario de su ventana',
      detail = format('reserva %s–%s, ventana %s–%s', new.start_time, new.end_time, w.start_time, w.end_time);
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_within_window on public.reservations;
create trigger reservations_within_window
  before insert or update of availability_slot_id, start_time, end_time, status
  on public.reservations
  for each row
  execute function public.reservations_within_window();

create or replace function public.availability_slots_keep_reservations_inside()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_time is not distinct from old.start_time and new.end_time is not distinct from old.end_time then
    return new;
  end if;
  if exists (
    select 1 from reservations r
     where r.availability_slot_id = new.id
       and r.start_time is not null and r.end_time is not null
       and coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
       and (r.start_time < new.start_time or r.end_time > new.end_time)
  ) then
    raise exception using
      errcode = '23514',
      message = 'reservations_within_window: el nuevo horario de la ventana dejaría fuera una reserva viva',
      detail = format('ventana %s: %s–%s', new.id, new.start_time, new.end_time);
  end if;
  return new;
end;
$$;

drop trigger if exists availability_slots_keep_reservations_inside on public.availability_slots;
create trigger availability_slots_keep_reservations_inside
  before update of start_time, end_time
  on public.availability_slots
  for each row
  execute function public.availability_slots_keep_reservations_inside();

commit;
