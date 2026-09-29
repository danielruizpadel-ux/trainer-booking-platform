-- Lo mínimo que Supabase ya trae y que usan migrations/001 → 012, para
-- aplicar la cadena entera en un Postgres vacío (pruebas aisladas). NO se
-- aplica en Supabase.
--   * roles anon / authenticated / service_role
--   * esquema auth con auth.users y auth.uid() (002, 009)
--   * esquema extensions (008 instala btree_gist ahí)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create schema if not exists extensions;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
