# ⛔ ANTES DE PUBLICAR — LEER ENTERO

> Este proyecto **NO está listo para estar en internet tal cual**.
> Hay cosas que, publicadas hoy, exponen la base de datos entera y los datos
> personales de los clientes.
>
> Nada de esto es teórico: está todo verificado en el código el 19/09/2026.

Marca cada casilla antes de hacer deploy. Los bloqueantes son bloqueantes.

---

## 🔴 BLOQUEANTES — sin esto NO se publica

### 1. La service role key antigua sigue en el historial de git — ROTADA el 27/09/2026

- [x] Los 3 scripts que la llevaban en claro se borraron (21/09/2026, Claude
      Cowork): estaban superados por `POST /api/admin/setup-mauri` (que ya usa
      `getSupabaseServerClient()` / `SUPABASE_SERVICE_ROLE_KEY` desde
      `.env.local`, ver `docs/SETUP_TRAINER.md`) y escribían además contra
      columnas que ya no existen (`is_available`, `price` en `trainers`).
- [x] Rotar la clave en Supabase → Settings → API: rotada el 27/09/2026
      (lo confirma Dani). La clave nueva solo está en `.env.local` y en las
      variables del despliegue; no se escribe en ningún archivo versionado.
- [ ] **Verificar la revocación de la clave antigua**: comprobar en el panel
      de Supabase que la antigua ya no aparece como activa y que una
      petición con ella se rechaza (401). Pendiente: no se ha comprobado
      desde este repo (sin acceso a Supabase ni a la clave).
- [ ] **Limpiar el historial de git**: `git filter-repo` o un repo nuevo sin
      historial. Ya no basta con hacerlo en local: el repo tiene un remoto
      `origin` en GitHub y, según las referencias remotas guardadas en local
      (26/09/2026), sus ramas (`origin/main` incluida) contienen los commits
      antiguos que añadieron la clave (d9af7f8, aeb59a6, f262bfe, 9a5261f,
      d80133b). Hay que reescribir también las ramas remotas y revisar forks
      o clones. Con la clave rotada y revocada, el valor antiguo deja de dar
      acceso, pero el historial debe limpiarse igualmente.

**Archivos borrados:** `scripts/quick-setup.sh`, `scripts/setup-mauri.sh`,
`scripts/setup-mauri-prod.js`.

**Un cuarto sitio, menos obvio:** `.claude/settings.local.json` también contenía
la clave (se quedó grabada al autorizar un comando). Ya está en `.gitignore` —
comprueba que sigue estándolo.

Esa clave **se saltaba el RLS por completo**: quien la tuviera leía, modificaba y
borraba toda la base de datos. Por eso se ha rotado. Mientras no se verifique la
revocación, trata la antigua como activa. Y el historial se limpia igualmente:
los commits antiguos conservan el valor (el 26/09 seguía en 5 commits, que ya
están en el remoto).

### 2. Endpoints de administración abiertos — RESUELTO el 19/09/2026

- [x] `app/api/admin/setup-mauri/route.ts` devuelve 404 si `NODE_ENV === 'production'`
- [x] `app/api/dev/seed/route.ts` borrado

Desde el 27/09/2026 `setup-mauri` exige además sesión de administrador
también en local (`requireAdmin()`: sin sesión 401, jugador o entrenador sin
permiso 403, sin escribir nada; ver el punto 3 y `docs/SETUP_TRAINER.md`).
En producción sigue devolviendo 404: si algún día hace falta allí, no quitar
el 404 sin revisarlo; el permiso de administrador ya está en la ruta.

### 3. El panel de admin no tenía autenticación — IMPLEMENTADA el 27/09/2026 (falta activarla)

- [x] Autenticación y autorización en el servidor para todo lo administrativo:
      `/admin`, `/admin/dashboard` y `POST /api/admin/setup-mauri`
      (`lib/auth/current-admin.ts`). La sesión es la de la app (Supabase
      Auth, `getUser()`), el login de `/admin` es el mismo acceso por enlace
      mágico o Google, y el permiso es una fila en la tabla `admins`
      (migración 020). Jugador o entrenador sin esa fila: las páginas dan 404
      y la API 403; sin sesión, la página lleva al login y la API da 401.
      Falla cerrado si la tabla no existe. Sin credenciales de demo.
      Pruebas: `scripts/verify-admin-access.mjs`.
- [ ] Aplicar `migrations/020_admins.sql` y dar de alta a los administradores
      (SQL en su cabecera). Hasta entonces nadie entra en `/admin`.
- [ ] Añadir `<origen>/admin/auth/callback` a Supabase → Authentication →
      URL Configuration → Redirect URLs (local y producción).

### 4. Revisar las políticas RLS de `reservations` — ESCRITURA CERRADA el 25/09/2026

- [x] Auditado el 24/09 (Dani): RLS activo, **ninguna** política; anon y
      authenticated tenían GRANT de todo. La migración 010 les quita INSERT,
      UPDATE, DELETE, TRUNCATE, REFERENCES y TRIGGER en `reservations` y
      `trainer_session_prices` (solo queda SELECT, que sin política no
      devuelve filas). Con la clave anon, `reservations` devuelve 0 filas.
- [ ] Borrar `reservations_backup_008` (copia manual hecha al aplicar la 008,
      no está en ninguna migración): tiene nombre, email y teléfono de
      clientes y está expuesta por PostgREST. RLS la protege hoy, pero no hace
      falta mantenerla.
