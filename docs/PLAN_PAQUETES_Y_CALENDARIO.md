# Plan: detalle en calendario + paquetes de clases (5/10 sesiones)

**Creado**: 2026-09-20 · Pensado por Claude (Cowork) a partir de dos capturas
de referencia de Daniel (app de gestión de academias) y del código real de
este repo. **Nada de esto está implementado todavía** — es la especificación
para que Claude Code lo construya aquí.

> Contexto para quien lo implemente: lee primero `CLAUDE.md` y
> `docs/DATABASE.md` si no los tienes ya cargados. Este plan asume ambos.

---

## 1. Detalle al hacer click en una clase del calendario

**Qué pasa hoy**: en `Reservas → Calendario`, hacer click en un bloque
ocupado (`SlotBlock` con `kind` pending/proposed/confirmed) llama a
`onReservationClick`, que en `ReservationsView.tsx` es `jumpToReservation`:
cambia a la vista Tabla y resalta la fila. No abre nada en sitio.

**Qué pide Daniel**: como en su referencia, que el click abra ahí mismo un
detalle (cliente, horario, precio) — no que salte de vista.

**Por qué es un cambio pequeño**: el diálogo que hace falta ya existe,
`EditReservationDialog` (`components/dashboard/reservations/EditReservationDialog.tsx`),
y ya lo usa la tabla. `ReservationsView` ya recibe el array completo
`reservations: TrainerReservation[]` como prop — no hace falta ninguna
llamada nueva a la API.

**Cambio**: en `components/dashboard/reservations/ReservationsView.tsx`,
sustituir (o complementar) `jumpToReservation` por abrir el diálogo
directamente:

```tsx
const [editingId, setEditingId] = useState<string | null>(null)
const editingReservation = editingId ? reservations.find((r) => r.id === editingId) ?? null : null

// en la vista calendario:
<ReservationsCalendar mode="view" onReservationClick={setEditingId} />
{editingReservation && (
  <EditReservationDialog reservation={editingReservation} onClose={() => setEditingId(null)} />
)}
```

No toca `ReservationsCalendar.tsx`, `EditReservationDialog.tsx` ni ninguna
ruta de API. Se mantiene "Ver en la tabla" como `title` del bloque si se
quiere, pero el click ahora abre el detalle en vez de saltar.

**Decisión abierta para Daniel**: ¿se quita del todo el salto a la tabla, o
se deja como acción secundaria (ej. un botón pequeño "Ver en la tabla"
dentro del propio diálogo)? Por defecto, quitarlo — es lo que muestra su
referencia.

---

## 2. Paquetes de clases (5 y 10 sesiones)

### 2.1 Decisiones ya tomadas con Daniel

- El descuento es **un % sobre el precio normal**, no un precio fijo aparte.
- Un paquete tiene **un entrenador fijo** para todas sus sesiones (no varía
  por sesión).

### 2.2 Hallazgo importante: el descuento ya existe en el código

`lib/reservations/pricing.ts` ya implementa exactamente la regla de
descuento por volumen que hace falta para paquetes:

```ts
export function discountPercentFor(sessionCount: number): number {
  if (sessionCount >= 10) return 15
  if (sessionCount >= 5) return 10
  return 0
}
```

`calculateBookingPrice(sessionCount)` devuelve precio por sesión, descuento,
precio por sesión ya descontado y total — sin redondeos sueltos (300 RM ×
10/15 % da descuentos enteros). **Los paquetes no necesitan lógica de precio
nueva**: un paquete de 5 usa `calculateBookingPrice(5)`, uno de 10 usa
`calculateBookingPrice(10)`. Se guarda el resultado como foto fija en el
momento de la venta (por si `PRICE_PER_SESSION_RM` o el % cambian más
adelante, el paquete ya vendido no se recalcula solo).

### 2.3 Por qué NO se toca `reservations`

Mirado `docs/DATABASE.md`, `migrations/003/004/005` y el flujo real
(`lib/reservations/*`, `app/api/dashboard/reservations/*`,
`app/api/dashboard/calendar/route.ts`): toda reserva vive siempre sobre un
`availability_slot_id` real, con fecha y hora ya puestas. Meter ahí
"sesiones de un paquete todavía sin fecha" significaría:

