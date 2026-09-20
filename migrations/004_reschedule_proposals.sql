-- 004 — Reprogramación con propuesta concreta
--
-- Requiere 003 aplicada antes (modelo de estados y CHECK de `status`).
--
-- Cuando el entrenador no consigue pista puede, en vez de solo avisar,
-- proponer otro hueco de su disponibilidad. Eso crea una reserva NUEVA sobre
-- el hueco propuesto:
--
--   status = 'reschedule_proposed'   esperando respuesta del cliente
--   rescheduled_from_id              la reserva original (que pasa a needs_reschedule
--                                    y libera su hueco)
--   proposal_token                   token de un solo uso del enlace público
--                                    /propuesta/[token]; se pone a NULL al responder
--
-- El cliente, desde el enlace y sin login:
--   Acepta      → pending_confirmation (el entrenador la confirma cuando tenga pista)
--   Elige otra  → needs_reschedule y el hueco propuesto vuelve a available
--
-- Un hueco con una reserva reschedule_proposed encima está `pending` y no se
-- ofrece (reservationHoldsSlot la cuenta como ocupante).
--
-- `cancelled` (ya en el CHECK de la 003) es la cancelación directa desde el
-- panel, SIN intención de reprogramar; `needs_reschedule` es "sin pista, el
-- cliente elige otra hora". La pestaña Canceladas agrupa los dos con etiqueta
-- distinta. Ninguno de los dos ocupa el hueco.
--
-- Aplicar en Supabase → SQL Editor → Run. Idempotente.

alter table public.reservations
  add column if not exists rescheduled_from_id uuid
    references public.reservations (id) on delete set null;

alter table public.reservations
  add column if not exists proposal_token text;

create unique index if not exists reservations_proposal_token_key
  on public.reservations (proposal_token)
  where proposal_token is not null;

alter table public.reservations
  drop constraint if exists reservations_status_check;
alter table public.reservations
  add constraint reservations_status_check
  check (status in (
    'pending_confirmation', 'reschedule_proposed', 'confirmed',
    'needs_reschedule', 'cancelled', 'completed'
  ));

comment on column public.reservations.rescheduled_from_id is
  'Reserva original de la que esta es una propuesta de nueva fecha.';
comment on column public.reservations.proposal_token is
  'Token del enlace público /propuesta/[token]. NULL cuando el cliente ya respondió.';
comment on column public.reservations.status is
  'pending_confirmation (nueva, sin pista) | reschedule_proposed (propuesta enviada al cliente) | confirmed | needs_reschedule (sin pista, el cliente reprograma) | cancelled | completed';
