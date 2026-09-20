-- 003 — Confirmación manual de reservas
--
-- Negocio: el entrenador no puede confirmar una clase automáticamente; antes
-- tiene que reservar la pista física. Si no la consigue, el cliente reprograma.
--
-- Estado real antes de esta migración (verificado el 19/09/2026 con la service
-- role key, ver docs/DATABASE.md):
--   * reservations.status: valores en uso `pending` y `confirmed`; default de
--     columna `confirmed`; SIN check constraint.
--   * availability_slots.status: valores en uso `available` y `full`; default
--     `available`; SIN check constraint.
--
-- Modelo de estados a partir de ahora:
--
--   reservations.status
--     pending_confirmation  la crea el booking público; el entrenador aún no ha
--                           conseguido pista            (default nuevo)
--     confirmed             el entrenador confirmó la clase
--     needs_reschedule      no consiguió pista; el cliente tiene que reprogramar
--     cancelled, completed  reservados para más adelante (no los crea nadie hoy)
--
--   availability_slots.status
--     available   reservable
--     pending     hay una reserva pending_confirmation encima: NO reservable
--     full        ocupado (reserva confirmada o capacidad llena)
--     cancelled, blocked  reservados (isSlotOpen ya los trata como cerrados)
--
-- El código no depende de esta migración para funcionar (no había checks), pero
-- sin ella el modelo no está garantizado por la base. Aplicar en Supabase →
-- SQL Editor → Run. Es idempotente.

-- 1. Nuevo default: toda reserva nueva nace pendiente de confirmación.
alter table public.reservations
  alter column status set default 'pending_confirmation';

-- 2. Datos existentes: el `pending` antiguo significaba lo mismo.
update public.reservations
   set status = 'pending_confirmation'
 where status = 'pending';

-- 3. El hueco de una reserva pendiente queda en `pending`, no en `full`.
update public.availability_slots s
   set status = 'pending'
  from public.reservations r
 where r.availability_slot_id = s.id
   and r.status = 'pending_confirmation'
   and s.status <> 'pending';

-- 4. Checks: a partir de aquí un estado fuera de la lista es un error de BD,
--    no un valor que se cuela en silencio.
alter table public.reservations
  drop constraint if exists reservations_status_check;
alter table public.reservations
  add constraint reservations_status_check
  check (status in ('pending_confirmation', 'confirmed', 'needs_reschedule', 'cancelled', 'completed'));

alter table public.availability_slots
  drop constraint if exists availability_slots_status_check;
alter table public.availability_slots
  add constraint availability_slots_status_check
  check (status in ('available', 'pending', 'full', 'cancelled', 'blocked'));

comment on column public.reservations.status is
  'pending_confirmation (nueva, sin pista) | confirmed | needs_reschedule (sin pista, el cliente reprograma) | cancelled | completed';
comment on column public.availability_slots.status is
  'available | pending (reserva sin confirmar encima) | full (ocupado) | cancelled | blocked';