- añadir un estado nuevo a `reservations.status` (migración + tocar
  `lib/reservations/status.ts`, que usan también el calendario público, la
  confirmación y las propuestas de reprogramación — justo lo que
  `CLAUDE.md` pide no tocar sin permiso),
- que esas filas sin hueco aparecieran en `Reservas → Tabla/Calendario`
  mezcladas con reservas reales, rompiendo el supuesto de
  `listTrainerReservations` (`bySessionAsc`, los filtros de pestaña) de que
  toda reserva tiene (o tuvo) un hueco.

**Mejor opción — dos tablas nuevas, cero columnas nuevas en `reservations`.**
Una sesión de paquete solo se convierte en una fila real de `reservations`
en el momento en que se agenda, reutilizando tal cual
`loadOwnedOpenSlot`/`occupySlot` de `lib/reservations/slots.ts` — el mismo
mecanismo que ya usa la reserva manual (`lib/reservations/manual.ts`). Todo
lo que ya funciona (confirmación, calendario, cancelación, propuesta de
reprogramación) sigue funcionando exactamente igual sin saberlo: para esas
piezas, una reserva de un paquete es indistinguible de cualquier otra.

### 2.4 Esquema nuevo — `migrations/006_class_packages.sql`

```sql
-- 006 — Paquetes de clases (5 y 10 sesiones)
--
-- Dos tablas nuevas. `reservations` no cambia: una sesión de paquete se
-- convierte en una fila real de `reservations` solo al agendarla (mismo
-- camino que la reserva manual, lib/reservations/manual.ts), enlazada desde
-- package_sessions.reservation_id. El resto del flujo de reservas
-- (confirmación, calendario, cancelación, propuestas) no sabe que existen
-- los paquetes.
--
-- Precio: foto fija en el momento de la venta, con la MISMA regla que ya
-- usa el widget público (lib/reservations/pricing.ts, calculateBookingPrice).
--
-- Aplicar en Supabase → SQL Editor → Run. Idempotente.

create table if not exists public.client_packages (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers (id) on delete cascade,
  client_name text not null,
  client_email text not null,
  client_phone text,
  sessions_total smallint not null check (sessions_total in (5, 10)),
  price_per_session_normal numeric not null,
  discount_percent numeric not null default 0,
  price_per_session_discounted numeric not null,
  price_total numeric not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_packages_trainer_idx
  on public.client_packages (trainer_id, status);

alter table public.client_packages enable row level security;

create table if not exists public.package_sessions (
  id uuid primary key default gen_random_uuid(),
  client_package_id uuid not null references public.client_packages (id) on delete cascade,
  session_number smallint not null,
  reservation_id uuid references public.reservations (id) on delete set null,
  status text not null default 'not_scheduled' check (status in ('not_scheduled', 'scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_package_id, session_number)
);

create index if not exists package_sessions_package_idx
  on public.package_sessions (client_package_id);
create index if not exists package_sessions_reservation_idx
  on public.package_sessions (reservation_id);

alter table public.package_sessions enable row level security;

comment on table public.client_packages is
  'Paquete de 5 o 10 clases vendido a un cliente, con precio y % de descuento fijados en el momento de la venta. Un entrenador fijo por paquete (trainer_id).';
comment on table public.package_sessions is
  'Una fila por cada sesión del paquete. not_scheduled hasta que se agenda contra un hueco real (entonces reservation_id apunta a la fila de reservations creada, igual que una reserva manual).';
```

Como en las migraciones 002-005: solo `getSupabaseServerClient()` (service
role) lee/escribe estas tablas desde el dashboard, así que no hacen falta
políticas RLS adicionales — se deja igual que `trainer_weekly_hours` en la
005 (RLS activo, sin políticas propias).

### 2.5 Backend nuevo

Seguir el estilo de `lib/reservations/*.ts` (una responsabilidad por
archivo, todo con `getSupabaseServerClient()`, `trainer_id` siempre de la
sesión vía `requireTrainer()`).

