# Base de datos — esquema de referencia

> **Este documento manda sobre `migrations/001_initial_schema.sql`.**
> Esa migración nunca se aplicó tal cual y describe tablas que no existen.
> Lo de aquí está verificado contra el proyecto desplegado
> (`vkriseshpcjvgsnwzqcs`) el 19/09/2026.

## La trampa que hay que conocer antes de tocar nada

`availability_slots` tiene RLS activo y **con la clave anon no devuelve ni una
fila**, aunque los huecos estén en `available`. Solo la service role key ve los
datos.

Esto ya rompió la reserva una vez: `GET /api/availability` usaba la service role
key y pintaba los huecos en el calendario, mientras que `POST /api/reservations`
creaba su propio cliente con la anon key, no encontraba la fila y respondía
`Slot no disponible` sobre huecos perfectamente libres.

**Regla: toda ruta de servidor que lea o escriba estas tablas usa
`getSupabaseServerClient()` (`lib/supabase/client.ts`).** Nunca `createClient()`
con la anon key dentro de un `route.ts`.

## `availability_slots` — VENTANAS (desde la migración 007)

> Una fila es una **ventana abierta** del entrenador (una por rango de la
> plantilla y fecha, p. ej. miércoles 09:00–17:00), no "una clase". Las clases
> son reservas con su propio rango dentro de la ventana; la disponibilidad se
> calcula al vuelo por solapamiento (`lib/availability/windows.ts`,
> `lib/availability/booking.ts`). No se generan filas por duración: el unique
> constraint `(trainer_id, session_date, start_time, end_time)` se queda.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `trainer_id` | uuid | |
| `session_date` | date | |
| `start_time` | time | formato `HH:MM:SS` |
| `end_time` | time | |
| `class_type` | text | en los datos actuales: `private` |
| `max_capacity` | int | 1 en los datos actuales |
| `current_bookings` | int | nº de reservas vivas dentro de la ventana (lo recalcula `refreshWindowStatus`) |
| `status` | text | `available` · `full` (no queda ningún inicio libre para la duración mínima ofrecida; lo recalcula la app) · `cancelled` · `blocked`. `pending` es legado (anterior a la 007): ya no se escribe y se lee como cerrado |
| `generated_by_pattern` | bool | migración 005: la creó el generador de la plantilla semanal |
| `created_at`, `updated_at` | timestamptz | |

No existen: `is_available`, `is_booked`, `price`.

## `reservations`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `trainer_id` | uuid | |
| `availability_slot_id` | uuid | |
| `client_name`, `client_email`, `client_phone` | text | el cliente vive en la propia fila |
| `price` | numérico | lo calcula el servidor al crear (`lib/reservations/pricing.ts`): precio por sesión ya con descuento; 1 h 30 = precio de 1 h × 1,5 |
| `start_time`, `end_time` | time | **migración 007**: rango real de la clase dentro de su ventana. NULL solo en reservas anteriores (se leen como ventana.start_time + 60 min) |
| `duration_minutes` | smallint | **migración 007**: 60 o 90 |
| `session_date` | date | **migración 008 (pendiente de aplicar)**: fecha de su ventana. La rellena el trigger `reservations_set_session_date` al crear y al cambiar `availability_slot_id`; la app no la escribe |
| `status` | text | `pending_confirmation` (default tras la migración 003) · `reschedule_proposed` (004) · `confirmed` · `needs_reschedule` · `cancelled` · `completed`. Ver `migrations/003_…` y `004_…` |
| `rescheduled_from_id` | uuid | **migración 004**: reserva original de una propuesta de nueva fecha |
| `proposal_token` | text | **migración 004**: token del enlace público `/propuesta/[token]`; NULL al responder |
| `notes` | text | notas internas del entrenador. Antes de la 010 el widget guardaba aquí "WhatsApp: si/no" (solo se lee en reservas antiguas) |
| `created_at`, `updated_at` | timestamptz | |

**Restricción `reservations_no_overlap` (migración 008, pendiente de aplicar):**
dos reservas vivas (`reservationHoldsSlot`: todo menos `cancelled`,
`canceled`, `needs_reschedule`) del mismo entrenador no pueden solaparse
(rango `[inicio, fin)`). Postgres responde `23P01`; la app lo traduce a 409
con `isOverlapError` (`lib/reservations/slots.ts`).

No existen: `client_id`, `session_time`, `class_type`,
`client_whatsapp_opt_in`, `total_price`, `discount_percent`.

