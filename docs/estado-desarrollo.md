# Estado de desarrollo — Dashboard del Entrenador

Creado: 19/09/2026 · Estado: **Fases A, B, C y C+ hechas y verificadas; migraciones 002–004 aplicadas. Fase D implementada (20/09), pendiente de verificación en el navegador.**

## Decisión de alcance

Lo que se construye ahora es el **dashboard privado de cada entrenador**
(Mauricio ve y gestiona solo sus reservas, su disponibilidad y su perfil).
Vive en `/dashboard`. `/admin` queda reservado para el futuro panel
cross-tenant de Daniel; el `app/admin/login` actual es un `TODO` sin auth y no
se toca en esta fase.

Auth decidida el 19/09: **magic link (email) + Google OAuth** desde el
principio. Apple se deja para más adelante.

Vínculo entrenador ↔ usuario: `trainers.auth_user_id` (uuid, unique, FK a
`auth.users`). Un usuario sin vínculo entra pero ve "Tu cuenta no está
vinculada a ningún perfil de entrenador todavía". La vinculación inicial la hace
Daniel a mano en Supabase hasta que exista un flujo de invitación.

## Fases

| Fase | Qué | Estado |
|---|---|---|
| **A** | Auth + vínculo trainer↔usuario, proxy de `/dashboard/**`, pantalla "no vinculada", auditoría multi-tenant y cierre de sus huecos | **hecha** (19/09) |
| **B** | Shell del dashboard: layout + nav (Resumen / Reservas / Disponibilidad / Perfil) | **hecha** (19/09) |
| **C** | Reservas: confirmación manual (pista física), listado, `price` en el servidor, stub de notificaciones | **hecha** (19/09) |
| **C+** | Calendario semanal, propuesta de nueva fecha con enlace público, edición total, reserva manual | **hecha y verificada** (20/09) |
| D | Disponibilidad: CRUD de `availability_slots` respetando `class_type` real (`private`) y `lib/availability/slot-status.ts` | **implementada** (20/09), sin verificar en el navegador |
| E | Perfil: foto, colores de tema, precios base | — |
| F | Resumen/stats: reservas de hoy, próximas, ingresos estimados | — |

---

## Fase A — qué se ha hecho (19/09/2026)

### 1. Esquema real de `trainers`