**`lib/packages/pricing.ts`** — no reinventa nada, solo fija el tamaño
permitido:

```ts
import { calculateBookingPrice } from '@/lib/reservations/pricing'

export const PACKAGE_SIZES = [5, 10] as const
export type PackageSize = (typeof PACKAGE_SIZES)[number]

export function packagePriceQuote(size: PackageSize) {
  return calculateBookingPrice(size) // mismo descuento que el resto de la app
}
```

**`lib/packages/create.ts`** — `createClientPackage(trainerId, { client_name, client_email, client_phone?, sessions_total, notes? })`:
valida `sessions_total` en `PACKAGE_SIZES`, calcula el precio con
`packagePriceQuote`, inserta `client_packages`, y en la misma operación
inserta `sessions_total` filas en `package_sessions` (`session_number` 1..N,
`status: 'not_scheduled'`). Si algo falla a mitad, limpiar (o envolver en
una función de Postgres si se prefiere transacción real — para 5/10 filas
no es crítico).

**`lib/packages/queries.ts`** — `listTrainerPackages(trainerId)` y
`getPackageDetail(trainerId, packageId)`. El detalle trae
`package_sessions` con su `reservations ( id, status, price, availability_slots ( session_date, start_time, end_time ) )`
embebido (mismo patrón de embed que ya usa
`lib/reservations/queries.ts`), para pintar la tabla de sesiones sin N+1
queries.

**`lib/packages/schedule.ts`** — dos funciones que **reutilizan**
`loadOwnedOpenSlot` / `occupySlot` / `releaseSlot` de
`lib/reservations/slots.ts`, no las reimplementan:

- `schedulePackageSession(trainerId, packageSessionId, slotId, confirmed)`:
  comprueba que la sesión es `not_scheduled` y pertenece a un paquete del
  entrenador; `loadOwnedOpenSlot`; inserta en `reservations` igual que
  `createManualReservation` pero con `price = clientPackage.price_per_session_discounted`
  en vez de `calculateBookingPrice(1)`; `occupySlot`; actualiza
  `package_sessions` con `reservation_id` y `status: 'scheduled'`.
- `unschedulePackageSession(trainerId, packageSessionId)`: carga la reserva
  enlazada, la cancela (mismo efecto que
  `PATCH /api/dashboard/reservations/:id {action:'cancel'}` — `releaseSlot`
  + `status: 'cancelled'`), y pone `package_sessions.reservation_id = null`,
  `status: 'not_scheduled'` — el cliente recupera el crédito, no se pierde
  la sesión del paquete. (Ver 2.7 sobre esta decisión de negocio.)

