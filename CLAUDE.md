# Reglas del proyecto

Léete esto antes de tocar código. Son las cosas que ya han roto algo una vez.

## ⛔ Si el tema es publicar, desplegar o subir a producción

**Para y lee `docs/ANTES_DE_PUBLICAR.md` primero.** Bloqueantes de seguridad sin
resolver: la key vieja de Supabase sigue en el historial de git sin rotar (los
3 scripts que la llevaban en claro se borraron el 21/09, pero un commit
antiguo la conserva — no reescribir el historial ni añadir un remoto sin
rotarla antes), y el login de admin sigue siendo un `TODO`.

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
- **Día apagado con reserva viva dentro (prompt 23, 21/09/2026 — código
  hecho, PENDIENTE DE VERIFICAR EN EL NAVEGADOR):** antes, si el entrenador
  apagaba un día (o lo bloqueaba con una excepción) que tenía una ventana
  ancha con reservas dentro, la ventana entera se quedaba `available` tal
  cual y el tiempo libre que le sobrara alrededor de esas reservas seguía
  ofreciéndose a clientes nuevos ese día. Ahora `generate.ts` le pone
  `status = 'blocked'` a esa ventana (nunca la borra, nunca toca la
  reserva); si el día se reactiva más tarde, se reabre sola
  (`toReopen`). Ver el comentario de cabecera de
  `lib/availability/generate.ts` para el detalle exacto. **No se ha podido
  probar en el navegador todavía** (sin `npm run dev` disponible desde este
  entorno de Cowork en el momento de escribir esto) — antes de dar esto por
  cerrado, repetir el caso real: apagar un día con una ventana ancha y una
  reserva dentro, comprobar que `GET /api/availability` deja de ofrecer el
  resto de esa ventana ese día, y que la reserva se sigue viendo y se puede
  cancelar con normalidad.
- No usar `.single()` para buscar un hueco por trainer + fecha + hora: la tabla
  admite varios `class_type` a la misma hora y `.single()` falla con más de uno.
- Comparar horas normalizadas a `HH:MM`. En la base están como `HH:MM:SS`.

- Estados de reserva y ventana: `lib/reservations/status.ts` y
  `migrations/003_reservation_confirmation_flow.sql`. La decisión del entrenador
  (confirmar / sin pista) vive solo en `lib/reservations/confirmation.ts`.
- El precio lo calcula el servidor; nunca aceptar un total del navegador.
  Precio base = `trainer_session_prices` (entrenador × duración × nº de
  jugadores, migración 010, editable en Disponibilidad → Precios), leído con
  `lib/reservations/trainer-prices.ts`; el cálculo puro (descuento 5+/10+,
  redondeo) está en `lib/reservations/pricing.ts`. Sin precio configurado se
  falla con un error claro: **nunca** volver a un RM300 fijo en código.
  Manual y paquetes usan el precio de 1 jugador.
- `reservations.notes` son las **notas internas** del entrenador. El mensaje
  del cliente va en `client_message` (≤ 500, texto plano, nunca en logs ni
  como HTML) y la preferencia de WhatsApp en `whatsapp_opt_in`
  (`lib/reservations/whatsapp.ts`: columna primero; el "WhatsApp: si/no" de
  `notes` solo en reservas anteriores a la 010). No volver a escribir flags en `notes`.
- `getSupabaseServerClient()` falla cerrado sin `SUPABASE_SERVICE_ROLE_KEY`.
  Desde la 010, anon/authenticated no pueden escribir `reservations` ni
  `trainer_session_prices`: toda escritura va por el servidor.
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

## Cuenta de jugador (`/cuenta`) — Fase A1

- Detalle y pendientes: `docs/PLAYER_ACCOUNTS.md`. Tablas `players` y
  `player_trainers` (migración 009, **sin aplicar todavía**).
- El jugador **sale de la sesión**, nunca del cliente: `getPlayerSession()` /
  `requirePlayer()` en `lib/auth/current-player.ts`. Una ruta de
  `/api/player` que lea un `player_id` del body o de la query es un bug de
  seguridad. Mismo criterio que `requireTrainer()`.
- Una sola sesión de Supabase por navegador: la misma cuenta puede ser
  entrenador y jugador; salir de una sale de las dos.
- Checkout A2 (inglés, `components/booking/checkout/`): con sesión y perfil
  completo, `POST /api/reservations` con `as_player: true` toma player_id,
  nombre/teléfono/WhatsApp del perfil y el email de Auth **desde la sesión** e
  ignora los `client_*` y cualquier `player_id` del body. Sin sesión, invitado
  (player_id NULL). Detalle: `docs/PLAYER_ACCOUNTS.md`.

## Programa (`/programa`) — PROTOTIPO con datos de ejemplo

- Player Development Plan: 5 pantallas con jugador, entrenadores, notas y
  huecos **inventados** (`lib/programs/sample-data.ts`). Nada cobra, reserva,
  consume créditos ni guarda progreso. Las reglas del programa (precios, 10
  sesiones, 24 h) están en `lib/programs/catalog.ts`.
- **Solo existe con `PROGRAMA_DEMO=1`** (`PROGRAMA_DEMO=1 npm run dev`). Sin
  esa variable, `/programa/**` da 404 en todas partes, también en un deploy.
  Doble barrera: `proxy.ts` y `requireProgramDemo()` al principio de cada
  página (`lib/programs/require-demo.ts`). Una página nueva de `/programa`
  tiene que llamarlo también: un layout no basta en Next 16.
- Notas internas de los entrenadores (`PlanSession.note`) solo en la vista de
  entrenador. El jugador ve `progressSummary`, nunca las notas.
- La vista de entrenador usa `?como=` para simular quién mira. En la versión
  real va en `/dashboard` con `requireTrainer()`, y "Mi programa" en `/cuenta`
  con `requirePlayer()`: nunca un id de jugador o entrenador desde la URL.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