## `clients`

**No existe.** No hay tabla de clientes. Si algún documento o código la menciona,
está desactualizado.

## `trainers`

Verificado con `node scripts/inspect-schema.mjs trainers` el 19/09/2026
(2 filas: `daniel-ruiz` y `mauri`).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `user_id` | uuid | FK a **`public.users`** (tabla propia, vacía). **No** es `auth.users`; no se usa para nada |
| `slug` | text | NOT NULL. Es lo que resuelve `getTrainerBySlug` |
| `name` | text | NOT NULL |
| `email` | text | NOT NULL |
| `phone` | text | |
| `bio` | text | |
| `image_url` | text | |
| `specializations` | text[] | |
| `rating` | numeric | default 5 |
| `total_reviews` | int | default 0 |
| `status` | text | default `active` |
| `created_at`, `updated_at` | timestamp | sin zona horaria |
| `auth_user_id` | uuid | **la añade `migrations/002_trainers_auth_user_id.sql`**: unique, FK a `auth.users(id)`. Es el vínculo con el login del dashboard |
| `class_durations` | smallint[] | **migración 007**: duraciones que ofrece, `{60}`, `{90}` o `{60,90}`. Configuración global del entrenador (Disponibilidad → "Duración de las clases") |

No existe `price` (y `app/api/admin/setup-mauri` intenta insertarlo).

RLS activo: **la anon key no ve ninguna fila** (igual que en `availability_slots`).
El dashboard resuelve el entrenador con la service role key desde
`lib/auth/current-trainer.ts`. La migración 002 añade además una política
`trainers_select_own` para que un usuario autenticado pueda leer su propia fila.

## `client_packages` y `package_sessions` (migración 006)

Paquetes de 5/10 clases con el precio fijado al vender. `client_packages.duration_minutes`
(**migración 007**): 60 o 90, la misma para todas las sesiones del paquete.
`package_sessions.reservation_id` enlaza cada sesión agendada con su fila
real de `reservations`.

**Funciones `schedule_package_session` y `unschedule_package_session`
(migración 011, pendiente de aplicar):** agendar y desagendar una sesión son
una sola transacción cada una. Las dos empiezan bloqueando la fila de
`package_sessions` (`FOR UPDATE`). Agendar comprueba crédito libre y ventana
(abierta, rango dentro, no pasada), crea la reserva con los datos y el precio
del paquete y la enlaza. Desagendar comprueba que el crédito sigue enlazado a
la reserva que vio la app, la cancela si está viva y devuelve el crédito.
Solo las ejecuta `service_role`; las llama `lib/packages/schedule.ts`. No
insertar, cancelar ni desenganchar la reserva de un paquete por otro camino.

## `trainer_weekly_hours` y `trainer_availability_overrides` (migración 005)

Plantilla semanal y excepciones por fecha. `lib/availability/generate.ts` las
traduce a ventanas de `availability_slots` de las próximas 8 semanas. Sin
cambios en la 007: la duración no vive aquí (`class_type` es otra dimensión y
sigue hardcodeada a `private`).

## `players` y `player_trainers` (migración 009)

Cuenta global de jugador (Fase A1). Aplicada el 24/09/2026. Detalle del
flujo: [`PLAYER_ACCOUNTS.md`](PLAYER_ACCOUNTS.md).

`players` — una fila por usuario de `auth.users` que entra por `/cuenta`:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `auth_user_id` | uuid | NOT NULL, unique, FK a `auth.users(id)` on delete cascade |
| `email` | text | NOT NULL. Copia del email de Auth; la app la resincroniza al entrar. No se edita desde el perfil |
| `full_name` | text | 2–80 caracteres |
| `phone` | text | 8–30 caracteres (la app exige 10+ dígitos, como el formulario de reserva) |
| `whatsapp_opt_in` | bool | default false |
| `onboarding_completed_at` | timestamptz | NULL = onboarding pendiente. CHECK: no puede estar puesto sin nombre y teléfono |
| `created_at`, `updated_at` | timestamptz | |

`player_trainers` — relación N:M jugador ↔ entrenador, unique `(player_id, trainer_id)`:

| Columna | Tipo | Notas |
|---|---|---|
| `player_id` | uuid | FK a `players` on delete cascade |
| `trainer_id` | uuid | FK a `trainers` on delete cascade |
| `status` | text | `active` · `archived` (se archiva, no se borra) |
| `source` | text | `self_signup` (entró desde la página del entrenador) · `booking` (futuro) · `trainer_added` (futuro) |
| `created_at`, `updated_at` | timestamptz | |

