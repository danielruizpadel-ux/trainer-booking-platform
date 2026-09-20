# Alta de un entrenador y sus huecos

## Aviso de seguridad antes de usar `scripts/`

`scripts/quick-setup.sh`, `scripts/setup-mauri.sh` y `scripts/setup-mauri-prod.js`
llevan la **service role key de Supabase escrita en claro**, y los tres están
versionados en git. Esa clave se salta el RLS: quien la tenga puede leer y
borrar toda la base de datos.

Hoy el repo no tiene remoto configurado, así que no ha salido de este ordenador.
Antes de subirlo a GitHub (aunque sea privado) hay que:

1. Rotar la clave en Supabase → Settings → API.
2. Sacarla de los tres scripts y leerla de `process.env.SUPABASE_SERVICE_ROLE_KEY`.
3. Limpiar el historial de git, porque el commit antiguo la sigue conteniendo
   (`git filter-repo` o reescribir el historial).

Mientras tanto, preferir la opción 1 de abajo, que no toca esos scripts.

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
