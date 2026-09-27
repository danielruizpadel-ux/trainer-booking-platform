-- 020 — Quién es administrador (panel /admin y rutas /api/admin)
--
-- Requiere solo auth.users (de Supabase). No depende de 011–019; va después
-- de ellas en la numeración y se puede aplicar en cualquier momento.
--
-- Mismo patrón que trainers.auth_user_id (002) y players.auth_user_id (009):
-- la sesión es la de Supabase Auth (auth.getUser() en el servidor) y el papel
-- sale de una tabla enlazada por auth_user_id, leída con la service role
-- (lib/auth/current-admin.ts). Ser entrenador o jugador NO da permiso de
-- administrador: solo una fila aquí.
--
--   * Nadie se hace administrador desde la app: no hay ninguna ruta que
--     escriba en esta tabla. Se concede y se retira a mano en el SQL Editor.
--   * RLS activo sin políticas y sin GRANT para anon/authenticated: la clave
--     pública no ve ni escribe nada aquí (ni siquiera saber quién es admin).
--   * La app falla cerrada: si la tabla no existe todavía (020 sin aplicar)
--     o la lectura falla, nadie es administrador.
--
-- Activar (SQL Editor, como postgres), con el email con el que ese usuario
-- entra en la app (enlace mágico o Google):
--
--   insert into public.admins (auth_user_id, granted_by, note)
--   select id, 'Dani', 'Administrador principal'
--     from auth.users
--    where lower(email) = lower('<email del administrador>')
--   on conflict (auth_user_id) do nothing;
--
--   -- comprobar:
--   select a.auth_user_id, u.email, a.granted_by, a.granted_at
--     from public.admins a join auth.users u on u.id = a.auth_user_id;
--
-- Retirar el permiso (efecto inmediato: cada petición vuelve a comprobarlo):
--
--   delete from public.admins where auth_user_id = '<id>';
--
-- Además, en Supabase → Authentication → URL Configuration → Redirect URLs
-- hay que añadir <origen>/admin/auth/callback (p. ej.
-- http://localhost:3001/admin/auth/callback y la URL de producción).
--
-- Aplicar en Supabase → SQL Editor → Run (como postgres). Idempotente. En una
-- transacción. No cambia ningún dato existente.

begin;

create table if not exists public.admins (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by text not null,
  note text,
  granted_at timestamptz not null default now(),
  constraint admins_granted_by_not_blank check (length(trim(granted_by)) > 0)
);

comment on table public.admins is
  'Administradores del panel /admin y de /api/admin (una fila por usuario de auth.users). Solo se escribe a mano desde el SQL Editor; la app solo la lee con la service role. Migración 020.';

alter table public.admins enable row level security;

-- Sin políticas: con RLS activo, anon/authenticated no ven ni escriben filas.
-- Y además sin GRANT, por si algún día apareciera una política permisiva.
revoke all on public.admins from anon, authenticated;
revoke all on public.admins from public;
grant select, insert, update, delete on public.admins to service_role;

commit;
