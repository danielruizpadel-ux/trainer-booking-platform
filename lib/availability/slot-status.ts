/**
 * Única fuente de verdad sobre si un hueco se puede reservar.
 *
 * El calendario (GET /api/availability) y la reserva (POST /api/reservations)
 * TIENEN que usar este mismo predicado. Cuando cada uno aplicaba su propia
 * regla, el calendario pintaba huecos que la reserva luego rechazaba con
 * "Slot no disponible".
 */

export interface AvailabilitySlotLike {
  id?: string
  status?: string | null
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
 */
export function isSlotOpen(slot: AvailabilitySlotLike): boolean {
  const status = (slot.status ?? '').toString().trim().toLowerCase()
  if (CLOSED_STATUSES.has(status)) return false

  const booked = slot.current_bookings
  const capacity = slot.max_capacity
  if (typeof booked === 'number' && typeof capacity === 'number' && capacity > 0 && booked >= capacity) {
    return false
  }

  return true
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
