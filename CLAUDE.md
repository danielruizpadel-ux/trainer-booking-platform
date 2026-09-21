# Reglas del proyecto

Léete esto antes de tocar código. Son las cosas que ya han roto algo una vez.

## ⛔ Si el tema es publicar, desplegar o subir a producción

**Para y lee `docs/ANTES_DE_PUBLICAR.md` primero.** Hay bloqueantes de seguridad
sin resolver: la service role key de Supabase está en claro en `scripts/` y
versionada en git, `/api/admin/setup-mauri` y `/api/dev/seed` no comprueban
absolutamente nada, y el login de admin es un `TODO`.

Si el usuario pide desplegar, subir a Vercel, publicar la web o conectar un
dominio, lo primero es enseñarle esa checklist, no hacer el deploy.

## Base de datos

- **`migrations/001_initial_schema.sql` NO es lo que hay desplegado.** Nunca se
  aplicó tal cual. El esquema de referencia es `docs/DATABASE.md`.
  No existe la tabla `clients`; `reservations` no tiene `client_id`,
  `session_date`, `session_time`, `class_type` ni `client_whatsapp_opt_in`.
- **En un `route.ts`, siempre `getSupabaseServerClient()`.** Con la anon key el
  RLS de `availability_slots` no devuelve nada, y eso rompe la reserva de una
  forma que parece un bug de fechas. Nunca `createClient()` con la anon key en
  el servidor.
- Antes de añadir una columna a un `insert`, comprobar que existe. PostgREST
  rechaza el insert entero por una sola columna desconocida.

## Disponibilidad

- Desde la migración 007 una fila de `availability_slots` es una **ventana**
  (un rango abierto), no una clase. Las clases (1 h o 1 h 30) son reservas con
  `start_time`/`end_time` dentro de la ventana, y se colocan por
  **solapamiento** (`lib/availability/windows.ts`), nunca por igualdad de
  `start_time`. No generar filas de hueco por duración.
- Los inicios reservables los calcula **solo** `lib/availability/booking.ts`
  (`bookableSlotsFor` / `findBookableWindow`), sobre `isSlotOpen` de
  `lib/availability/slot-status.ts`. Lo usan `GET /api/availability` y
  `POST /api/reservations`; el calendario del dashboard usa la misma
  `bookableStarts`. Si hay que cambiar la regla, se cambia ahí. No duplicar la
  condición en una ruta: cuando las dos divergieron, el calendario ofrecía
  huecos que la reserva rechazaba.
- "Reserva viva" (ocupa su rango) = `reservationHoldsSlot`: incluye
  `pending_confirmation`, no solo `confirmed`.
- No usar `.single()` para buscar un hueco por trainer + fecha + hora: la tabla
  admite varios `class_type` a la misma hora y `.single()` falla con más de uno.
- Comparar horas normalizadas a `HH:MM`. En la base están como `HH:MM:SS`.

- Estados de reserva y ventana: `lib/reservations/status.ts` y
  `migrations/003_reservation_confirmation_flow.sql`. La decisión del entrenador
  (confirmar / sin pista) vive solo en `lib/reservations/confirmation.ts`.
- El precio lo calcula el servidor (`lib/reservations/pricing.ts`); nunca
  aceptar un total del navegador.
- Tocar ventanas desde el dashboard solo con `lib/reservations/slots.ts`
  (`loadOwnedOpenWindow` comprueba dueño + abierta + que el rango cabe sin
  solapar; `refreshWindowStatus` recalcula contador y `full`). El estado
  `pending` de ventana es legado: no se escribe.
- Duraciones: `trainers.class_durations` (`lib/availability/durations.ts`);
  la rejilla de inicios es de 30 min si se ofrece 1 h 30, 60 si solo 1 h.

Detalle del flujo completo: `docs/BOOKING_FLOW.md`.

## Dashboard del entrenador (`/dashboard`)

- Estado y pendientes: `docs/estado-desarrollo.md`.
- El `trainer_id` del dashboard **sale de la sesión**, nunca del cliente:
  `requireTrainer()` / `getCurrentSession()` en `lib/auth/current-trainer.ts`.
  Una ruta del dashboard que lea `trainer_id` del body o de la query es un bug
  de seguridad (un entrenador vería datos de otro).
- `proxy.ts` (Next 16; es lo que era `middleware.ts`) redirige sin sesión.
  La pantalla "cuenta no vinculada" la pinta `app/dashboard/(protected)/layout.tsx`.
- Sesión por cookies: `lib/supabase/server.ts` (servidor) y
  `lib/supabase/browser.ts` (cliente). Para leer datos sigue haciendo falta
  `getSupabaseServerClient()` (service role) después de comprobar la sesión.
- Para ver columnas reales: `node scripts/inspect-schema.mjs <tabla>`.
- Shell: `components/dashboard/DashboardShell` (cabecera + nav). Las secciones
  se declaran solo en `components/dashboard/nav-items.ts`. Cada página pone
  `PageHeader` + sus tarjetas; el layout ya pone el marco.

## Diseño

- `DESIGN_SYSTEM.md` es el sistema de diseño, extraído del calendario de reservas
  (`components/trainer/calendar/*` + `components/booking/*`), que es la
  referencia canónica. Si algo desentona, se ajusta lo otro, no el calendario.
- Reglas duras: nada de `shadow-*` (la profundidad es `ring-1 ring-gray-200/70`),
  nada de `border-l-4`, cero emojis en la interfaz (SVG inline), precios en `RM`.
- `text-4xl` o mayor solo en el `h1` del hero.
- El movimiento es solo la entrada de sección; el hover vive en CSS
  (`active:scale-[0.98]`), no en `whileHover`.

## Qué no tocar

- `components/trainer/calendar/*`, `components/booking/*` y `lib/dateUtils.ts`
  son la referencia visual y funcional. Si algo hay que cambiar ahí, preguntar
  antes.
- Para cambiar el marco o el fondo de la reserva sin tocar `components/booking`,
  el sitio es `components/mauri/BookingSection.tsx`.

## Comprobaciones antes de dar algo por hecho

```bash
npm run type-check     # no debe añadir errores nuevos
grep -rn "shadow-md\|shadow-lg\|shadow-xl\|shadow-2xl\|border-l-4" components/mauri   # vacío
grep -rnP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' components/mauri app/mauri         # vacío
```

`npm run type-check` arrastra ~20 errores preexistentes en
`components/trainer/*` y `app/api/admin/*`. Lo que importa es no sumar más.

## Ejecutar

Node 20 (`.nvmrc`). `npm run dev` levanta en el puerto **3001**.
Variables en `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