**Rutas** (`app/api/dashboard/packages/...`, mismo patrón que
`app/api/dashboard/reservations/...`: `requireTrainer()` primero, nunca
`trainer_id` del cliente):

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/dashboard/packages` | `listTrainerPackages` |
| POST | `/api/dashboard/packages` | `createClientPackage` |
| GET | `/api/dashboard/packages/[id]` | `getPackageDetail` |
| PATCH | `/api/dashboard/packages/[id]/sessions/[sessionId]` | body `{action:'schedule', slot_id, confirmed?}` o `{action:'unschedule'}` |

### 2.6 Frontend nuevo

Mismo patrón que `Reservas` (`components/dashboard/reservations/*`):

- **Nav**: añadir a `components/dashboard/nav-items.ts`:
  `{ href: '/dashboard/paquetes', label: 'Paquetes', icon: 'package' }`
  (añadir el icono `package`/caja en `NavIcon.tsx`, mismo estilo SVG inline
  que los demás — nada de emojis, por `CLAUDE.md`).
- **`app/dashboard/(protected)/paquetes/page.tsx`**: como
  `reservas/page.tsx` — `getCurrentSession`, `listTrainerPackages`,
  `PageHeader` + botón "Vender paquete".
- **`components/dashboard/packages/PackagesTable.tsx`**: una fila por
  paquete — cliente, tamaño (5/10), sesiones agendadas/total, precio total,
  estado. Click en una fila abre el detalle.
- **`components/dashboard/packages/NewPackageDialog.tsx`**: reutiliza
  `ClientFields` (ya existe, `components/dashboard/reservations/ClientFields.tsx`)
  + selector 5/10 con el precio ya calculado en vivo (`packagePriceQuote`) —
  mismo `DialogShell` que el resto de diálogos del dashboard.
- **`components/dashboard/packages/PackageDetailDialog.tsx`**: la vista de
  la última captura de Daniel — cabecera con cliente/entrenador/tamaño/
  precio, y la tabla de sesiones (`#`, Fecha, Hora, Estado, acción). Una
  sesión `not_scheduled` muestra "Agendar" → abre
  `ReservationsCalendar mode="select"` (el mismo componente que ya usan
  `NewReservationDialog` y `EditReservationDialog`, cero componente nuevo
  de calendario) filtrado al entrenador dueño del paquete. Una sesión
  `scheduled` muestra fecha/hora reales y "Cambiar horario"/"Cancelar",
  igual que `EditReservationDialog`.

### 2.7 Confirmado con Daniel (20/09): el cliente recupera el crédito

Si el entrenador cancela una sesión ya agendada de un paquete, **no se da
por consumida**: `unschedulePackageSession` (2.5) cancela la reserva y deja
la sesión otra vez en `not_scheduled`, lista para agendarse a un hueco
nuevo sin gastar otra sesión del paquete. Esto ya es lo que hace el plan
por defecto — sin cambios de diseño, solo queda confirmado.

---

## 3. Orden sugerido para Claude Code

1. Migración `006_class_packages.sql` (aplicar en Supabase → SQL Editor,
   igual que las anteriores — Daniel la aplica a mano, como siempre).
2. `lib/packages/*` (pricing, create, queries, schedule) + rutas API.
   `npm run type-check` limpio antes de tocar UI.
3. UI: nav, página `/dashboard/paquetes`, tabla, diálogo de venta, diálogo
   de detalle con agendado de sesiones.
4. Cambio en `ReservationsView.tsx` (sección 1) — independiente, se puede
   hacer en cualquier momento, no depende de lo anterior.
5. Verificar en el navegador real (este entorno de Claude sigue sin poder
   levantar `npm run dev`): vender un paquete de 5, agendar 2 sesiones,
   cancelar una y comprobar que vuelve a "Agendar" sin perder el crédito,
   y que el click en el calendario de Reservas abre el detalle en sitio.

**No depende de la Fase D** (horario semanal) ni la bloquea — son capas
distintas. Sigue pendiente, por separado, confirmar que "Guardar cambios"
en Horario semanal ya no da `duplicate key` (ver `docs/estado-desarrollo.md`
del repo, prompt 13).

---

## 4. Actualización (20/09, tarde): Paquetes se integra en Reservas, no aparte

Claude Code implementó primero la sección 2 tal cual estaba escrita: ruta
propia `/dashboard/paquetes` + entrada de nav "Paquetes". Daniel la vio y
pidió que viviera **dentro de la página de Reservas**, no como su propia
sección de la barra de navegación.

Buena noticia: los componentes que ya existen
(`components/dashboard/packages/PackagesTable.tsx`, `NewPackageDialog.tsx`,
`PackageDetailDialog.tsx`, `NewPackageButton.tsx`) **no dependen de la ruta**
— se pueden mover tal cual, sin tocar su interior. El cambio es solo de
dónde se cargan los datos y dónde se pintan.

**Qué hay que cambiar:**

1. **Quitar** la entrada `{ href: '/dashboard/paquetes', label: 'Paquetes', icon: 'package' }`
   de `components/dashboard/nav-items.ts` y borrar
   `app/dashboard/(protected)/paquetes/page.tsx`.
2. **`app/dashboard/(protected)/reservas/page.tsx`**: además de
   `listTrainerReservations`, cargar también `listTrainerPackages(trainer.id)`
   (con el mismo `try/catch` que ya tiene `paquetes/page.tsx` por si la
   migración 006 no está aplicada todavía) y pasar `packages` como prop
   nueva a `ReservationsView`.
3. **`components/dashboard/reservations/ReservationsView.tsx`**: el tipo
   `View` pasa de `'table' | 'calendar'` a `'table' | 'calendar' | 'packages'`;
   se añade un tercer botón "Paquetes" al switcher que ya tiene
   Tabla/Calendario. Cuando `view === 'packages'`, se pinta
   `<PackagesTable packages={packages} />` (con el mismo estado vacío que
   tenía `paquetes/page.tsx`: "Todavía no has vendido ningún paquete").
4. **Botón de acción contextual**: hoy "Nueva reserva" vive en el
   `PageHeader` del server component (`reservas/page.tsx`, prop `actions`).
   Para que el botón cambie según la pestaña (Nueva reserva / Vender
   paquete), hay que moverlo dentro de `ReservationsView` (que ya es
   cliente) junto al switcher, y quitar `actions` del `PageHeader` en
   `reservas/page.tsx`.

No hace falta tocar `lib/packages/*` ni las rutas `app/api/dashboard/packages/*`
— toda esa capa ya funciona igual, solo cambia quién la consume y desde
dónde.

**Verificado (20/09, noche)**: las tres pestañas conviven, el botón de
acción cambia con la pestaña, y el flujo completo de paquetes (vender,
agendar con/sin pista, cancelar y recuperar crédito) funciona en el
navegador real. Lo que parecía un fallo (no aparecía nada nuevo) era el
servidor de desarrollo sirviendo una versión en caché — un reinicio de
`npm run dev` lo resolvió, no hubo ninguna regresión de código.

---

## 5. Actualización (20/09, noche): el Calendario se muda a Resumen

Reservas se queda con dos pestañas, no tres: **Tabla** (clases privadas) y
**Paquetes**. El Calendario (semana/día, `ReservationsCalendar mode="view"`)
pasa a vivir en `/dashboard` (Resumen), no en Reservas.

**Cambios:**

1. **`components/dashboard/reservations/ReservationsView.tsx`**: quitar
   `'calendar'` de `View` (queda `'table' | 'packages'`), quitar esa entrada
   de `VIEWS` y todo el bloque `if (view === 'calendar') { ... }` —
   incluido el estado `editingId`/`editingReservation` y el uso de
   `EditReservationDialog` y `ReservationsCalendar` que solo servían para esa
   rama (si no los usa ya nada más en el archivo, se quitan también esos
   imports).

2. **Nuevo componente `components/dashboard/home/HomeCalendarSection.tsx`**
   (client): es exactamente esa misma rama que se quita de
   `ReservationsView`, movida aquí tal cual — estado `editingId`, `
   <ReservationsCalendar mode="view" onReservationClick={setEditingId} />`,
   y `<EditReservationDialog reservation={...} onClose={...} />` cuando hay
   una reserva seleccionada (buscándola en el array `reservations` que
   recibe por prop, igual que hacía `ReservationsView`). Sin lógica nueva,
   solo cambia de sitio.

3. **`app/dashboard/(protected)/page.tsx`** (Resumen): hoy no carga ninguna
   reserva. Añadir `listTrainerReservations(trainer.id)` (mismo import que
   ya usa `reservas/page.tsx`) y renderizar `<HomeCalendarSection
   reservations={reservations} />` **antes que** la rejilla de tarjetas de
   cifras (`StatCard` × 3), no después — es lo que a Daniel le importa ver
   primero; las cifras (todavía en `null`) quedan debajo. Añadir también
   `export const dynamic = 'force-dynamic'` (hoy no lo tiene; con el
   calendario real hace falta, mismo motivo que en `reservas/page.tsx`).
   - El bloque "Todavía sin datos" de más abajo habla de las cifras (que
     siguen en `null`, eso no cambia en este paso) — puede quedarse tal cual
     o ajustar el texto para no sonar contradictorio ahora que sí hay
     contenido real (el calendario) en la página. A criterio de quien lo
     implemente.

No toca `lib/reservations/*`, ninguna ruta de API, ni `NewReservationDialog`/
`EditReservationDialog`/`PackageDetailDialog` (siguen usando
`ReservationsCalendar mode="select"` para elegir hueco, eso no se mueve ni
cambia).
