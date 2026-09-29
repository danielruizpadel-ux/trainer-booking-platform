-- 010 — Checkout A2: datos del checkout en la reserva, precios editables por
-- entrenador y escritura directa de `reservations` cerrada.
--
-- Requiere, en este orden: 008 (reservations_no_overlap) y 009 (players).
-- Lo comprueba el PASO 0 y aborta si falta algo. Después de aplicarla se
-- despliega el código de A2; al revés, PostgREST rechazaría el insert entero
-- por columnas desconocidas (CLAUDE.md).
--
-- Qué hace:
--
--   A. Aislamiento de escritura de `reservations`. TODAS las escrituras de la
--      app van por rutas de servidor con la service role (que se salta RLS y
--      conserva sus permisos). anon/authenticated no pueden escribir nada
--      directamente por PostgREST, ni siquiera si mañana alguien añade una
--      política permisiva por error: se les quitan los GRANT de escritura.
--      No se añade ninguna política SELECT (llegará con "Mis reservas").
--
--   B. Columnas nuevas en `reservations`, sin backfill:
--        player_id        uuid NULL → players(id) ON DELETE SET NULL. Solo la
--                         escribe el servidor desde la sesión. Nunca se
--                         rellena cruzando emails.
--        client_message   text NULL, ≤ 500 caracteres. Mensaje del cliente al
--                         entrenador; NO es `notes` (notas internas).
--        player_count     smallint NOT NULL DEFAULT 1, 1..4. Personas en esa
--                         clase privada. No es max_capacity.
--        whatsapp_opt_in  boolean NULL. NULL = reserva antigua (la app lee el
--                         "WhatsApp: si/no" de `notes` como compatibilidad).
--      Reservas existentes: player_id NULL, client_message NULL,
--      player_count 1, whatsapp_opt_in NULL.
--
--   C. `trainer_session_prices`: precio por entrenador × duración × nº de
--      jugadores, editable desde el dashboard. Es la configuración VIGENTE;
--      lo cobrado queda como snapshot en reservations.price. Se precarga para
--      los entrenadores que ya existen con la tabla que decidió Dani
--      (24/09/2026). Si una fila ya existe, NO se sobrescribe.
--
-- Idempotencia: se puede ejecutar varias veces. Las restricciones con nombre
-- se borran y se vuelven a crear (mismo patrón que 007 y 008), de modo que
-- si faltan, están a medias o tienen otra definición, quedan siempre como
-- aquí. Antes de crearlas se comprueba que ningún dato existente las rompe.
-- Todo va en una transacción: si algo falla, no queda nada a medias.
--
-- Aplicar en Supabase → SQL Editor → Run. Después, comprobaciones del final.
--
-- ROLLBACK (manual y DESTRUCTIVO: pierde los datos de las columnas nuevas y
-- los precios configurados; no hay rollback automático a propósito):
--
--   begin;
--   drop table if exists public.trainer_session_prices;
--   drop index if exists public.reservations_player_idx;
--   alter table public.reservations
--     drop constraint if exists reservations_player_id_fkey,
--     drop constraint if exists reservations_client_message_length,
--     drop constraint if exists reservations_player_count_range,
--     drop column if exists player_id,
--     drop column if exists client_message,
--     drop column if exists player_count,
--     drop column if exists whatsapp_opt_in;
--   commit;
--   notify pgrst, 'reload schema';
--
--   Los REVOKE y las políticas borradas NO se deshacen: volver a abrir la
--   escritura pública de `reservations` no es un estado al que se quiera volver.

begin;

-- ─── PASO 0 — requisitos ────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.players') is null then
    raise exception '010 requiere la 009: no existe public.players';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'reservations_no_overlap'
       and conrelid = 'public.reservations'::regclass
  ) then
    raise exception '010 requiere la 008: no existe la restricción reservations_no_overlap';
  end if;
end $$;

-- ─── A. Aislamiento de escritura de reservations ────────────────────────────

alter table public.reservations enable row level security;

-- Las dos políticas históricas de migrations/001 (nunca se aplicó tal cual,
-- pero otro entorno podría tenerlas): INSERT abierto a cualquiera y SELECT
-- USING (true), que expondría los datos personales de todos los clientes.
drop policy if exists "Anyone can create reservations" on public.reservations;
drop policy if exists "Can read own reservations" on public.reservations;

