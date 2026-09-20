# ⛔ ANTES DE PUBLICAR — LEER ENTERO

> Este proyecto **NO está listo para estar en internet tal cual**.
> Hay cosas que, publicadas hoy, exponen la base de datos entera y los datos
> personales de los clientes.
>
> Nada de esto es teórico: está todo verificado en el código el 19/09/2026.

Marca cada casilla antes de hacer deploy. Los bloqueantes son bloqueantes.

---

## 🔴 BLOQUEANTES — sin esto NO se publica

### 1. La service role key está escrita en claro y versionada

- [ ] Rotar la clave en Supabase → Settings → API
- [ ] Sacarla de los 3 archivos y leerla de `process.env.SUPABASE_SERVICE_ROLE_KEY`
- [ ] Limpiar el historial de git

**Archivos afectados:** `scripts/quick-setup.sh`, `scripts/setup-mauri.sh`,
`scripts/setup-mauri-prod.js`.

**Y un cuarto, menos obvio:** `.claude/settings.local.json` también contiene la
clave (se quedó grabada al autorizar un comando). No estaba en `.gitignore`, así
que un `git add .` la habría subido. Ya está añadido al `.gitignore` — comprueba
que sigue estándolo.

Esa clave **se salta el RLS por completo**: quien la tenga lee, modifica y borra
toda la base de datos, incluidos los datos de tus clientes. Hoy el repo no tiene
remoto configurado, así que no ha salido de tu ordenador. En cuanto lo subas a
GitHub —**aunque sea privado**— está expuesta.

Quitarla del código **no basta**: los commits antiguos la conservan. Hay que
reescribir el historial (`git filter-repo`) o, más simple, empezar un repo nuevo
sin historial. Y rotarla igualmente, porque hay que asumirla comprometida.

### 2. Endpoints de administración abiertos — RESUELTO el 19/09/2026

- [x] `app/api/admin/setup-mauri/route.ts` devuelve 404 si `NODE_ENV === 'production'`
- [x] `app/api/dev/seed/route.ts` borrado

`setup-mauri` sigue sin auth en local a propósito (es la forma cómoda de dar de
alta a Mauri, ver `docs/SETUP_TRAINER.md`). Si algún día hace falta en
producción, exigir una cabecera con un secreto de entorno, no quitar el 404.

### 3. El panel de admin no tiene autenticación

- [ ] Implementar el login de verdad, o no desplegar `/admin`

`app/admin/login/page.tsx` tiene literalmente `// TODO: Implement admin
authentication`, hace `console.log` de la contraseña y **muestra en pantalla unas
credenciales de demo**. No autentica nada.

### 4. Revisar las políticas RLS de `reservations`

- [ ] Comprobar en Supabase → Authentication → Policies que la clave **anon**
      no puede leer `reservations`

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
