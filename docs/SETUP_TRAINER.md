# Alta de un entrenador y sus huecos

## Aviso de seguridad

`scripts/quick-setup.sh`, `scripts/setup-mauri.sh` y `scripts/setup-mauri-prod.js`
llevaban la **service role key de Supabase escrita en claro** y se borraron el
21/09/2026 (superados por la Opción 1 de abajo). Esa clave se rotó el
27/09/2026; falta verificar que la antigua está revocada y limpiar el
historial de git, que la conserva en commits antiguos. Ver
`docs/ANTES_DE_PUBLICAR.md`, bloqueante 1.

## Opción 1 — endpoint de setup (recomendada)

Desde el 27/09/2026 el endpoint **exige una sesión de administrador**, también
en local (`requireAdmin()`, `lib/auth/current-admin.ts`): sin sesión responde
401 y con una sesión de jugador o de entrenador sin permiso, 403, sin escribir
nada. En producción sigue sin existir (404). Requisitos:

- la migración `migrations/020_admins.sql` aplicada y tu usuario dado de alta
  en `public.admins` (SQL en la cabecera de la migración);
- `<origen>/admin/auth/callback` en Supabase → Authentication → URL
  Configuration → Redirect URLs (p. ej. `http://localhost:3001/admin/auth/callback`).

Con el servidor levantado (`npm run dev`, puerto **3001**):

1. Entra en `http://localhost:3001/admin/login` con tu cuenta de administrador
   (enlace mágico o Google).
2. En esa misma pestaña, abre la consola del navegador y ejecuta (la cookie de
   sesión va sola, mismo origen):

   ```js
   await fetch('/api/admin/setup-mauri', { method: 'POST' }).then((r) => r.json())
   ```

Con `curl` hay que mandar la cookie de sesión de esa pestaña (herramientas del
navegador → Application → Cookies → `sb-…-auth-token`, que puede venir en
varios trozos `.0`, `.1`…). Esa cookie es tu sesión: no la pegues en ningún
archivo del repo ni la compartas.

```bash
curl -X POST http://localhost:3001/api/admin/setup-mauri \
  -H "Cookie: sb-<ref>-auth-token=<valor de tu sesión>"
```

Crea el entrenador y sus huecos de disponibilidad. Devuelve el `id`, el `slug` y
el total de huecos creados. Antes de escribir comprueba si Mauri ya existe y
cuántos huecos tiene; si esa comprobación falla, responde 500 sin escribir
nada.

El endpoint vive en `app/api/admin/setup-mauri/route.ts` y usa
`getSupabaseServerClient()`, así que necesita `SUPABASE_SERVICE_ROLE_KEY` en
`.env.local`.

## Opción 2 — SQL directo

`scripts/seed-mauri.sql`, pegado en el SQL Editor de Supabase. No lleva claves.

Ojo: ese SQL se escribió contra el esquema de `migrations/001_initial_schema.sql`,
que no es el desplegado. Contrastar las columnas con `docs/DATABASE.md` antes de
ejecutarlo.

## Dar de alta otro entrenador

No hay endpoint genérico todavía: `setup-mauri` está escrito para Mauri. Para
otro entrenador hace falta una fila en `trainers` (con su `slug`, que es lo que
resuelve `getTrainerBySlug`) y sus filas en `availability_slots`. La landing
genérica por slug ya existe en `app/[trainerSlug]/page.tsx`.

**Precios (migración 010):** un entrenador nuevo no tiene filas en
`trainer_session_prices` y, sin ellas, la reserva devuelve 409 ("This coach
hasn't set a price…"). Se configuran en Dashboard → Perfil → Public pricing
(las 8 casillas: 60/90 min × 1..4 jugadores). No hay precio por defecto en
código a propósito.

## Darle acceso al dashboard

Requiere la migración `migrations/002_trainers_auth_user_id.sql` aplicada.

1. El entrenador entra una vez en `/dashboard/login` (magic link o Google).
   Verá "Tu cuenta no está vinculada": es lo esperado.
2. En Supabase → SQL Editor:
   ```sql
   update public.trainers
      set auth_user_id = (select id from auth.users where email = 'su-correo')
    where slug = 'su-slug';
   ```
3. Que recargue `/dashboard`.

Detalle y pasos de configuración de Auth: `docs/estado-desarrollo.md`.
