import type { TrainerReservation } from '@/lib/reservations/queries'
import { formatDayShort, formatDuration, formatTime } from '@/lib/reservations/format'
import { StatusBadge } from './StatusBadge'
import { ReservationRowActions } from './ReservationRowActions'

interface ReservationMobileCardProps {
  reservation: TrainerReservation
  highlighted?: boolean
}

/** Una reserva como tarjeta: la misma información que la fila de la tabla, apilada. */
export function ReservationMobileCard({ reservation: r, highlighted = false }: ReservationMobileCardProps) {
  const duration = formatDuration(r.slot?.start_time, r.slot?.end_time)

  return (
    <article
      data-reservation-id={r.id}
      className={`bg-white rounded-2xl p-5 flex flex-col gap-4 ring-1 transition-all duration-150 ${
        highlighted ? 'ring-2 ring-blue-500' : 'ring-gray-200/70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900">{r.client_name}</p>
          <p className="mt-1 text-sm text-gray-900">
            {r.slot ? `${formatDayShort(r.slot.session_date)} · ${formatTime(r.slot.start_time)}` : 'Hueco no disponible'}
            {duration && <span className="text-gray-500"> · {duration}</span>}
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-gray-400">Email</dt>
        <dd className="min-w-0">
          <a href={`mailto:${r.client_email}`} className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline break-all">
            {r.client_email}
          </a>
        </dd>
        {r.client_phone && (
          <>
            <dt className="text-gray-400">Teléfono</dt>
            <dd>
              <a href={`tel:${r.client_phone}`} className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline">
                {r.client_phone}
              </a>
            </dd>
          </>
        )}
        <dt className="text-gray-400">Precio</dt>
        <dd className="font-semibold text-gray-900 tabular-nums">
          {r.price !== null && r.price !== undefined ? `RM ${r.price}` : <span className="text-gray-400 font-medium">—</span>}
        </dd>
      </dl>

      <div className="border-t border-gray-100 pt-4">
        <ReservationRowActions reservation={r} />
      </div>
    </article>
  )
}
