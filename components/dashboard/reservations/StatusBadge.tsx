import { RESERVATION_STATUS, isRescheduleProposed, reservationStatusLabel } from '@/lib/reservations/status'
import { reservationTab } from '@/lib/reservations/format'

const TONES = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-600',
} as const

/** Etiqueta corta para la tabla; el detalle largo va en `title`. */
function shortLabel(status: string | null): string {
  const tab = reservationTab(status)
  if (isRescheduleProposed(status)) return 'Propuesta enviada'
  if (tab === 'pending') return 'Pendiente'
  if (tab === 'confirmed') return 'Confirmada'
  const value = (status ?? '').trim().toLowerCase()
  return value === RESERVATION_STATUS.NEEDS_RESCHEDULE ? 'Sin pista' : 'Cancelada'
}

/** Pendiente = ámbar, confirmada = verde, cancelada/sin pista = gris. */
export function StatusBadge({ status }: { status: string | null }) {
  return (
    <span
      title={reservationStatusLabel(status)}
      className={`h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center whitespace-nowrap ${TONES[reservationTab(status)]}`}
    >
      {shortLabel(status)}
    </span>
  )
}