- [ ] Límite de peticiones en `POST /api/reservations`: hoy no hay ninguno
      (spam de reservas / mensajes al entrenador). Obligatorio antes de publicar.
- [ ] Idempotencia de `POST /api/reservations` (revisión de Codex, 25/09,
      MEDIUM): un reintento de red tras un insert que sí llegó puede crear
      la reserva dos veces en franjas distintas o devolver un 409 engañoso
      en la misma franja. Hoy lo mitigan: el botón se desactiva mientras se
      envía, la restricción `reservations_no_overlap` (008) impide dos
      reservas vivas solapadas y el 23P01 se traduce a 409. Antes de
      producción: clave de idempotencia por checkout (p. ej. un UUID del
      navegador guardado con la reserva y único en BD).
- [ ] Limpieza técnica: `components/trainer/BookingSection.tsx`,
      `components/trainer/BookingForm.tsx` (formulario antiguo con "$99" y
      POST con date/time) y `lib/services/reservations.service.ts` ya no los
      usa ninguna ruta (desde el 25/09 `/[trainerSlug]` usa el mismo widget
      A2 que `/mauri`). Borrarlos cuando se toque esa zona.

La tabla guarda nombre, email y teléfono de cada cliente. Si hay una política de
lectura permisiva, cualquiera con tu `NEXT_PUBLIC_SUPABASE_ANON_KEY` —que va en
el navegador, es pública por diseño— puede descargarse la lista completa de tus
clientes. Eso es una brecha de datos personales.

Ahora mismo no se puede confirmar desde fuera porque la tabla está vacía: una
consulta anónima devuelve `[]` tanto si la política la bloquea como si no hay
filas. Hay que mirarlo en el panel, no deducirlo.

De paso: comprobar también quién puede **insertar**. Si la inserción es abierta,
cualquiera puede llenarte la agenda de reservas falsas sin pasar por tu web.

---

## 🟠 IMPORTANTE — antes de enseñárselo a un cliente real

### 5. Datos de relleno en la web

- [ ] `instagram="@mauridoctor"` está **fijo en el código** en `app/mauri/page.tsx`
- [ ] Los fallbacks `mauri@padeldoctor.com`, `+1234567890` y `1234567890` salen
      si el entrenador no tiene email o teléfono en la base de datos
- [ ] Valoración 4.9 y 156 reseñas: comprobar que son reales y no el fallback
- [ ] Los precios de los programas (RM 199 / 249 / 149) están fijos en
      `components/mauri/CoursesSection.tsx`

Un teléfono `+1234567890` en el footer de una web de pago se ve, y se nota.

### 6. Los botones "Más información" no hacen nada

- [ ] Enlazarlos a algo (WhatsApp, un ancla, un formulario) o quitarlos

En `components/mauri/CoursesSection.tsx` son `<button>` sin `onClick`.

### 7. `reservations.price` se queda vacío — RESUELTO el 19/09/2026

- [x] El servidor calcula y guarda el precio (`lib/reservations/pricing.ts`) en
      `POST /api/reservations`; el navegador solo lo muestra.
- [ ] Aplicar `migrations/003_reservation_confirmation_flow.sql` (estados de
      reserva/hueco con `CHECK`). Las 3 reservas anteriores a esta fecha siguen
      sin `price`: es histórico, no se recalcula.

---

## 🟡 CONFIGURACIÓN DEL DEPLOY

### 8. Variables de entorno en Vercel

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` ← **la nueva, la rotada**

`SUPABASE_SERVICE_ROLE_KEY` **nunca** lleva el prefijo `NEXT_PUBLIC_`. Ese
prefijo mete la variable en el JavaScript que descarga el navegador.

Sin esta variable la web despliega pero **el calendario sale vacío**: las rutas
de servidor necesitan la service role key para ver los huecos (ver
`docs/DATABASE.md`).

### 9. Avisos del build

- [ ] `metadata.viewport` está deprecado en `app/layout.tsx` → mover a `export const viewport`
- [ ] `next.config.js`: añadir `images: { qualities: [75, 85] }`, que el hero usa
      `quality={85}`

No rompen el build, pero ensucian los logs de producción.

### 10. Rutas que sobran en producción — API RESUELTA el 19/09/2026

- [x] `/api/reservas`, `/api/clientes`, `/api/disponibilidad`, `/api/trainers`
      (GET/POST), `/api/trainers/[id]/rates` y `DELETE /api/trainers/[id]`
      borradas; `GET/PUT /api/trainers/[id]` exigen sesión; `/api/coaches` ya no
      devuelve email ni teléfono. Detalle en `docs/estado-desarrollo.md`.
- [ ] Decidir si `/web` y `/trainers` (páginas legacy en inglés) se publican o se
      quitan. `/web` enlaza a `/admin/login`, que no autentica (punto 3).

---

## Comprobación final

```bash
npm run build          # tiene que pasar
npm run type-check     # ~20 errores preexistentes; que no suban

# ¿queda la clave secreta en algo versionado? TIENE que salir vacío:
git grep -n "sb_secret_"

# ¿y en el historial? TIENE que salir vacío:
git log -p -S "sb_secret_" --oneline | head
```

Si alguno de los dos devuelve algo, **no publiques**.

(Un `grep -rn` normal también encuentra la clave en `.env.local` y en la caché de
`.next/`. Eso es esperable: los dos están en `.gitignore` y no se suben. Por eso
la comprobación se hace con `git grep`, que solo mira lo versionado.)
