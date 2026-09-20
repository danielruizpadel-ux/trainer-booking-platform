-- 005 — Horario semanal recurrente + excepciones por fecha (Fase D, rediseño)
--
-- Sustituye "crear un hueco cada vez" por un patrón semanal (estilo Cal.com):
-- por día de la semana, uno o varios rangos horarios que se repiten cada
-- semana, más una lista de fechas concretas que se salen del patrón (cerradas
-- del todo, u horario distinto ese día).
--
-- Estas tablas son solo la PLANTILLA. Los huecos reales que ve el cliente
-- siguen siendo filas de `availability_slots`, exactamente igual que hasta
-- ahora — el widget público, `isSlotOpen` y `POST /api/reservations` no
-- cambian. Un generador (`lib/availability/generate.ts`) lee la plantilla y
-- crea/borra las filas de `availability_slots` de las próximas semanas.
--
-- `day_of_week`: 0 = lunes … 6 = domingo (mismo criterio que ya usa el
-- calendario del dashboard: `(date.getDay() + 6) % 7`).
--
-- `generated_by_pattern` en `availability_slots` distingue un hueco creado
-- por el generador de uno añadido a mano (botón "Añadir hueco" de la Fase D):
-- el generador solo borra huecos suyos, `available` y sin ninguna reserva
-- viva encima. Nunca toca un hueco con una reserva encima, sea de quien sea.
--
-- Aplicar en Supabase → SQL Editor → Run. Idempotente.

create table if not exists public.trainer_weekly_hours (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  class_type text not null default 'private',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_weekly_hours_range check (end_time > start_time)
);

create index if not exists trainer_weekly_hours_trainer_idx
  on public.trainer_weekly_hours (trainer_id, day_of_week);

alter table public.trainer_weekly_hours enable row level security;

create table if not exists public.trainer_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  override_date date not null,
  is_blocked boolean not null default false,
  start_time time,
  end_time time,
  class_type text default 'private',
  created_at timestamptz not null default now(),
  constraint trainer_availability_overrides_shape check (
    (is_blocked and start_time is null and end_time is null)
    or (not is_blocked and start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index if not exists trainer_availability_overrides_trainer_date_idx
  on public.trainer_availability_overrides (trainer_id, override_date);

alter table public.trainer_availability_overrides enable row level security;

alter table public.availability_slots
  add column if not exists generated_by_pattern boolean not null default false;

comment on table public.trainer_weekly_hours is
  'Plantilla de horario semanal recurrente del entrenador (Fase D). Un día puede tener varios rangos; enabled se cambia junto para todos los rangos de ese día.';
comment on table public.trainer_availability_overrides is
  'Excepciones puntuales por fecha sobre el horario semanal: is_blocked=true cierra el día entero; si no, start_time/end_time sustituyen el patrón ese día (puede haber varias filas = varios rangos).';
comment on column public.availability_slots.generated_by_pattern is
  'true si esta fila la creó el generador a partir de la plantilla semanal; false si se añadió a mano (o es anterior a la Fase D). Solo se borran automáticamente las generadas, available y sin reserva viva.';
