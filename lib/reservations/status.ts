/**
 * Modelo de estados de reservas y huecos. Una sola lista para el booking
 * público, el dashboard y la regla de disponibilidad.
 * Documentado en migrations/003_reservation_confirmation_flow.sql.
 */

export const RESERVATION_STATUS = {
  /** La crea el booking público; el entrenador aún no ha conseguido pista */
  PENDING_CONFIRMATION: 'pending_confirmation',
  /** El entrenador propuso otro hueco; esperando respuesta del cliente (migración 004) */
  RESCHEDULE_PROPOSED: 'reschedule_proposed',
  /** El entrenador consiguió pista y confirmó la clase */
  CONFIRMED: 'confirmed',
  /** No consiguió pista; el cliente tiene que reprogramar */
  NEEDS_RESCHEDULE: 'needs_reschedule',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
} as const

export type ReservationStatus = (typeof RESERVATION_STATUS)[keyof typeof RESERVATION_STATUS]

export const SLOT_STATUS = {
  AVAILABLE: 'available',
  /** Hay una reserva pending_confirmation encima: no se ofrece */
  PENDING: 'pending',
  /** Ocupado: reserva confirmada o capacidad llena */
  FULL: 'full',
} as const

/**
 * Estados que el dashboard trata como "requieren tu confirmación".
 * `pending` es el valor antiguo: la migración 003 lo convierte, pero hasta que
 * se aplique sigue habiendo filas así y significan lo mismo.
 */
export const AWAITING_CONFIRMATION_STATUSES: ReadonlySet<string> = new Set([
  RESERVATION_STATUS.PENDING_CONFIRMATION,
  'pending',
])

export function isAwaitingConfirmation(status: string | null | undefined): boolean {
  return AWAITING_CONFIRMATION_STATUSES.has((status ?? '').trim().toLowerCase())
}

/** Propuesta de nueva fecha pendiente de que el cliente responda. */
export function isRescheduleProposed(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase() === RESERVATION_STATUS.RESCHEDULE_PROPOSED
}

/** Etiqueta en español para la interfaz del dashboard. */
export function reservationStatusLabel(status: string | null | undefined): string {
  const value = (status ?? '').trim().toLowerCase()
  if (isAwaitingConfirmation(value)) return 'Pendiente de confirmar'
  switch (value) {
    case RESERVATION_STATUS.RESCHEDULE_PROPOSED:
      return 'Propuesta enviada · esperando al cliente'
    case RESERVATION_STATUS.CONFIRMED:
      return 'Confirmada'
    case RESERVATION_STATUS.NEEDS_RESCHEDULE:
      return 'Sin pista · reprogramar'
    case RESERVATION_STATUS.CANCELLED:
    case 'canceled':
      return 'Cancelada'
    case RESERVATION_STATUS.COMPLETED:
      return 'Completada'
    default:
      return value || 'Sin estado'
  }
}
