/**
 * `isSlotOpen` decide si una VENTANA está abierta administrativamente
 * (`status` no es `pending`/`full`/`cancelled`/`blocked`/…). NO decide por sí
 * sola si una reserva concreta cabe dentro — eso es de `bookableStarts`/
 * `fitsInWindow` (lib/availability/windows.ts), que miran el rango real pedido
 * contra las reservas vivas de la ventana. Todo llamador que necesite saber
 * "¿cabe esta clase aquí?" tiene que encadenar los dos: primero `isSlotOpen`
 * (¿la ventana está abierta?) y luego `bookableStarts`/`fitsInWindow` (¿cabe
 * el rango pedido?) — así lo hacen ya `lib/availability/booking.ts` y
 * `loadOwnedOpenWindow` (lib/reservations/slots.ts). Usar solo `isSlotOpen`
 * como si fuera la respuesta completa de disponibilidad es un error de uso.
 *
 * El calendario (GET /api/availability) y la reserva (POST /api/reservations)
 * TIENEN que encadenar los dos igual, con el mismo resultado. Cuando cada uno
 * aplicaba su propia regla, el calendario pintaba huecos que la reserva luego
 * rechazaba con "Slot no disponible".
 */

export interface AvailabilitySlotLike {
  id?: string
  status?: string | null
  /**
   * Heredados del modelo pre-007 (una fila = una clase). `isSlotOpen` ya no
   * los consulta (ver más abajo) — se mantienen en la fila y en este tipo
   * porque `current_bookings` lo sigue escribiendo `refreshWindowStatus`
   * (lib/reservations/slots.ts) para inspección/otros usos, no porque decidan
   * apertura.
   */
  current_bookings?: number | null
  max_capacity?: number | null
}

/**
 * Estados que significan "este hueco ya no se puede coger".
 *
 * `pending` está aquí a propósito y NO se apoya en el fallback permisivo de
 * abajo: es un valor conocido (hay una reserva sin confirmar encima, ver
 * migrations/003_reservation_confirmation_flow.sql) y tiene que bloquear.
 */
const CLOSED_STATUSES = new Set([
  'pending',
  'full',
  'cancelled',
  'canceled',
  'booked',
  'unavailable',
  'blocked',
])

/**
 * Deliberadamente permisivo con lo desconocido: si `status` viene vacío o con
 * un valor que no conocemos, el hueco se considera abierto. Así, si la columna
 * cambia de nombre o de valores, el calendario se queda como está en lugar de
 * vaciarse entero.
 *
 * 21/09/2026 (bug real, diagnosticado junto con Codex): antes, esta función
 * también cerraba la ventana entera si `current_bookings >= max_capacity`. El
 * generador crea TODA ventana con `max_capacity: 1` sin importar su anchura
 * (lib/availability/generate.ts), así que una ventana de 8 horas con UNA sola
 * reserva enganchada directamente a ella (el camino normal desde la migración
 * 007: `availability_slot_id` = la ventana entera) se ocultaba entera de
 * `GET /api/availability`, `POST /api/reservations` y el calendario del
 * dashboard, aunque le quedaran horas libres reales y su `status` siguiera en
 * `available`. La propia migración 007 ya dejaba escrito que `full` debe
 * significar "no cabe ningún inicio para la duración mínima", recalculado por
 * `refreshWindowStatus` (lib/reservations/slots.ts) — la apertura
 * administrativa de una ventana es cosa de `status`, y si de verdad cabe una
 * clase concreta lo decide `bookableStarts`/`fitsInWindow`
 * (lib/availability/windows.ts), nunca un contador de capacidad por fila.
 * `current_bookings`/`max_capacity` se dejan sin usar aquí a propósito (no se
 * borran de la base ni del tipo).
 */
export function isSlotOpen(slot: AvailabilitySlotLike): boolean {
  const status = (slot.status ?? '').toString().trim().toLowerCase()
  return !CLOSED_STATUSES.has(status)
}

/** Estados de reserva que NO ocupan el hueco: el entrenador lo ha liberado. */
const RELEASING_RESERVATION_STATUSES = new Set(['cancelled', 'canceled', 'needs_reschedule'])

/**
 * Estados de reserva que ocupan el hueco. Una cancelada lo libera, y una
 * `needs_reschedule` también: el entrenador no consiguió pista y el hueco
 * vuelve a ofrecerse mientras el cliente reprograma.
 */
export function reservationHoldsSlot(reservationStatus?: string | null): boolean {
  const status = (reservationStatus ?? '').toString().trim().toLowerCase()
  return !RELEASING_RESERVATION_STATUSES.has(status)
}
