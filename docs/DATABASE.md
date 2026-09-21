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
| `status` | text | `pending_confirmation` (default tras la migración 003) · `reschedule_proposed` (004) · `confirmed` · `needs_reschedule` · `cancelled` · `completed`. Ver `migrations/003_…` y `004_…` |
| `rescheduled_from_id` | uuid | **migración 004**: reserva original de una propuesta de nueva fecha |
| `proposal_token` | text | **migración 004**: token del enlace público `/propuesta/[token]`; NULL al responder |
| `notes` | text | aquí se guarda la preferencia de WhatsApp |
| `created_at`, `updated_at` | timestamptz | |

No existen: `client_id`, `session_date`, `session_time`, `class_type`,
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

## `trainer_weekly_hours` y `trainer_availability_overrides` (migración 005)

Plantilla semanal y excepciones por fecha. `lib/availability/generate.ts` las
traduce a ventanas de `availability_slots` de las próximas 8 semanas. Sin
cambios en la 007: la duración no vive aquí (`class_type` es otra dimensión y
sigue hardcodeada a `private`).

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
