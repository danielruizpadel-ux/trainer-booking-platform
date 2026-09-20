# Flujo de reserva — qué toca qué

Lo que hay que entender antes de modificar la reserva. El orden es el real:
de lo que ve el cliente hacia la base de datos.

## La página

`app/mauri/page.tsx` monta, en este orden:

1. `components/mauri/PremiumHero` — foto a pantalla completa, CTA a `#booking-section`
2. `components/mauri/BookingSection` — **la reserva** (primera al bajar del hero)
3. `components/mauri/SpecialtiesSection`
4. `components/mauri/CoursesSection` — ancla `#programas`
5. `components/mauri/CtaSection`
6. `components/mauri/FooterSection`

`app/mauricio-martin/page.tsx` es solo un `redirect('/mauri')`.
`components/mauri/ReviewsSection` existe pero **no se renderiza** (reseñas
inventadas); para activarla, importarla y añadirla en `page.tsx`.

## La reserva

```
components/mauri/BookingSection.tsx      <- wrapper: banda azul de contraste
  └─ components/booking/BookingFlow.tsx  <- estado de los 2 pasos
       ├─ BookingStep1_SelectSessions    <- calendario + resumen
       │    └─ components/trainer/calendar/*   <- AvailabilityCalendar y vistas
       └─ BookingStep2_ContactForm       <- datos del cliente
```

`BookingSection` solo aporta el fondo: el encabezado y el padding interiores los
pone `BookingStep1`/`BookingStep2`. Las franjas de aire del wrapper llevan
`bg-gray-50/50` a propósito, para igualar el velo semitransparente que pinta
`BookingStep1` encima y que la banda quede de un solo tono.

`BookingStep2` tiene `bg-white` **opaco**, así que en el paso 2 la banda azul
solo se ve como un marco fino arriba y abajo.

## Las dos APIs

| | `GET /api/availability` | `POST /api/reservations` |
|---|---|---|
| Qué hace | devuelve los huecos que el calendario pinta | crea las reservas |
| Cliente Supabase | `getSupabaseServerClient()` | `getSupabaseServerClient()` |
| Regla de disponibilidad | `isSlotOpen()` | `isSlotOpen()` |

**Las dos tienen que usar el mismo cliente y el mismo predicado.** Cuando
divergieron, el calendario ofrecía huecos que la reserva rechazaba. La regla vive
en un único sitio, `lib/availability/slot-status.ts`, justamente para que no
pueda volver a pasar.

`isSlotOpen()` es deliberadamente permisivo con lo desconocido: si `status` viene
vacío o con un valor que no reconoce, considera el hueco abierto. Así un cambio
de esquema deja el calendario como está en vez de vaciarlo entero. Si se añade un
estado nuevo que significa "ocupado", hay que meterlo en `CLOSED_STATUSES`.

### Qué filtra el GET antes de devolver

1. `isSlotOpen()` — fuera `full`/`cancelled` y fuera los llenos por capacidad
2. cruce con `reservations` — fuera los que ya tienen una reserva no cancelada

El segundo filtro existe porque `current_bookings` no se actualizaba y un hueco
ya reservado se volvía a ofrecer. Ahora el POST sí lo incrementa, pero el cruce
se queda como red de seguridad.

### Qué hace el POST

1. Resuelve `trainer_id` (acepta slug o UUID)
2. Busca el hueco por fecha y compara la hora normalizada a `HH:MM`
   (`17:00` y `17:00:00` son la misma hora)
3. **Sin `.single()`**: la tabla admite varios huecos a la misma hora con distinto
   `class_type`, y `.single()` reventaba dando un "no disponible" engañoso
4. Comprueba que no haya ya una reserva viva sobre ese hueco
5. Inserta en `reservations` con `status = pending_confirmation` y `price` del
   servidor (ver `docs/DATABASE.md` para las columnas reales)
6. Marca el hueco `pending` e incrementa `current_bookings` — no es crítico, si
   falla se registra pero la reserva ya está creada

Códigos: `404` el horario no existe, `409` acaban de cogerlo, `500` fallo al
insertar (con `detail` = mensaje de Postgres).

## Después de la reserva: confirmación manual (Fase C)

La reserva nace en `pending_confirmation` y su hueco en `pending` (ya no se
ofrece). El entrenador, desde `/dashboard/reservas`, o la confirma (→
`confirmed`, hueco `full`) o marca que no consiguió pista (→ `needs_reschedule`,
hueco `available` otra vez). Detalle en `docs/estado-desarrollo.md` y
`migrations/003_reservation_confirmation_flow.sql`.

`reservations.price` lo calcula el servidor en `lib/reservations/pricing.ts`
(misma regla que el widget). El total que muestra el navegador es informativo;
lo que se guarda no depende de él.
