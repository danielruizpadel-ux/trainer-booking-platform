import { RESERVATION_STATUS, isRescheduleProposed, reservationStatusLabel } from '@/lib/reservations/status'
import { reservationTab } from '@/lib/reservations/format'

const TONES = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-600',
} as const

type Locale = 'es' | 'en'

const LABELS: Record<Locale, Record<'proposed' | 'pending' | 'confirmed' | 'no_court' | 'cancelled', { short: string; long: string }>> = {
  es: {
    proposed: { short: 'Propuesta enviada', long: '' },
    pending: { short: 'Pendiente', long: '' },
    confirmed: { short: 'Confirmada', long: '' },
    no_court: { short: 'Sin pista', long: '' },
    cancelled: { short: 'Cancelada', long: '' },
  },
  en: {
    proposed: { short: 'Proposal sent', long: 'New time proposed, waiting for the client' },
    pending: { short: 'Pending', long: 'Waiting for your confirmation' },
    confirmed: { short: 'Confirmed', long: 'Confirmed' },
    no_court: { short: 'No court', long: 'No court available: the client needs to pick another time' },
    cancelled: { short: 'Cancelled', long: 'Cancelled' },
  },
}

function statusKey(status: string | null): keyof (typeof LABELS)['en'] {
  const tab = reservationTab(status)
  if (isRescheduleProposed(status)) return 'proposed'
  if (tab === 'pending') return 'pending'
  if (tab === 'confirmed') return 'confirmed'
  const value = (status ?? '').trim().toLowerCase()
  return value === RESERVATION_STATUS.NEEDS_RESCHEDULE ? 'no_court' : 'cancelled'
}

/**
 * Pendiente = ámbar, confirmada = verde, cancelada/sin pista = gris.
 * `locale="en"` en la tabla de reservas (dashboard en inglés); los diálogos
 * que aún están en español usan el valor por defecto.
 */
export function StatusBadge({ status, locale = 'es' }: { status: string | null; locale?: Locale }) {
  const label = LABELS[locale][statusKey(status)]
  return (
    <span
      title={locale === 'es' ? reservationStatusLabel(status) : label.long}
      className={`h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center whitespace-nowrap ${TONES[reservationTab(status)]}`}
    >
      {label.short}
    </span>
  )
}
