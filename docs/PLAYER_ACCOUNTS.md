# Cuenta de jugador — Fase A1

Creado: 24/09/2026 · Estado: **migración 009 aplicada. Login real probado
(24/09). Vuelta al entrenador + reserva con cuenta: código hecho, pendiente de
probar a mano.**

## Qué es

Una cuenta **global** por jugador (no una por entrenador) para que la misma
persona pueda reservar más adelante con varios entrenadores sin repetir sus
datos. Esta fase deja la base: login, perfil, onboarding, edición del perfil
y la relación jugador ↔ entrenador.

## Flujo desde la página de un entrenador

```
/mauri → "Entra en tu cuenta de jugador" → /cuenta/entrar?trainer=mauri
  sin sesión:  login → /cuenta/auth/callback?trainer=mauri
  con sesión:  proxy → /cuenta/auth/vincular?trainer=mauri
    → finishPlayerEntry: resuelve el entrenador activo, crea la relación
    → sin onboarding: /cuenta/bienvenida?trainer=mauri → al guardar, /mauri#booking-section
    → con onboarding: /mauri#booking-section
/cuenta/entrar sin trainer → /cuenta (como siempre)
```

La vuelta (`trainerReturnPath`, `lib/players/entry.ts`) es `/<slug>#booking-section`,
genérica por slug, y **solo** se construye con un slug que el servidor ha
encontrado en `trainers` como activo (`findActiveTrainerBySlug`). No hay
ningún parámetro de URL libre: no hay redirección abierta posible.

## Reserva con la cuenta

- `components/mauri/BookingSection` pregunta `GET /api/player/me` (solo
  lectura, no crea filas) y pasa `player` a `BookingFlow`. Con perfil
  completo, el paso 2 enseña "Confirma tu reserva" con sus datos en solo
  lectura (enlace a `/cuenta` para cambiarlos) en vez del formulario.
- El POST manda `as_player: true` **sin** datos de contacto. El servidor
  (`findBookingPlayer`) toma nombre, teléfono y WhatsApp del perfil y el email
  de Supabase Auth. Sin sesión → 401; sin fila o sin perfil completo → 409;
  fallo real de Supabase (Auth caído, error leyendo `players`) → 503, nunca
  disfrazado de "no autenticado". Cualquier `client_*` o `player_id` del body
  se ignora. `GET /api/player/me` sigue la misma separación (503 si falla).
- **Sesión abierta con perfil incompleto:** el paso 2 no enseña el formulario
  anónimo; pide completar el perfil (`/cuenta/bienvenida?trainer=<slug>`, que
  devuelve a la reserva). Mientras se comprueba la cuenta no se deja
  confirmar. Si la comprobación falla, la página lo dice y deja reservar sin
  cuenta. Quien no tiene sesión reserva sin cuenta como siempre: el POST
  anónimo no mira la sesión (no es un login obligatorio).
- Solapamiento: la reserva con cuenta pasa por el mismo insert que la
  anónima, protegido por la migración 008 (`reservations_no_overlap`). Solo
  el 23P01 de esa restricción es 409 (`isOverlapError`); cualquier otro error
  es 500. Pruebas: `node scripts/verify-reservations-route.mjs`.
- Tras reservar, relación `player_trainers` con source `booking`
  (idempotente, no reactiva archivadas).
- Sin sesión (o sin perfil completo) el widget es el de siempre: anónimo con
  formulario. No se obliga a nadie a tener cuenta.
- Desde la migración 010 (A2), la reserva con cuenta guarda `player_id` (de la
  sesión). "Mis reservas", historial, cancelar/reprogramar desde la cuenta y
  paquetes del jugador siguen pendientes. La reserva lleva además el contacto
  copiado (snapshot), como las de invitado.

## Fase A2 — checkout (25/09/2026)

**Estado:** código hecho; migración 010 aplicada. Pendiente de la prueba manual de Dani.