Inspeccionado con la service role key vía el OpenAPI de PostgREST
(`node scripts/inspect-schema.mjs trainers`). Documentado en
[`DATABASE.md`](DATABASE.md#trainers). Lo relevante:

- Tiene `user_id` → **`public.users`** (tabla propia, vacía). No es `auth.users`.
  Se deja tal cual y se añade `auth_user_id` aparte.
- **No** tiene `price` ni `auth_user_id`.
- RLS activo, la anon key no ve filas.
- 2 filas: `daniel-ruiz` y `mauri`. 0 usuarios en Supabase Auth.

### 2. Migración `migrations/002_trainers_auth_user_id.sql`

`auth_user_id uuid unique references auth.users(id) on delete set null` +
política `trainers_select_own` (un usuario autenticado lee su propia fila).
Incluye el `UPDATE` para vincular a mano.

**Aplicada el 19/09** desde el SQL Editor (no hay RPC `exec_sql`). Verificada
con `node scripts/inspect-schema.mjs trainers`: la columna existe con su
`COMMENT`. `mauri` ya tiene `auth_user_id` (cuenta de Daniel).

### 3. Supabase Auth

Comprobado en `/auth/v1/settings`:

- **Email: activo** (`external.email = true`, `disable_signup = false`). El magic
  link funciona sin tocar nada.
- **Google: desactivado** (`external.google = false`). Código listo; falta la
  configuración manual (abajo).

### 4. `/dashboard/login`

`app/dashboard/(public)/login/page.tsx` + `components/dashboard/LoginForm.tsx`.
Enlace mágico por email y "Continuar con Google". Errores de Supabase (enlace
caducado, proveedor no activo) vuelven al login con el mensaje visible.

### 5. Protección de `/dashboard/**`

- `proxy.ts` (en Next 16 es el nombre de `middleware.ts`): refresca la sesión,
  sin sesión → `/dashboard/login?next=…`, con sesión en `/login` → `/dashboard`.
  Públicos: `/dashboard/login` y `/dashboard/auth/*`.
- `app/dashboard/(protected)/layout.tsx`: con sesión pero sin trainer vinculado
  renderiza `components/dashboard/NotLinked.tsx`. (El proxy no puede pintar
  HTML; por eso esa parte vive en el layout.)
- `app/dashboard/(public)/auth/callback/route.ts`: destino del enlace mágico y
  de Google. Acepta `?code=` (PKCE) y `?token_hash=&type=`. Solo redirige a
  rutas internas (`next` tiene que empezar por `/dashboard`).
- `app/dashboard/(public)/auth/signout/route.ts`: POST desde un `<form>`.
- `lib/auth/current-trainer.ts`: `getCurrentSession()` y `requireTrainer()`.
  **Es la única forma legítima de saber el `trainer_id` en el dashboard.**

Clientes de Supabase nuevos: `lib/supabase/server.ts` (sesión por cookies,
anon key) y `lib/supabase/browser.ts`. `@supabase/ssr` subido de 0.1.0 a 0.12.7.

Verificado en el navegador: redirección con `next`, login, errores del
callback, sesión real (usuario de prueba, ya borrado) → pantalla "no vinculada",
cierre de sesión. **No verificado aún**: el camino "vinculado" → portada del
dashboard, porque requiere la migración 002.

### 6. Auditoría multi-tenant de `/api/*`

Ningún endpoint actual valida `trainer_id` contra una sesión, porque hoy no
hay sesiones. Clasificación:

**Públicos por diseño (los usa la web de reserva; el `trainer_id` del cliente
es legítimo ahí):**

| Ruta | Veredicto |
|---|---|
| `GET /api/availability` | OK como público. Solo devuelve huecos abiertos, sin datos personales. **No reutilizar desde el dashboard**: el dashboard necesita también los huecos llenos, y debe derivar el trainer de la sesión |
| `POST /api/reservations` | OK como público (es la reserva del cliente). Pendiente: mover el cálculo de `price` al servidor (Fase C) |

**Huecos cerrados el 19/09/2026 (mismo día, tras vincular la primera cuenta
real):**

| Ruta | Qué se hizo | Por qué |
|---|---|---|
| `PUT /api/trainers/[id]` | **Protegida.** `requireTrainer()` + el `id` del path tiene que ser el de la sesión (401 sin sesión, 403 si es otro). Lista blanca: `name`, `email`, `phone`, `bio`, `image_url`, `specializations`. Cualquier otro campo (`auth_user_id`, `slug`, `status`, `rating`…) → 400 con el nombre del campo, no se ignora en silencio | Era `update(body)` sin auth: con `auth_user_id` en la tabla, cualquiera podía secuestrar el dashboard de un entrenador. `auth_user_id` solo se toca a mano por SQL |
| `GET /api/trainers/[id]` | **Protegida** igual. Devuelve el perfil propio sin `user_id` ni `auth_user_id` | Lo usará la Fase E (perfil) |
| `DELETE /api/trainers/[id]` | **Borrada** (405) | Nadie la usaba; borrar un entrenador no es una función del dashboard |
| `GET /api/reservas` | **Borrada** | Devolvía todas las reservas de todos los entrenadores con datos de contacto de clientes. Único consumidor: el hook `lib/utils/use-reservations.ts`, que no usaba nadie (borrado también). La landing no la necesita: la reserva pública va por `POST /api/reservations` |
| `POST /api/reservas` | **Borrada** | Insertaba `client_id`, `date`, `start_time`: columnas inexistentes. Siempre 500 |
| `GET/POST /api/clientes` | **Borrada** | La tabla `clients` no existe. Siempre 500 |
| `GET /api/disponibilidad` | **Borrada** | Duplicado obsoleto de `GET /api/availability` sin filtrar por estado. Único consumidor: `components/widgets/ReservationWidget.tsx`, sin uso (borrado también) |
| `GET /api/trainers` | **Borrada** | Duplicado de `/api/coaches` sin consumidores |
| `POST /api/trainers` | **Borrada** | Creaba entrenadores sin auth; sin consumidores |
| `GET/POST /api/trainers/[id]/rates` | **Borrada** | `trainer_rates` no existe. Siempre 500 |
| `POST /api/dev/seed` | **Borrada** | Escribía en `trainers` y en `clients` (inexistente) sin auth |
| `POST /api/admin/setup-mauri` | **404 en producción** (`NODE_ENV === 'production'`) | Sigue siendo la forma cómoda de dar de alta a Mauri en local (`docs/SETUP_TRAINER.md`). Sin auth, así que en producción no existe |

**Queda público, a propósito:**

| Ruta | Por qué | Qué devuelve |
|---|---|---|
| `GET /api/availability` | El calendario de la landing lo necesita sin sesión | Solo huecos abiertos; sin datos personales |
| `POST /api/reservations` | Es la reserva del cliente anónimo | Ids de reserva |
| `GET /api/coaches` | Lo usa `/trainers` (listado público) | **Recortada** a `id, slug, name, bio, image_url, specializations, rating, total_reviews`. Antes era `select *` (email, teléfono, `user_id`). `app/trainers/page.tsx` ya no pinta email/teléfono |

Tras esto `app/api/` queda en: `admin/setup-mauri`, `availability`, `coaches`,
`reservations`, `trainers/[id]`.

Código muerto que **no** se ha tocado por no ser un endpoint:
`lib/services/trainers.service.ts` (consulta `trainer_rates`, que no existe) —
nadie lo importa. Candidato a borrar en la Fase B.

**Regla desde ahora** (también en `CLAUDE.md`): toda ruta que use el dashboard
obtiene el entrenador con `requireTrainer()` y filtra por `trainer.id`. Nunca
lee `trainer_id` del body ni de la query.

### Verificación del cierre (19/09/2026)

Con `curl`, un usuario de prueba vinculado temporalmente a `daniel-ruiz` (deshecho
y borrado después):

- rutas borradas → 404; `DELETE /api/trainers/[id]` → 405
- `GET`/`PUT /api/trainers/[id]` sin sesión → 401
- con sesión, sobre el id de otro → 403; sobre el propio con `auth_user_id` o
  `slug` en el body → 400 "Campos no editables"; con `bio` → 200
- `/api/coaches` sin `email`/`phone`; `/mauri`, `/trainers`, `/web` y
  `/api/availability` siguen en 200
- `npm run type-check`: 20 errores, los preexistentes

### Hydration mismatch en `/dashboard`

El atributo `his.skin.checked="1"` no existe en el código (grep vacío) y el
navegador integrado (sin extensiones) no muestra ningún aviso de hidratación:
lo inyecta una extensión de Chrome en `<body>`. Se ha añadido
`suppressHydrationWarning` al `<body>` de `app/layout.tsx`, que silencia solo
los atributos de ese nodo (no los de sus hijos), para que no ensucie la consola.

---

## Pendiente de la Fase A (manual, Daniel)

Hecho el 19/09: migración 002 aplicada (verificado con
`node scripts/inspect-schema.mjs trainers`) y `mauri` vinculado a la cuenta
real de Daniel.

1. **Redirect URLs**: Supabase → Authentication → URL Configuration →
   *Redirect URLs* → `http://localhost:3001/dashboard/auth/callback`
   (y la de producción cuando exista). Sin esto Supabase ignora el `redirectTo`.
2. **Google OAuth**:
   - Google Cloud Console → APIs & Services → Credentials → *OAuth client ID*
     (Web application). En **Authorized redirect URIs** registrar exactamente:
     `https://vkriseshpcjvgsnwzqcs.supabase.co/auth/v1/callback`
   - Copiar *Client ID* y *Client secret* en Supabase → Authentication →
     Providers → Google → Enable.
3. Entrar en `/dashboard` con la cuenta vinculada y comprobar "Hola, Mauricio Martin"
   (único camino de la Fase A no verificado desde código).

Opcional: el enlace mágico con la plantilla por defecto (PKCE) solo funciona si
se abre en el **mismo navegador** que lo pidió. Para que valga desde cualquier
sitio, cambiar la plantilla *Magic Link* en Supabase → Authentication → Email
Templates a
`{{ .SiteURL }}/dashboard/auth/callback?token_hash={{ .TokenHash }}&type=magiclink`
(el callback ya acepta ese formato).

## Fase B — shell del dashboard (19/09/2026)

### Estructura

```
app/dashboard/(protected)/layout.tsx      sesión → NotLinked o DashboardShell
  └─ components/dashboard/DashboardShell  cabecera fija + <main> + barra inferior móvil
       ├─ DashboardNav variant="top"      pestañas en la cabecera (md+)
       ├─ SignOutButton                   en la cabecera, icono + texto (texto oculto en móvil)
       └─ DashboardNav variant="bottom"   barra fija inferior con icono + etiqueta (< md)
```

- Secciones y orden en un único sitio: `components/dashboard/nav-items.ts`
  (`DASHBOARD_NAV`, `isNavItemActive`). `/dashboard` solo es activo en exacto;
  el resto también en subrutas.
- Activa: estado "seleccionado" del sistema de diseño
  (`bg-blue-600 text-white shadow-sm shadow-blue-600/25`) arriba; `text-blue-600`
  + fondo `bg-blue-50` en el icono abajo. `aria-current="page"` en ambas.
- Iconos: `components/dashboard/NavIcon.tsx`, SVG inline (nada de lucide ni emojis).
- Piezas reutilizables: `PageHeader` (eyebrow + h1 + descripción + acciones),
  `ComingSoon` (placeholder con fase), `StatCard` (cifra del Resumen; `value: null`
  pinta un guion en gris).
- `metadata.title` con plantilla `%s · Panel del entrenador` y `robots: noindex`
  en el layout; cada página solo pone su título.

### Rutas

| Ruta | Estado |
|---|---|
| `/dashboard` | Resumen: saludo por nombre de pila + 3 `StatCard` (Reservas de hoy, Próximas, Ingresos estimados) con valor `null` hasta la Fase F + aviso "Todavía sin datos" |
| `/dashboard/reservas` | `ComingSoon` (Fase C) |
| `/dashboard/disponibilidad` | `ComingSoon` (Fase D) |
| `/dashboard/perfil` | `ComingSoon` (Fase E) |

### Limpieza

`lib/services/trainers.service.ts` **borrado**. Confirmado antes: nadie lo
importaba por ruta, y sus `getAllTrainers`/`getTrainerById` son homónimas de
las de `trainers-data.service.ts` (que define las suyas), no re-exportadas.
También consultaba `trainer_rates`, que no existe.

### Verificación (19/09/2026)

Sesión de prueba vinculada temporalmente a `daniel-ruiz` (deshecha y borrada):

- desktop: cabecera con pestañas, activa resaltada, navegación entre las 4
  secciones, `document.title` por página, "Cerrar sesión" en la cabecera
- móvil (375×812): nav superior oculta, barra inferior visible, sin scroll
  horizontal (`scrollWidth === innerWidth`), toque en "Perfil" navega y marca activa
- `npm run type-check`: 20 errores, los preexistentes; sin `shadow-*` raros,
  `border-l-4` ni emojis en `components/dashboard` y `app/dashboard`

## Fase C — confirmación manual de reservas (19/09/2026)

### Negocio

El entrenador no puede confirmar una clase automáticamente: antes tiene que
reservar la pista física. Si no la consigue, el cliente reprograma.

### Lo que había en la base (inspeccionado con la service role key)

- `reservations.status`: en uso `pending` y `confirmed`; default de columna
  `confirmed` (el POST insertaba `pending` a mano); **sin `CHECK`**.
- `availability_slots.status`: en uso `available` y `full`; **sin `CHECK`**.
- `email_logs` (`reservation_id`, `recipient_email`, `subject`, `status`,
  `error_message`) y `whatsapp_logs` (`reservation_id`, `phone_number`,
  `message`, `status`, `error_message`): vacías, y encajan para el stub.
- Los huecos de prueba de `daniel-ruiz` son bloques 09:00–20:00; los de Mauri,
  de una hora. Es dato, no bug.

### Modelo de estados — `migrations/003_reservation_confirmation_flow.sql`

| `reservations.status` | Significado | `availability_slots.status` |
|---|---|---|
| `pending_confirmation` | nueva desde el booking público; sin pista aún (**default nuevo**) | `pending` — no se ofrece |
| `confirmed` | el entrenador consiguió pista | `full` |
| `needs_reschedule` | no consiguió pista; el cliente reprograma | `available` — se vuelve a ofrecer |
| `cancelled`, `completed` | reservados para más adelante | — |

La migración: nuevo default, convierte los `pending` antiguos a
`pending_confirmation` (y sus huecos a `pending`), y añade los dos `CHECK`.
**Pendiente de aplicar** (SQL Editor). El código funciona sin ella —no había
checks— pero hasta entonces el modelo no lo garantiza la base. El dashboard
trata el `pending` antiguo como "requiere confirmación" mientras tanto.

Constantes y etiquetas: `lib/reservations/status.ts`.

### Regla de disponibilidad (`lib/availability/slot-status.ts`)

- `pending` está **explícitamente** en `CLOSED_STATUSES`; no se apoya en el
  fallback permisivo para desconocidos.
- `reservationHoldsSlot()`: una `needs_reschedule` ya **no** ocupa el hueco
  (igual que una cancelada). Sin esto, `GET /api/availability` seguiría
  ocultando el hueco liberado al cruzar con `reservations`.

### `POST /api/reservations` (sigue siendo público)

- Nace en `pending_confirmation`; el hueco pasa a `pending`
  (`current_bookings + 1`).
- **`price` se calcula y persiste en el servidor**: `lib/reservations/pricing.ts`
  (300 RM/sesión, 10 % desde 5, 15 % desde 10; la misma regla del widget).
  Cada fila guarda el precio de su sesión ya con descuento (300 / 270 / 255):
  la suma de filas es exactamente el total, sin restos de redondeo. Verificado
  contra la fórmula del cliente para 1, 4, 5, 9, 10 y 12 sesiones.
- Respuesta: `message` "Solicitud recibida. Te confirmamos por email en cuanto
  reservemos la pista.", más `status`, `total` y `discountPercent`.
- Widget (`components/booking/BookingStep2_ContactForm.tsx`): el bloque de éxito
  ya no dice "¡Reserva confirmada!", dice "Solicitud recibida" y explica que se
  confirma por email o se avisa para elegir otra hora. Solo se tocó el texto.

### Dashboard → Reservas

- `app/dashboard/(protected)/reservas/page.tsx` (`force-dynamic`): lista las
  reservas del entrenador de la sesión (`lib/reservations/queries.ts`,
  `trainer_id` de la sesión, embed de `availability_slots` por la FK).
- Secciones: **Requieren tu confirmación** (destacada, con botones) ·
  Confirmadas · Sin pista, pendientes de reprogramar · Otras.
- `components/dashboard/reservations/ReservationCard.tsx` (fecha/hora, cliente,
  email y teléfono clicables, WhatsApp si lo marcó, precio, badge) y
  `ReservationActions.tsx` ("Confirmar clase" / "No he conseguido pista";
  `router.refresh()` al terminar).
- `PATCH /api/dashboard/reservations/[id]` con `{ action: 'confirm' | 'needs_reschedule' }`:
  `requireTrainer()` → 401 sin sesión, 403 si la reserva es de otro, 404 si no
  existe, 400 acción inválida, 409 si ya no está pendiente. La transición vive en
  `lib/reservations/confirmation.ts` (`applyReservationDecision`): el `UPDATE`
  filtra por estado pendiente, así dos clics seguidos no deciden dos veces.

### Notificaciones (stub) — `lib/notifications/notify.ts`

`notifyReservationConfirmed()` y `notifyReservationNeedsReschedule()`. No hay
proveedor: escriben en `email_logs` (y en `whatsapp_logs` si el cliente marcó
WhatsApp) con `status = 'skipped'` y el motivo en `error_message`, más un
`console.log`. Nunca lanzan. `// TODO(fase final): integrar Resend`.

### Verificación (19/09/2026)

Con reservas de prueba sobre `daniel-ruiz` y una sesión temporal (todo deshecho:
reservas, logs, huecos a `available`/0, vínculo y usuario borrados):

- flujo público: `pending_confirmation`, `price = 300`, hueco `pending`, el
  calendario deja de ofrecerlo, segundo intento sobre el mismo hueco → 409
- decisión: 401 sin sesión · 403 sobre una reserva de Mauri (intacta) · 404 id
  inexistente · 400 acción inválida · confirmar → `confirmed` + hueco `full` ·
  repetir → 409 · sin pista → `needs_reschedule` + hueco `available`/0 y el
  calendario lo vuelve a ofrecer · el hueco liberado se reserva otra vez por el
  flujo público
- `email_logs`: una fila `skipped` por decisión; `whatsapp_logs` solo con opt-in
- navegador: la página agrupa bien; "Confirmar clase" mueve la reserva a
  "Confirmadas" sin errores de consola; móvil 375 px sin scroll horizontal
- `npm run type-check`: 20 (preexistentes); sin sombras raras ni emojis

### Verificación desde la UI y rediseño de Reservas (19/09/2026, prompt 5)

**Parte 1 — botones desde la interfaz.** Con 3 pendientes de prueba en
`daniel-ruiz`: "Confirmar clase" (Carla) y "No he conseguido pista" (Bruno)
pulsados en el navegador; la página se reordena sin errores de consola y la
base queda `confirmed` + hueco `full`/1 y `needs_reschedule` + hueco
`available`/0; `GET /api/availability` vuelve a ofrecer solo el hueco liberado.

**Parte 2 — capa visual** (sin tocar endpoints ni transiciones):

- `components/dashboard/reservations/ReservationsTable.tsx` (cliente):
  pestañas **Pendientes / Confirmadas / Canceladas** con el número entre
  paréntesis y subrayado azul en la activa (`role="tablist"`, `aria-selected`);
  buscador por nombre de cliente, sin distinguir tildes ni mayúsculas
  (`normalizeForSearch`); tabla en `lg+` con Cliente · Contacto · Fecha · Hora
  · Duración · Precio · Estado · Acciones; por debajo de `lg` (móvil y tablet)
  tarjetas apiladas (`ReservationMobileCard.tsx`) con la misma información.
- A qué pestaña va cada estado: `reservationTab()` en
  `lib/reservations/format.ts` — `pending` (y el `pending` antiguo) →
  Pendientes; `confirmed`/`completed` → Confirmadas; `needs_reschedule`,
  `cancelled` y cualquier otro → Canceladas.
- `StatusBadge.tsx`: pendiente ámbar, confirmada verde, cancelada/sin pista
  gris; etiqueta corta en la tabla y la larga en `title`.
- Acciones solo en la pestaña Pendientes; en la tabla van apiladas
  (`ReservationActions size="sm" stacked`) para que la fila no desborde a
  1280 px. Etiqueta del segundo botón: "No conseguí pista".
- Helpers de formato: `formatDayShort` ("Mié 30 sept"), `formatTime`,
  `formatDuration` ("11 h", "1 h 30 min"). `lib/dateUtils.ts` sin tocar.
- Borrado `ReservationCard.tsx` (sustituido) y el `groupReservations` de
  `queries.ts` (ya no se usa). No se implementan Columns/Filters/Export.

Verificado: desktop 1280 (tabla sin desbordar: `scrollWidth === clientWidth`,
buscador "mendez" → Carla Méndez, confirmar y sin pista desde la fila, contadores
de pestañas actualizados, Confirmadas/Canceladas sin botones y con badge verde
/gris) y móvil 375 (tarjetas, tabla `display: none`, sin scroll horizontal, las
tres pestañas caben, confirmar desde la tarjeta → estado vacío "Nada
pendiente"). Datos de prueba deshechos (`teardown`: reservas, logs, huecos,
vínculo, usuario). `type-check` 20 (preexistentes).

Nota: durante esta sesión la reserva real de Daniel del 25/09 (dashboard de
Mauri) pasó a `needs_reschedule` desde la cuenta real, con su fila en
`email_logs`. No es dato de prueba y no se ha tocado.

## Fase C+ — calendario, propuesta, edición y reserva manual (20/09/2026)

### Lo que había en la base (verificado antes de tocar nada)

- `availability_slots.status`: 168 filas, todas `available` (el hueco del 25/09
  se liberó con la decisión de Daniel). Sin `CHECK`.
- `reservations.status`: `confirmed` ×2 (anteriores a la Fase C, **sobre huecos
  que siguen en `available`/0**: inconsistencia heredada), `needs_reschedule`,
  `pending_confirmation`. Sin `CHECK`; la 003 sigue sin aplicar (default
  `confirmed`).
- Relación: `reservations.availability_slot_id` → FK; una reserva por hueco;
  el embed inverso `availability_slots → reservations(...)` funciona.

Consecuencia de diseño: el calendario deduce "reservada" de la **reserva que
ocupa el hueco** (`reservationHoldsSlot`), nunca de `slot.status`.

### Parte 1 — Calendario (`/dashboard/reservas`, vista "Calendario")

- `components/dashboard/reservations/ReservationsView.tsx`: selector Tabla /
  Calendario junto a las pestañas. La tabla no se toca.
- `ReservationsCalendar.tsx`: semana (columnas = días, filas = horas, 48 px/h,
  rejilla 08–21 ampliable) o día; anterior/siguiente/hoy; selector Día/Semana
  (en < 640 px arranca en Día). Datos de `GET /api/dashboard/calendar?start&end`
  (`requireTrainer()`, máx. 62 días), que devuelve cada hueco con su `kind`:
  `pending` (ámbar), `proposed` (ámbar punteado), `confirmed` (azul de marca),
  `available` (punteado azul claro, "Libre"), `closed` (gris, hueco cerrado sin
  reserva). **"Sin abrir"** = no hay hueco: fondo rayado de la columna.
- Clic en una reserva → vuelve a la tabla, pestaña correcta, scroll y resalte
  3 s (`focus` en `ReservationsTable`, `data-reservation-id` en fila y tarjeta).
- Modo `select` (reutilizado por las Partes 2–4): solo los huecos libres son
  botones; el elegido se pinta azul "Elegido".
- Tipos en `lib/reservations/calendar.ts`.

### Parte 2 — Proponer otra fecha (`migrations/004_reschedule_proposals.sql`)

- Migración 004: `rescheduled_from_id uuid → reservations(id)`,
  `proposal_token text` (índice único parcial), `CHECK` con
  `reschedule_proposed`; documenta `cancelled` (cancelación directa) frente a
  `needs_reschedule` (sin pista). Requiere la 003 antes. **Aplicadas ambas el
  20/09** (verificado con `inspect-schema`: default `pending_confirmation`,
  columnas nuevas con sus comentarios).
- Botón "Proponer otra fecha" (`ReservationActions`) → `ProposeRescheduleDialog`
  con el calendario en modo selector → `POST /api/dashboard/reservations/[id]/propose { slot_id }`.
- `lib/reservations/proposal.ts`:
  - `proposeReschedule`: original (`pending_confirmation`) → `needs_reschedule`
    y hueco liberado; nueva reserva `reschedule_proposed` sobre el hueco elegido
    (`pending`), `rescheduled_from_id`, `proposal_token` (24 bytes aleatorios,
    base64url). Notifica (stub) con el enlace en el asunto.
  - `getProposalByToken` / `respondToProposal`: aceptar → `pending_confirmation`
    (el hueco sigue `pending`); elegir otra → `needs_reschedule` y hueco
    liberado. El token se pone a NULL en la misma actualización: **un solo uso**.
- Página pública `app/propuesta/[token]/page.tsx` (sin login, `noindex`):
  fecha/hora/duración/precio y `ProposalResponse` (Aceptar / Prefiero elegir
  otra → `POST /api/propuesta/[token]`). Token inválido o usado → "Este enlace
  ya no es válido".
- Dashboard: una `reschedule_proposed` va en Pendientes con badge "Propuesta
  enviada" y, en vez de botones, `ProposalLink` (Copiar enlace + abrir).
- Sin la 004, el botón responde con un error claro ("Falta aplicar
  migrations/004…") y no cambia nada. `listTrainerReservations` reintenta sin
  las columnas nuevas si la base devuelve 42703, así la página sigue viva.

### Parte 3 — Editar cualquier reserva

- "Editar" en todas las filas y tarjetas, en las tres pestañas
  (`ReservationRowActions` → `EditReservationDialog`, montado en un portal
  para no heredar el `text-right` de la celda).
- Panel: nombre, email, teléfono, notas (`ClientFields`), precio (override
  manual; vacío = sin precio), "Cambiar horario" (calendario selector inline),
  y botones Confirmar clase (solo pendientes) y Cancelar reserva (todas menos
  ya canceladas, con confirmación).
- `PUT /api/dashboard/reservations/[id]` `{ client_*, notes, price, slot_id? }`
  → `lib/reservations/edit.ts`: `parseDetails` (validación), `updateReservationDetails`,
  `moveReservation` (libera el hueco viejo, marca el nuevo `pending` si está
  pendiente/propuesta o `full` si confirmada; una `needs_reschedule`/`cancelled`
  movida se reactiva como `pending_confirmation`). Notifica "Tu clase pasa al…".
- `PATCH { action: 'cancel' }` → `cancelReservation`: `cancelled`, libera el
  hueco si lo ocupaba, anula `proposal_token` si era propuesta. Notifica.
- Pestaña Canceladas: badge **Cancelada** (gris) frente a **Sin pista** (gris)
  vía `StatusBadge.shortLabel`.
- Helpers compartidos en `lib/reservations/slots.ts`: `loadOwnedOpenSlot`
  (del entrenador + abierto + sin reserva viva), `occupySlot`, `releaseSlot`,
  `slotStatusFor`.

### Parte 4 — Nueva reserva manual

- Botón "Nueva reserva" en la cabecera → `NewReservationDialog`: paso 1 hueco
  libre (selector), paso 2 datos del cliente + checkbox "Ya tengo la pista
  reservada".
- `POST /api/dashboard/reservations` → `lib/reservations/manual.ts`
  (`createManualReservation`): `confirmed` + hueco `full`, o
  `pending_confirmation` + hueco `pending`. Precio: **la misma
  `calculateBookingPrice(1)` de `POST /api/reservations`**, no duplicada.

Todo lo de las Partes 2–4 pasa por `requireTrainer()` y comprueba que la
reserva y el hueco son del entrenador de la sesión (403 si no).

### Verificación (20/09/2026)

Con `testdata.mjs setup` (3 pendientes, 1 confirmada, 1 sin pista sobre
`daniel-ruiz`, sesión temporal), todo deshecho después (7 reservas, 7 huecos a
`available`/0, logs, vínculo y usuario):

- **Calendario**: semana 28/09–04/10 con David azul (confirmada), Carla/Bruno/Ana
  ámbar (pendientes), Vie–Dom rayados (sin abrir); semana 14–20/09 con hueco
  "Libre" punteado; navegación ‹ › Hoy; clic en Carla → tabla, Pendientes,
  fila resaltada; móvil 375 px arranca en Día, sin scroll horizontal.
- **Editar** (Bruno): teléfono, notas, precio 250 y cambio de horario al 21/09
  desde la UI → base: `price 250`, hueco nuevo `pending`/1, hueco viejo
  `available`/0, `email_logs` "Tu clase pasa al 2026-09-21 09:00".
- **Cancelar** (Carla) desde el panel → `cancelled`, hueco `available`/0,
  aparece en Canceladas como "Cancelada" junto a Elena "Sin pista"; en esa
  pestaña solo hay "Editar".
- **Nueva reserva**: Fran sin checkbox → `pending_confirmation`, hueco
  `pending`/1; Gema con checkbox → `confirmed`, hueco `full`/1; ambas RM 300;
  `GET /api/availability` deja de ofrecer esos huecos.
- **Seguridad**: manual sobre un hueco de Mauri → 403; sin sesión → 401;
  `PUT`/`cancel` sobre una reserva de Mauri → 403.
- **Propuesta sin la 004**: `POST …/propose` → 500 "Falta aplicar
  migrations/004…", la reserva y su hueco intactos; `/propuesta/<token falso>`
  → "Este enlace ya no es válido".
- `npm run type-check`: 20 (preexistentes); sin sombras raras ni emojis.

### Verificación de la propuesta de nueva fecha (20/09/2026, con 003 y 004 aplicadas)

- **Proponer** (Ana, desde el diálogo del dashboard, hueco 20/09): la original
  pasa a `needs_reschedule` con su hueco `available`/0; nace la propuesta
  `reschedule_proposed` con `rescheduled_from_id` y `proposal_token`, hueco
  `pending`/1; fila "Propuesta enviada" en Pendientes con "Copiar enlace" y el
  enlace; `email_logs` con el enlace en el asunto; `GET /api/availability` deja
  de ofrecer el 20/09 y vuelve a ofrecer el 01/10.
- **Aceptar** (sin sesión, desde `/propuesta/[token]`): → `pending_confirmation`,
  `proposal_token` NULL, el hueco sigue `pending`; recargar el enlace → "Este
  enlace ya no es válido"; `POST /api/propuesta/[token]` otra vez → 404.
- **Rechazar** (Carla, segunda propuesta al 22/09, "Prefiero elegir otra"):
  → `needs_reschedule`, hueco 22/09 `available`/0, enlace "Elegir otra hora" a
  `/daniel-ruiz#booking-section`; el calendario público ofrece 22/09 y 29/09.
- Proponer sobre una reserva ya no pendiente → 409; sin sesión → 401.
- Datos de prueba deshechos (7 reservas, huecos, logs, vínculo, usuario).

Retoque: la cabecera de Reservas cuenta como "requieren tu confirmación" solo
las `pending_confirmation`; una propuesta enviada espera al cliente, no al
entrenador.

## Fase D — Disponibilidad (20/09/2026)

### Alcance

CRUD de `availability_slots` del entrenador de la sesión: crear huecos nuevos
y cerrar los que están libres. No se implementa edición de un hueco existente
(mover hora/tipo): para eso, cerrar y volver a abrir.

### Lectura

Reutiliza `GET /api/dashboard/calendar` (ya existía para la Fase C+, sin
tocar). No hace falta un `GET` nuevo: esa ruta ya devuelve, por rango de
fechas, cada hueco del entrenador con su `kind` (`pending` / `proposed` /
`confirmed` / `available` / `closed`) y "sin abrir" cuando no hay hueco.

### Escritura — `lib/availability/manage.ts`

- `createSlot`: valida fecha (no pasada), horas `HH:MM` con fin > inicio, y
  `class_type` contra los tres valores reales (`private`, `group`, `academy`,
  `docs/DATABASE.md`). Rechaza un duplicado exacto (mismo entrenador, fecha,
  hora de inicio y tipo) con 409. Inserta `status: 'available'`,
  `current_bookings: 0`, `max_capacity: 1`.
- `deleteSlot`: carga el hueco con sus reservas embebidas, comprueba dueño
  (403 si no) y que está abierto y sin reserva viva encima
  (`isSlotOpen` + `reservationHoldsSlot`, las mismas funciones de
  `lib/availability/slot-status.ts` que usa todo lo demás) — 409 si no, con el
  mensaje "Gestiónala primero desde Reservas". Solo entonces borra la fila.

### Rutas

- `POST /api/dashboard/availability` `{ session_date, start_time, end_time, class_type }`
- `DELETE /api/dashboard/availability/[id]`

Ambas por `requireTrainer()`: 401 sin sesión, 403 si el hueco (al borrar) es
de otro entrenador.

### Dashboard → Disponibilidad (`/dashboard/disponibilidad`)

- `components/dashboard/availability/AvailabilityView.tsx`: cabecera con el
  botón "Añadir hueco" + `AvailabilityCalendar`.
- `AvailabilityCalendar.tsx`: **no** es `ReservationsCalendar` reutilizado — es
  una copia adaptada, a propósito, para no tocar el componente ya verificado
  de la Fase C+ (CLAUDE.md pide preguntar antes de tocar la referencia
  visual). Misma rejilla semana/día y los mismos datos
  (`GET /api/dashboard/calendar`); la diferencia es que un hueco `available`
  es un botón que lo cierra (con `window.confirm` y `DELETE`), mientras que
  `pending`/`proposed`/`confirmed` quedan de solo lectura con un `title`
  apuntando a Reservas.
- `NewSlotDialog.tsx` (vía `DialogShell`, igual que el resto del dashboard):
  fecha (mínimo hoy), hora de inicio/fin, tipo de clase.

### Sin verificar

No se ha podido levantar `npm run dev` desde este entorno (la VM de acceso al
Mac no tiene red para descargar el binario nativo de SWC de Turbopack) para
probar en el navegador. Sí se ha comprobado:

- `npm run type-check`: sigue en 20 errores, los mismos preexistentes; nada
  nuevo en los archivos de la Fase D.
- Revisión de código contra los patrones ya verificados de la Fase C+
  (`requireTrainer()`, `isSlotOpen`/`reservationHoldsSlot`,
  `getSupabaseServerClient()`, mismo `DialogShell`).

**Pendiente para Daniel (o la sesión de Claude Code en el Mac)**: probar en el
navegador — crear un hueco, comprobar que aparece en `GET /api/availability`
y en el widget público, cerrar un hueco libre, y confirmar que intentar
cerrar uno con una reserva encima devuelve el 409 y no lo borra.

## Pendiente (manual, Daniel)

1. Configuración de Auth pendiente de la Fase A (redirect URL de Supabase y
   Google OAuth).
2. Dato heredado: dos reservas `confirmed` anteriores a la Fase C (18/09 y
   19/09) siguen sobre huecos `available`/0. No afecta al calendario ni a la
   web (ambos cruzan con `reservations`), pero si se quiere coherencia total:
   `update availability_slots set status='full', current_bookings=1 where id in (…)`.

## Siguiente prompt (Fase E)

Perfil: foto, colores de tema, precios base. Antes de tocar `trainers`,
comprobar contra `docs/DATABASE.md` qué columnas existen de verdad (no hay
`price` en la tabla hoy).

Antes de eso: verificar la Fase D en el navegador (ver "Sin verificar" arriba)
— este entorno no puede levantar `npm run dev`.

## Log de prompts

- **Prompt 1 (Fase A) — 19/09/2026.** Auth, migración `auth_user_id`, proxy de
  `/dashboard/**`, auditoría multi-tenant. Resultado: lo de arriba.
- **Prompt 2 (Fase A, cierre) — 19/09/2026.** Borrar/proteger las rutas de la
  auditoría, `/api/coaches` sin datos de contacto, hydration mismatch. Ver
  "Huecos cerrados".
- **Prompt 3 (Fase B) — 19/09/2026.** Shell con navegación, placeholders de
  secciones y de stats, borrado de `trainers.service.ts`.
- **Prompt 4 (Fase C) — 19/09/2026.** Confirmación manual: modelo de estados
  (migración 003), `price` en servidor, Reservas en el dashboard, stub de
  notificaciones sobre `email_logs`/`whatsapp_logs`.
- **Prompt 5 (Fase C, UI) — 19/09/2026.** Verificación de los dos botones
  desde el navegador y rediseño de Reservas: pestañas + buscador + tabla /
  tarjetas.
- **Prompt 6 (Fase C+) — 20/09/2026.** Calendario semanal, propuesta de nueva
  fecha con enlace público (migración 004), edición total de reservas,
  cancelación `cancelled`, reserva manual.
- **Prompt 7 — 20/09/2026.** Migraciones 003/004 aplicadas por Daniel;
  verificación de punta a punta de la propuesta (aceptar y rechazar).
- **Prompt 8 (Fase D) — 20/09/2026.** CRUD de disponibilidad: crear y cerrar
  huecos (`lib/availability/manage.ts`), reutilizando `GET /api/dashboard/calendar`
  para la lectura. Implementado y con `type-check` limpio; sin verificar en el
  navegador (sin `npm run dev` disponible en este entorno).
