-- 009 — Cuenta global de jugador (Fase A1 del login de jugadores)
--
-- Independiente de la 008 (reservas no solapadas): no toca `reservations`
-- ni `availability_slots`. Se numera 009 porque la 008 ya existe en `main`.
--
-- Modelo:
--
--   * Un jugador es UNA cuenta global (una fila en auth.users → una fila en
--     `players`), no una por entrenador. La misma persona podrá reservar
--     con varios entrenadores sin repetir sus datos.
--   * `player_trainers` es la relación N:M jugador ↔ entrenador: con quién
--     entrena, desde cuándo y cómo empezó (`source`). En esta fase solo se
--     crea al entrar desde la página de un entrenador (`self_signup`); la
--     reserva con sesión (`booking`) llega en una fase posterior.
--   * Una misma persona puede ser entrenador (trainers.auth_user_id) y
--     jugador a la vez: son dos vínculos independientes sobre el mismo
--     auth.users.id.
--   * `reservations` NO cambia todavía (no hay player_id). La reserva sigue
--     llevando nombre/email/teléfono en la propia fila.
--
-- Seguridad: RLS activo en las dos tablas y SOLO políticas de lectura. Todas
-- las escrituras pasan por el servidor con la service role key después de
-- comprobar la sesión (lib/auth/current-player.ts), igual que `trainers`.
--
-- Aplicar en Supabase → SQL Editor → Run. Idempotente.
-- Comprobar después con: node scripts/inspect-schema.mjs players

-- 1. Perfil del jugador ------------------------------------------------------

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  -- Copia del email de auth.users, para no tener que leer el esquema auth.
  -- La app la resincroniza en cada entrada; no se edita desde el perfil.
  email text not null,
  full_name text,
  phone text,
  whatsapp_opt_in boolean not null default false,
  -- NULL hasta que termina el onboarding (nombre + teléfono obligatorios).
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_full_name_length check (full_name is null or char_length(full_name) between 2 and 80),
  constraint players_phone_length check (phone is null or char_length(phone) between 8 and 30),
  constraint players_onboarding_complete check (
    onboarding_completed_at is null or (full_name is not null and phone is not null)
  )
);

alter table public.players enable row level security;

drop policy if exists "players_select_own" on public.players;
create policy "players_select_own"
  on public.players
  for select
  to authenticated
  using (auth_user_id = auth.uid());

comment on table public.players is
  'Cuenta global de jugador (una por auth.users). Reserva con uno o varios entrenadores vía player_trainers.';
comment on column public.players.onboarding_completed_at is
  'NULL = onboarding pendiente. La app no deja usar la cuenta hasta completarlo.';

-- 2. Relación jugador ↔ entrenador -------------------------------------------

create table if not exists public.player_trainers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  -- Cómo empezó la relación. self_signup: entró desde la página del
  -- entrenador. booking: primera reserva con sesión (fase posterior).
  -- trainer_added: lo añadió el entrenador desde el dashboard (futuro).
  source text not null check (source in ('self_signup', 'booking', 'trainer_added')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, trainer_id)
);

create index if not exists player_trainers_trainer_idx
  on public.player_trainers (trainer_id, status);

alter table public.player_trainers enable row level security;

-- El jugador ve sus relaciones.
drop policy if exists "player_trainers_select_own_player" on public.player_trainers;
create policy "player_trainers_select_own_player"
  on public.player_trainers
  for select
  to authenticated
  using (player_id in (select id from public.players where auth_user_id = auth.uid()));

-- El entrenador ve las relaciones con sus jugadores (y solo las suyas).
drop policy if exists "player_trainers_select_own_trainer" on public.player_trainers;
create policy "player_trainers_select_own_trainer"
  on public.player_trainers
  for select
  to authenticated
  using (trainer_id in (select id from public.trainers where auth_user_id = auth.uid()));

-- A propósito NO hay política "el entrenador lee el perfil de sus jugadores"
-- en `players`: tendría que consultar player_trainers, cuya política consulta
-- players, y Postgres corta con "infinite recursion detected in policy". Si
-- el dashboard necesita esos perfiles, los lee el servidor con la service
-- role key después de requireTrainer().

comment on table public.player_trainers is
  'Relación N:M jugador ↔ entrenador. Única por pareja; status archived en vez de borrar.';