Checkout en inglés (`components/booking/checkout/BookingCheckout.tsx`), una
sola pantalla tras elegir sesiones en el calendario (Step 1, sin cambios de
lógica): coach + sesiones → **Number of players** (1–4, cada uno con su
precio real) → **Booking as** (con cuenta, solo lectura, sin "Edit details") o
**Your details** (invitado: Name, Email, Phone, "Receive booking updates on
WhatsApp") → **Message to coach** (opcional, contador 0/500) → **Order
summary** (sesiones × precio, jugadores, descuento, total) → **Confirm
booking**. Sin ubicación (no hay datos) ni "group bookings".

| | Con cuenta | Invitado | Manual | Paquete | Propuesta de otra fecha |
|---|---|---|---|---|---|
| `player_id` | sesión (Auth → players) | NULL (el body se ignora) | NULL | NULL | copia |
| `client_message` | body validado | body validado | NULL | NULL | copia |
| `player_count` | body 1..4, en cada fila | ídem | 1 | 1 | copia |
| `whatsapp_opt_in` | perfil | casilla (false si falta) | false | false | copia |
| precio | tabla × jugadores − descuento | ídem | 1 jugador | 1 jugador (foto al vender) | copia |

Mover, confirmar, cancelar y aceptar/rechazar la propuesta no tocan estos
campos. El PUT del dashboard (`parseDetails`) no los acepta.

**Invitado → cuenta:** en el checkout, "Continue with my account" guarda un
borrador NO sensible en `localStorage` (`lib/booking/draft.ts`: versión,
draftId UUID, entrenador, sesiones, duración, jugadores, caducidad 30 min;
clave `tb:booking-draft:v1:<slug>:<draftId>`) y va a
`/cuenta/entrar?trainer=<slug>&draft=<uuid>`. El `draft` viaja por
callback / vincular / bienvenida hasta `/<slug>?draft=<uuid>#booking-section`
(`lib/players/entry.ts`: solo con formato UUID y junto a un entrenador
válido; nunca es una ruta). Al volver, `components/mauri/BookingSection`
lo recupera **y lo consume**, lo valida entero (entrenador, id, caducidad,
duración ofrecida, 1..4, sin campos de más) y `BookingFlow` se queda solo con
las sesiones que siguen libres según `/api/availability` (avisa si quita
alguna). Nada de eso es de fiar: el servidor revalida todo al confirmar. El
mensaje al entrenador **no** se guarda en el borrador: se vuelve a escribir.

**Tras reservar como invitado:** "Activate your player account" →
`/cuenta/entrar?trainer=<slug>`. La reserva NO se asocia a la cuenta
(el enlace seguro invitado → cuenta, con token por reserva, es otra fase).

**Precios editables:** Dashboard → Disponibilidad → **Precios**
(`PricingCard`, `GET/PUT /api/dashboard/pricing`, entrenador de la sesión;
todo o nada, importes > 0 con 2 decimales como mucho). Vista previa pública:
`GET /api/pricing?trainer_id=`. Descuentos por volumen no editables todavía.

**Dashboard de reservas:** "Del checkout" en Editar (Jugadores, WhatsApp,
Mensaje del cliente en solo lectura), "Notas internas" editable aparte;
nº de jugadores e indicador de mensaje en la tabla y en la tarjeta móvil.

Pruebas: `node scripts/verify-a2.mjs`, `verify-reservations-route.mjs`,
`verify-player-entry.mjs` y `verify-migration-010.mjs` (este último con
`npm i --no-save @electric-sql/pglite`).

## WhatsApp

El único uso de la casilla de la reserva es `lib/notifications/notify.ts`:
mensajes **operativos** (confirmación, sin pista, propuesta de otra hora,
cancelación, cambio), guardados como `notes: "WhatsApp: si/no"`. No hay tips
ni marketing en ningún sitio, así que la etiqueta "Deseo recibir tips vía
WhatsApp" era engañosa. En el checkout A2 (inglés) dice "Receive booking updates
on WhatsApp — Confirmation and changes to this booking only", el mismo
concepto que "Avisos por WhatsApp" del perfil. Desde la 010 se guarda en
`reservations.whatsapp_opt_in` (ya no en `notes`). Si algún día hay comunicaciones de marketing, necesitan su propio
consentimiento aparte.

## Rutas

| Ruta | Qué hace |
|---|---|
| `/cuenta/entrar` | Login (enlace mágico + Google, el mismo `LoginForm` del dashboard). `?trainer=<slug>` lo lleva al callback |
| `/cuenta/auth/callback` | Abre la sesión, crea la fila de `players` si falta, vincula con `?trainer` (source `self_signup`) y manda a `/cuenta/bienvenida` si falta el onboarding |
| `/cuenta/auth/vincular` | Para quien **ya tiene sesión** y abre `/cuenta/entrar?trainer=<slug>`: el proxy le manda aquí (no a `/cuenta`) y se crea la relación con el mismo paso que el callback (`finishPlayerEntry`, `lib/auth/player-entry.ts`). Solo vincula si la petición viene de nuestra web o se abrió a mano (`Sec-Fetch-Site` `same-origin`/`none`/ausente); desde otra web entra sin vínculo (anti-CSRF) |
| `/cuenta/auth/signout` | POST: cierra la sesión |
| `/cuenta/bienvenida` | Onboarding: nombre y teléfono obligatorios, WhatsApp opcional. `?trainer=` (resuelto en el servidor) decide la vuelta: su reserva o `/cuenta`. Si ya está hecho, redirige ahí directamente |
| `GET /api/player/me` | Para el widget: `{authenticated, player}`. Solo lectura, siempre 200 |
| `/cuenta` | Perfil editable + "Tus entrenadores". Si falta el onboarding → `/cuenta/bienvenida` |
| `GET/PATCH /api/player/profile` | Leer / editar el perfil (PATCH exige onboarding hecho: 409 si no) |
| `POST /api/player/onboarding` | Guarda los datos y marca `onboarding_completed_at` (solo la primera vez) |

`proxy.ts` protege `/cuenta/**` igual que `/dashboard/**` (sin sesión →
`/cuenta/entrar?next=…`; con sesión en `/cuenta/entrar` → `/cuenta`, o
`/cuenta/auth/vincular` si trae `?trainer=`).

**Acceso público:** la página de Mauri (`/mauri`) enseña debajo del widget
de reserva "¿Entrenas con Mauricio…? Entra en tu cuenta de jugador" →
`/cuenta/entrar?trainer=mauri` (`components/mauri/BookingSection.tsx`, prop
`trainerSlug`). Es un `<a>`, no `<Link>`, para que no haya prefetch. La
página genérica `/[trainerSlug]` (legado en inglés, `components/trainer/*`)
no tiene el enlace todavía.

## Reglas

- El jugador sale **siempre** de la sesión: `getPlayerSession()` /
  `requirePlayer()` en `lib/auth/current-player.ts`. Ninguna ruta acepta un
  `player_id` del cliente.
- Lista blanca estricta en el perfil (`lib/players/profile.ts`): solo
  `full_name`, `phone`, `whatsapp_opt_in`. Cualquier otro campo → 400 con su
  nombre. El email es el de Supabase Auth y no se edita aquí.
- La relación (`lib/players/trainers.ts`) se crea con upsert
  `ignoreDuplicates` (ON CONFLICT DO NOTHING) y sin mandar `status`: volver
  a entrar no la duplica, no cambia el `source` original ni reactiva una
  relación archivada. Solo con entrenadores activos (`status` `active` o NULL).
- Reglas puras de la entrada (slug válido, redirección del proxy, anti-CSRF,
  destino según onboarding): `lib/players/entry.ts`. Pruebas:
  `node scripts/verify-player-entry.mjs` (sin Supabase ni servidor).
- Lecturas y escrituras con la service role key después de comprobar la
  sesión. Las políticas RLS de la 009 son solo lectura y de red de seguridad.
- Misma sesión de Supabase para entrenador y jugador: un entrenador que abre
  `/cuenta` obtiene también su fila de `players` (es válido: puede ser
  jugador). Salir en un sitio sale de los dos.

## Para ponerlo en marcha

1. Antes de aplicar la 009, comprobar en el SQL Editor que no existe nada
   con esos nombres (tiene que devolver dos NULL):
   `select to_regclass('public.players'), to_regclass('public.player_trainers');`
   Si alguno no es NULL, parar y mirar qué es: la 009 usa `create table if
   not exists` y no corregiría una tabla ya existente con otras columnas.
   Luego aplicar `migrations/009_players.sql` en Supabase → SQL Editor → Run
   y comprobar con `node scripts/inspect-schema.mjs players`.
2. Añadir `http://localhost:3001/cuenta/auth/callback` (y el equivalente de
   producción) en Supabase → Authentication → URL Configuration → Redirect URLs.
   Sin esto el enlace mágico y Google vuelven a la Site URL, no a `/cuenta`.

## Pendiente de verificar (con Supabase real)

Vuelta al entrenador y reserva con cuenta (24/09, sin probar todavía):

- [ ] A. Correo nuevo desde `/mauri` → login → bienvenida (dice "Después vuelves a la reserva con Mauricio…") → Continuar → `/mauri`, en la sección de reserva.
- [ ] B. Ya con sesión y perfil, pulsar el enlace en `/mauri` → vuelve a `/mauri#booking-section` (no a `/cuenta`).
- [ ] C. `/cuenta/entrar` sin `trainer` → login → `/cuenta`.
- [ ] D. Con sesión en `/mauri`: debajo del widget "Reservas como <nombre>"; elegir hora → el paso 2 dice "Confirma tu reserva" con tus datos, sin formulario → confirmar → en el dashboard la reserva lleva nombre/email/teléfono de la cuenta y `WhatsApp: si/no` según el perfil; en `/cuenta`, Mauri en "Tus entrenadores".
- [ ] E. En una ventana privada (sin sesión), la reserva anónima con formulario sigue funcionando; la casilla dice "Receive booking updates on WhatsApp" (checkout A2).

Login básico (probado el 24/09 salvo lo marcado):

- [ ] Desde `/mauri`, pulsar "Entra en tu cuenta de jugador" con un correo
      nuevo → llega a bienvenida, se crea la fila en `players` y la relación
      `self_signup` con Mauri.
- [ ] Ya con sesión, volver a `/mauri` y pulsar el mismo enlace → pasa por
      `/cuenta/auth/vincular` y termina en `/cuenta`, sin fila duplicada en
      `player_trainers`.
- [ ] Con la relación puesta a mano en `archived`, repetir lo anterior → sigue
      `archived`.
- [ ] Con sesión y un segundo entrenador (`/cuenta/entrar?trainer=daniel-ruiz`
      abierto a mano) → aparece en "Tus entrenadores".
- [ ] Completar el onboarding → `/cuenta` con "Tus entrenadores: Mauri".
- [ ] Editar nombre / teléfono / WhatsApp y recargar: persiste.
- [ ] `PATCH /api/player/profile` con `{"email": "x"}` → 400 "Campo no permitido: email".
- [ ] Con la clave anon, `players` y `player_trainers` no devuelven filas de otros.

## Limitaciones conocidas

- Un enlace `/cuenta/entrar?trainer=…` abierto desde **otra web** por alguien
  que ya tiene sesión no crea la relación (anti-CSRF, ver `/cuenta/auth/vincular`).
  Sin sesión sí se crea, al volver del login. La relación por reserva
  (`source = 'booking'`) llegará con la fase siguiente.
- No hay "borrar mi cuenta" ni cambio de email todavía.
- El dashboard del entrenador todavía no lista sus jugadores.