RLS activo en las dos, solo lectura: el jugador lee su fila y sus relaciones;
el entrenador lee las relaciones con él. No hay políticas de escritura: todo
pasa por el servidor con la service role key tras `requirePlayer()`.
`reservations` **no** tiene todavía `player_id`.

## Migración 010 — checkout A2 (aplicada el 25/09/2026)

Columnas nuevas en `reservations` (sin backfill; las reservas anteriores
quedan con `player_id` NULL, `client_message` NULL, `player_count` 1,
`whatsapp_opt_in` NULL):

| Columna | Tipo | Notas |
|---|---|---|
| `player_id` | uuid NULL | FK `players(id)` ON DELETE SET NULL. Solo desde la sesión (reserva pública con cuenta). Invitado, manual y paquete: NULL. Índice parcial `reservations_player_idx (player_id, created_at desc) where player_id is not null` |
| `client_message` | text NULL | ≤ 500 (CHECK). Mensaje del cliente al entrenador. **No** son las notas internas (`notes`) |
| `player_count` | smallint NOT NULL default 1 | 1..4 (CHECK). Personas en esa clase privada; no es `max_capacity`. Mismo valor en todas las filas de un checkout |
| `whatsapp_opt_in` | boolean NULL | Avisos operativos. Toda reserva nueva lo escribe true/false; NULL = reserva antigua (se lee "WhatsApp: si/no" de `notes`) |

`trainer_session_prices` — precio VIGENTE por entrenador:

| Columna | Tipo | Notas |
|---|---|---|
| `trainer_id` | uuid | FK `trainers` ON DELETE CASCADE |
| `duration_minutes` | smallint | 60 o 90 |
| `player_count` | smallint | 1..4 |
| `price_rm` | numeric(10,2) | > 0 y ≤ 100 000 |
| `created_at`, `updated_at` | timestamptz | |

PK `(trainer_id, duration_minutes, player_count)`. Precargada para los
entrenadores existentes con 60 min → 300/300/350/350 y 90 min →
450/450/525/525. **Un entrenador nuevo no tiene filas**: hasta que las
configure (Perfil → Public pricing) la reserva devuelve 409. Lo cobrado es
el snapshot de `reservations.price`; cambiar la tabla no toca reservas hechas.

Seguridad (010): RLS activo sin políticas en las dos tablas, y anon /
authenticated **sin** INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ni
TRIGGER (solo conservan SELECT, que sin política no devuelve filas). Toda
escritura va por el servidor con la service role.

## `email_logs` y `whatsapp_logs`

| `email_logs` | `whatsapp_logs` |
|---|---|
| `id`, `reservation_id` (FK), `recipient_email` NOT NULL, `subject`, `status` (default `sent`), `error_message`, `created_at` | `id`, `reservation_id` (FK), `phone_number` NOT NULL, `message`, `status` (default `sent`), `error_message`, `created_at` |

Las escribe el stub `lib/notifications/notify.ts` con `status = 'skipped'`
hasta que haya proveedor de email. Para borrar una reserva hay que borrar antes
sus filas aquí (FK).

## Otras tablas expuestas

`class_types` (`private`, `group`, `academy`) y `users` (propia, vacía, no es
`auth.users`). No existe `trainer_rates`.

## Cómo volver a verificar el esquema

Con la service role key en `.env.local`:

```bash
node scripts/inspect-schema.mjs            # tablas expuestas
node scripts/inspect-schema.mjs trainers   # columnas, tipos, NOT NULL, defaults, FKs
```

Lee el OpenAPI de PostgREST, que refleja el esquema real. Es lo que se usó para
esta página.

### Alternativa sin la service role key

Sin acceso al Table Editor, se puede sondear columna a columna desde la consola
del navegador con la clave pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY`):

```js
const base = 'https://<proyecto>.supabase.co/rest/v1/'
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY }
const r = await fetch(`${base}reservations?select=nombre_de_columna&limit=1`, { headers: H })
// 200 -> la columna existe
// 42703 "column ... does not exist" -> no existe
// PGRST205 "Could not find the table" -> la tabla no existe
```

Para ver los datos (no solo los nombres) hace falta la service role key, o
llamar a `GET /api/availability` del servidor de desarrollo, que ya la usa.