-- Cualquier otra política que permita escribir (o ALL, que incluye escribir),
-- se llame como se llame. Las SELECT que queden se listan para revisarlas a
-- mano: no se borran a ciegas.
do $$
declare
  p record;
begin
  for p in
    select policyname, cmd
      from pg_policies
     where schemaname = 'public' and tablename = 'reservations'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    raise notice '010: borrando política % (%) de reservations', p.policyname, p.cmd;
    execute format('drop policy %I on public.reservations', p.policyname);
  end loop;

  for p in
    select policyname, cmd
      from pg_policies
     where schemaname = 'public' and tablename = 'reservations'
  loop
    raise notice '010: queda la política % (%) en reservations; revísala a mano', p.policyname, p.cmd;
  end loop;
end $$;

-- Defensa en profundidad: aunque apareciera una política permisiva, sin
-- GRANT no hay escritura.
--   * INSERT/UPDATE/DELETE/TRUNCATE: escritura directa. Fuera.
--   * REFERENCES (crear FKs que apunten aquí) y TRIGGER (crear triggers en la
--     tabla): solo sirven con DDL, que un cliente público nunca debe tener.
--     La app no los usa desde anon/authenticated. Fuera también.
--   * SELECT se mantiene: sin política no devuelve ninguna fila (RLS), y la
--     futura política de "Mis reservas" lo necesitará.
-- La service role y postgres conservan sus propios permisos: las rutas de
-- servidor y el editor de Supabase siguen funcionando igual.
revoke insert, update, delete, truncate, references, trigger
  on public.reservations from anon, authenticated;

-- ─── B. Columnas nuevas de reservations ─────────────────────────────────────

alter table public.reservations
  add column if not exists player_id uuid,
  add column if not exists client_message text,
  add column if not exists player_count smallint,
  add column if not exists whatsapp_opt_in boolean;

-- player_count: default + NOT NULL también si la columna ya existía sin ellos.
alter table public.reservations alter column player_count set default 1;
update public.reservations set player_count = 1 where player_count is null;
alter table public.reservations alter column player_count set not null;

-- Datos que romperían las restricciones: mejor un error claro que uno de
-- Postgres a media migración.
do $$
declare
  bad bigint;
begin
  select count(*) into bad from public.reservations where player_count not between 1 and 4;
  if bad > 0 then
    raise exception '010: % reservas con player_count fuera de 1..4; corrígelas antes', bad;
  end if;

  select count(*) into bad from public.reservations where char_length(client_message) > 500;
  if bad > 0 then
    raise exception '010: % reservas con client_message de más de 500 caracteres; corrígelas antes', bad;
  end if;

  select count(*) into bad
    from public.reservations r
   where r.player_id is not null
     and not exists (select 1 from public.players p where p.id = r.player_id);
  if bad > 0 then
    raise exception '010: % reservas con player_id que no existe en players; corrígelas antes', bad;
  end if;
end $$;

alter table public.reservations drop constraint if exists reservations_player_id_fkey;
alter table public.reservations
  add constraint reservations_player_id_fkey
  foreign key (player_id) references public.players (id) on delete set null;

alter table public.reservations drop constraint if exists reservations_client_message_length;
alter table public.reservations
  add constraint reservations_client_message_length
  check (client_message is null or char_length(client_message) <= 500);

alter table public.reservations drop constraint if exists reservations_player_count_range;
alter table public.reservations
  add constraint reservations_player_count_range
  check (player_count between 1 and 4);

-- "Mis reservas" (fase futura): las del jugador, recientes primero.
drop index if exists public.reservations_player_idx;
create index reservations_player_idx
  on public.reservations (player_id, created_at desc)
  where player_id is not null;

comment on column public.reservations.player_id is
  'Jugador (players.id) que reservó con su cuenta. Solo lo escribe el servidor desde la sesión. NULL: invitado, manual, paquete o reserva anterior a la 010. Nunca se rellena por email. Migración 010.';
comment on column public.reservations.client_message is
  'Mensaje opcional del cliente al entrenador (≤ 500). No son las notas internas (`notes`). Texto plano. Migración 010.';
comment on column public.reservations.player_count is
  'Personas en esta clase privada (1..4). No es capacidad de grupo. Migración 010.';
comment on column public.reservations.whatsapp_opt_in is
  'Avisos operativos por WhatsApp para esta reserva. NULL solo en reservas anteriores a la 010 (la app lee entonces "WhatsApp: si/no" de notes). Migración 010.';

