-- 007 — Clases de 1 h y 1 h 30 min: ventanas + reservas con rango
--
-- Requiere la 006 aplicada antes.
--
-- Cambio de modelo (aprobado el 20/09/2026):
--
--   * Una fila de `availability_slots` es una VENTANA abierta (lo que el
--     generador de la plantilla semanal ya creaba: una fila por rango y
--     fecha, p. ej. miércoles 09:00–17:00). Ya no es "una clase". No cambia
--     de esquema; el unique constraint (trainer_id, session_date, start_time,
--     end_time) se queda: las ventanas no se solapan entre sí y NO se generan
--     filas por duración.
--   * Una reserva ocupa un RANGO dentro de su ventana: `start_time`,
--     `end_time`, `duration_minutes`. Dos reservas de la misma ventana no
--     pueden solaparse (lo comprueba el servidor contra las reservas vivas:
--     pending_confirmation, reschedule_proposed y confirmed).
--   * La disponibilidad se calcula al vuelo: inicios en la rejilla (30 min si
--     el entrenador ofrece 1 h 30, 60 min si solo 1 h) que caben en la ventana
--     sin solapar reservas vivas.
--   * `availability_slots.status` deja de usar `pending`. `full` solo cuando
--     no queda ningún inicio libre para la duración mínima que ofrece el
--     entrenador; lo recalcula la app (refreshWindowStatus) en cada cambio.
--
-- Precio: 1 h 30 = precio de 1 h × 1,5, y sobre eso los descuentos por
-- volumen de siempre (lib/reservations/pricing.ts). Sin precio aparte.
--
-- Aplicar en Supabase → SQL Editor → Run. Idempotente.

-- 1. Qué duraciones ofrece cada entrenador (a nivel de entrenador).
alter table public.trainers
  add column if not exists class_durations smallint[] not null default '{60}';

alter table public.trainers
  drop constraint if exists trainers_class_durations_check;
alter table public.trainers
  add constraint trainers_class_durations_check
  check (cardinality(class_durations) > 0 and class_durations <@ array[60, 90]::smallint[]);

comment on column public.trainers.class_durations is
  'Duraciones de clase que ofrece, en minutos: {60}, {90} o {60,90}. Configuración global del entrenador.';

-- 2. La reserva lleva su propio rango dentro de la ventana.
alter table public.reservations
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists duration_minutes smallint not null default 60;

-- Backfill de lo que ya existe: cada reserva antigua era "la clase de 1 h que
-- empieza donde empieza su hueco".
update public.reservations r
   set start_time = s.start_time,
       end_time = s.start_time + interval '60 minutes',
       duration_minutes = 60
  from public.availability_slots s
 where r.availability_slot_id = s.id
   and r.start_time is null;

alter table public.reservations
  drop constraint if exists reservations_time_range_check;
alter table public.reservations
  add constraint reservations_time_range_check
  check (start_time is null or end_time > start_time);

alter table public.reservations
  drop constraint if exists reservations_duration_check;
alter table public.reservations
  add constraint reservations_duration_check
  check (duration_minutes in (60, 90));

create index if not exists reservations_slot_idx
  on public.reservations (availability_slot_id);

comment on column public.reservations.start_time is
  'Inicio de la clase dentro de su ventana (availability_slot_id). Rango [start_time, end_time).';
comment on column public.reservations.duration_minutes is
  '60 o 90. El precio se deriva de la duración (×1,5 para 90), no se guarda aparte.';

-- 3. Paquetes: duración fija por paquete, elegida al venderlo.
alter table public.client_packages
  add column if not exists duration_minutes smallint not null default 60;

alter table public.client_packages
  drop constraint if exists client_packages_duration_check;
alter table public.client_packages
  add constraint client_packages_duration_check
  check (duration_minutes in (60, 90));

comment on column public.client_packages.duration_minutes is
  'Duración de TODAS las sesiones del paquete (60 o 90). No se mezclan dentro de un paquete.';

-- 4. Recalcular el estado de TODAS las ventanas existentes.
--    Con el modelo antiguo, una ventana con una sola reserva quedaba `pending`
--    o `full` aunque le sobre tiempo libre real. Aquí se deja en `available`
--    con el contador de reservas vivas; la app marca `full` solo cuando de
--    verdad no cabe ninguna clase más (refreshWindowStatus), la próxima vez
--    que toque esa ventana o al pulsar "Regenerar huecos" en Disponibilidad.
update public.availability_slots s
   set status = 'available',
       current_bookings = (
         select count(*) from public.reservations r
          where r.availability_slot_id = s.id
            and r.status in ('pending_confirmation', 'pending', 'reschedule_proposed', 'confirmed', 'completed')
       ),
       updated_at = now()
 where s.status in ('pending', 'full');

comment on table public.availability_slots is
  'VENTANAS abiertas del entrenador (una por rango y fecha). Las clases son reservas con rango dentro de la ventana; la disponibilidad se calcula por solapamiento (migración 007).';
