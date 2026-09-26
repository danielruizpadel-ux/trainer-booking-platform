-- Esquema de REFERENCIA de lo desplegado (solo las tablas que tocan la 008 y
-- la 011), para probar en un Postgres aislado. NO es una migración y no se
-- aplica en Supabase.
--
-- migrations/001 no es lo que hay desplegado (ver CLAUDE.md): allí
-- class_type tiene un CHECK ('individual','group','semi-private'), el unique
-- incluye class_type y status no admite 'blocked'. Lo desplegado, según
-- scripts/inspect-schema.mjs (26/09/2026) y docs/DATABASE.md:
--   * availability_slots.class_type text NOT NULL default 'private', FK a
--     class_types(name) (filas: private, group, academy); sin CHECK.
--   * availability_slots.status text default 'available', sin CHECK
--     (generate.ts ya escribe 'blocked').
--   * unique (trainer_id, session_date, start_time, end_time) — el que nombra
--     el error "..._start_time_end_t_key" de generate.ts.
--   * reservations: availability_slot_id NOT NULL (FK ON DELETE CASCADE,
--     confirmado el 26/09), columnas de la 007,
--     la 010 (player_count 1..4 NOT NULL default 1, whatsapp_opt_in, player_id,
--     client_message). session_date y la restricción llegan con la 008.
-- Las variantes incompatibles (forma de la 001) las monta
-- scripts/verify-one-off-db.sh encima de este archivo.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists extensions;

create table public.trainers (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  class_durations smallint[] default '{60}'
);

create table public.class_types (
  name text primary key
);
insert into public.class_types (name) values ('private'), ('group'), ('academy');

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers (id),
  session_date date not null,
  start_time time not null,
  end_time time not null,
  class_type text not null default 'private' references public.class_types (name),
  max_capacity integer default 1,
  current_bookings integer default 0,
  status text default 'available',
  created_at timestamp without time zone default now(),
  updated_at timestamp without time zone default now(),
  generated_by_pattern boolean not null default false,
  unique (trainer_id, session_date, start_time, end_time)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  -- ON DELETE CASCADE: confirmado en la base real el 26/09/2026 (consulta de
  -- solo lectura). La 013 lo cambia a RESTRICT.
  availability_slot_id uuid not null references public.availability_slots (id) on delete cascade,
  trainer_id uuid not null references public.trainers (id),
  client_name text not null,
  client_email text not null,
  client_phone text,
  notes text,
  price numeric,
  status text default 'pending_confirmation',
  created_at timestamp without time zone default now(),
  updated_at timestamp without time zone default now(),
  rescheduled_from_id uuid references public.reservations (id),
  proposal_token text,
  start_time time without time zone,
  end_time time without time zone,
  duration_minutes smallint not null default 60,
  player_id uuid,
  client_message text,
  player_count smallint not null default 1 constraint reservations_player_count_range check (player_count between 1 and 4),
  whatsapp_opt_in boolean
);

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant select on all tables in schema public to anon, authenticated;
