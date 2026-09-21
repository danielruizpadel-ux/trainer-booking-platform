# Alta de un entrenador y sus huecos

## Aviso de seguridad

`scripts/quick-setup.sh`, `scripts/setup-mauri.sh` y `scripts/setup-mauri-prod.js`
llevaban la **service role key de Supabase escrita en claro** y se borraron el
21/09/2026 (superados por la Opción 1 de abajo, que ya iba bien). La clave que
llevaban sigue sin rotar y sigue en un commit antiguo del historial de git: no
subir este repo a un remoto sin antes rotarla en Supabase → Settings → API y
reescribir el historial (o empezar uno nuevo). Ver `docs/ANTES_DE_PUBLICAR.md`,
bloqueante 1.

## Opción 1 — endpoint de setup (recomendada)

Con el servidor levantado (`npm run dev`, puerto **3001**):

```bash
curl -X POST http://localhost:3001/api/admin/setup-mauri \
  -H "Content-Type: application/json"
```

Crea el entrenador y sus huecos de disponibilidad. Devuelve el `id`, el `slug` y
el total de huecos creados.

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