-- ─── C. Precios por entrenador × duración × nº de jugadores ─────────────────

-- Si ya hubiera una tabla con este nombre y otra forma, no se toca: se para.
do $$
begin
  if to_regclass('public.trainer_session_prices') is not null and (
    select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'trainer_session_prices'
       and column_name in ('trainer_id', 'duration_minutes', 'player_count', 'price_rm', 'created_at', 'updated_at')
  ) <> 6 then
    raise exception '010: public.trainer_session_prices ya existe con otras columnas; revísala antes';
  end if;
end $$;

create table if not exists public.trainer_session_prices (
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  duration_minutes smallint not null,
  player_count smallint not null,
  price_rm numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trainer_id, duration_minutes, player_count)
);

alter table public.trainer_session_prices drop constraint if exists trainer_session_prices_duration_check;
alter table public.trainer_session_prices
  add constraint trainer_session_prices_duration_check
  check (duration_minutes in (60, 90));

alter table public.trainer_session_prices drop constraint if exists trainer_session_prices_player_count_check;
alter table public.trainer_session_prices
  add constraint trainer_session_prices_player_count_check
  check (player_count between 1 and 4);

alter table public.trainer_session_prices drop constraint if exists trainer_session_prices_price_check;
alter table public.trainer_session_prices
  add constraint trainer_session_prices_price_check
  check (price_rm > 0 and price_rm <= 100000);

-- Igual que reservations: solo el servidor (service role) lee y escribe.
alter table public.trainer_session_prices enable row level security;
revoke insert, update, delete, truncate, references, trigger
  on public.trainer_session_prices from anon, authenticated;

-- Tabla inicial decidida por Dani (24/09/2026). 90 min = 60 min × 1,5.
-- ON CONFLICT DO NOTHING: volver a ejecutar la 010 nunca pisa un precio que
-- el entrenador ya haya cambiado desde el dashboard.
insert into public.trainer_session_prices (trainer_id, duration_minutes, player_count, price_rm)
select t.id, v.duration_minutes, v.player_count, v.price_rm
  from public.trainers t
 cross join (
   values
     (60::smallint, 1::smallint, 300.00::numeric),
     (60::smallint, 2::smallint, 300.00::numeric),
     (60::smallint, 3::smallint, 350.00::numeric),
     (60::smallint, 4::smallint, 350.00::numeric),
     (90::smallint, 1::smallint, 450.00::numeric),
     (90::smallint, 2::smallint, 450.00::numeric),
     (90::smallint, 3::smallint, 525.00::numeric),
     (90::smallint, 4::smallint, 525.00::numeric)
 ) as v (duration_minutes, player_count, price_rm)
on conflict (trainer_id, duration_minutes, player_count) do nothing;

comment on table public.trainer_session_prices is
  'Precio VIGENTE de una clase privada por entrenador, duración (60/90) y nº de jugadores (1..4), en RM. Editable desde el dashboard. Lo cobrado se guarda como snapshot en reservations.price. Migración 010.';

commit;

notify pgrst, 'reload schema';

-- ─── Comprobaciones después de aplicar (solo lectura) ───────────────────────
--
-- 1. Ninguna política de escritura y ningún GRANT de escritura para clientes públicos:
--    select policyname, cmd from pg_policies where schemaname = 'public' and tablename in ('reservations', 'trainer_session_prices');
--    select table_name, grantee, privilege_type from information_schema.role_table_grants
--     where table_schema = 'public' and table_name in ('reservations', 'trainer_session_prices')
--       and grantee in ('anon', 'authenticated') order by 1, 2, 3;
--    → solo SELECT para anon y authenticated.
--
-- 2. Columnas y restricciones:
--    select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.reservations'::regclass
--       and conname in ('reservations_player_id_fkey', 'reservations_client_message_length',
--                       'reservations_player_count_range', 'reservations_no_overlap');
--    → 4 filas.
--
-- 3. Reservas existentes intactas:
--    select count(*) filter (where player_id is not null) as con_jugador,
--           count(*) filter (where player_count <> 1)     as con_varios,
--           count(*) filter (where whatsapp_opt_in is not null) as con_whatsapp,
--           count(*) filter (where client_message is not null) as con_mensaje
--      from public.reservations;
--    → 0, 0, 0, 0.
--
-- 4. Precios precargados (8 por entrenador):
--    select t.slug, count(*) from public.trainer_session_prices p join public.trainers t on t.id = p.trainer_id group by 1;
