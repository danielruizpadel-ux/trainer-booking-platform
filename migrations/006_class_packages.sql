-- 006 — Paquetes de clases (5 y 10 sesiones)
--
-- Dos tablas nuevas. `reservations` no cambia: una sesión de paquete se
-- convierte en una fila real de `reservations` solo al agendarla (mismo
-- camino que la reserva manual, lib/reservations/manual.ts), enlazada desde
-- package_sessions.reservation_id. El resto del flujo de reservas
-- (confirmación, calendario, cancelación, propuestas) no sabe que existen
-- los paquetes.
--
-- Precio: foto fija en el momento de la venta, con la MISMA regla que ya
-- usa el widget público (lib/reservations/pricing.ts, calculateBookingPrice).
--
-- Aplicar en Supabase → SQL Editor → Run. Idempotente.

create table if not exists public.client_packages (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  client_name text not null,
  client_email text not null,
  client_phone text,
  sessions_total smallint not null check (sessions_total in (5, 10)),
  price_per_session_normal numeric not null,
  discount_percent numeric not null default 0,
  price_per_session_discounted numeric not null,
  price_total numeric not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_packages_trainer_idx
  on public.client_packages (trainer_id, status);

alter table public.client_packages enable row level security;

create table if not exists public.package_sessions (
  id uuid primary key default gen_random_uuid(),
  client_package_id uuid not null references public.client_packages (id) on delete cascade,
  session_number smallint not null,
  reservation_id uuid references public.reservations (id) on delete set null,
  status text not null default 'not_scheduled' check (status in ('not_scheduled', 'scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_package_id, session_number)
);

create index if not exists package_sessions_package_idx
  on public.package_sessions (client_package_id);
create index if not exists package_sessions_reservation_idx
  on public.package_sessions (reservation_id);

alter table public.package_sessions enable row level security;

comment on table public.client_packages is
  'Paquete de 5 o 10 clases vendido a un cliente, con precio y % de descuento fijados en el momento de la venta. Un entrenador fijo por paquete (trainer_id).';
comment on table public.package_sessions is
  'Una fila por cada sesión del paquete. not_scheduled hasta que se agenda contra un hueco real (entonces reservation_id apunta a la fila de reservations creada, igual que una reserva manual).';
