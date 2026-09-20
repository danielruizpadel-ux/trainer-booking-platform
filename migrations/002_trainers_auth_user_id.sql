-- 002 — Vínculo trainers ↔ Supabase Auth
--
-- Añade `auth_user_id` a `trainers`: el usuario de Supabase Auth (auth.users)
-- que puede entrar en el dashboard de ese entrenador.
--
-- Contexto (verificado contra el proyecto vkriseshpcjvgsnwzqcs el 19/09/2026):
--   * `trainers` ya tiene una columna `user_id` que apunta a `public.users`, una
--     tabla propia (vacía) que NO es `auth.users`. No se reutiliza: es un resto
--     del esquema original y no tiene nada que ver con Supabase Auth.
--   * `trainers` tiene RLS activo y la clave anon no ve ninguna fila. El servidor
--     resuelve el entrenador con la service role key (lib/auth/current-trainer.ts),
--     así que la política de abajo es solo una red de seguridad para el futuro.
--
-- Cómo aplicarla: pegar en Supabase → SQL Editor → Run. No hay RPC `exec_sql`
-- en el proyecto, así que no se puede aplicar desde un script.
-- Comprobar después con: node scripts/inspect-schema.mjs trainers

alter table public.trainers
  add column if not exists auth_user_id uuid
    unique
    references auth.users (id) on delete set null;

comment on column public.trainers.auth_user_id is
  'Usuario de Supabase Auth con acceso al dashboard de este entrenador. NULL = sin acceso todavía.';

-- Un entrenador autenticado puede leer su propia fila (y solo la suya).
-- No hay política de escritura: los cambios de perfil pasan por el servidor.
drop policy if exists "trainers_select_own" on public.trainers;
create policy "trainers_select_own"
  on public.trainers
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Vincular un entrenador a mano (hasta que exista un flujo de invitación).
-- El usuario tiene que haber entrado al menos una vez (existe en auth.users):
--
--   update public.trainers
--      set auth_user_id = (select id from auth.users where email = 'correo@del.entrenador')
--    where slug = 'mauri';
-- ---------------------------------------------------------------------------
