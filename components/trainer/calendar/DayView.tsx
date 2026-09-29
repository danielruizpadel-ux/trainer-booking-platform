'use client'

import { parseDateStr, shortTime } from '@/lib/dateUtils'

interface AvailabilitySlot {
  id: string
  session_date: string
  start_time: string
  current_bookings: number
  max_capacity: number
}

interface DayViewProps {
  selectedDate: string | null
  slots: AvailabilitySlot[]
  selectedTimes?: Set<string>
  onTimeSelect: (time: string) => void
  /** Horas que pisarían otra clase ya elegida (misma regla que el servidor). */
  isBlocked?: (time: string) => boolean
}

export default function DayView({
  selectedDate,
  slots,
  selectedTimes = new Set(),
  onTimeSelect,
  isBlocked,
}: DayViewProps) {
  if (!selectedDate) {
    return (
      <div className="py-16 text-center text-sm text-gray-500">
        Selecciona un día para ver los horarios disponibles
      </div>
    )
  }

  const daySlots = slots.filter((slot) => slot.session_date === selectedDate)

  const formattedDate = parseDateStr(selectedDate).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  if (daySlots.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-900 font-medium capitalize">{formattedDate}</p>
        <p className="mt-1 text-sm text-gray-500">No hay horarios disponibles este día</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900 capitalize">{formattedDate}</h3>
        <p className="text-sm text-gray-500">
          {daySlots.length} horario{daySlots.length > 1 ? 's' : ''} disponible
          {daySlots.length > 1 ? 's' : ''}
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
        {daySlots.map((slot) => {
          const isSelected = selectedTimes.has(slot.start_time)
          const blocked = !isSelected && (isBlocked?.(slot.start_time) ?? false)
          const isAvailable = slot.current_bookings < slot.max_capacity && !blocked

          return (
            <button
              // slot.id es la VENTANA (migración 007): varios inicios la comparten.
              key={`${slot.id}:${slot.start_time}`}
              onClick={() => isAvailable && onTimeSelect(slot.start_time)}
              disabled={!isAvailable}
              aria-pressed={isSelected}
              title={blocked ? 'Se solapa con otra clase que ya has elegido' : undefined}
              className={[
                'py-3 rounded-xl text-sm font-medium transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                isSelected
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700'
                  : isAvailable
                  ? 'bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/60'
                  : 'bg-gray-50 text-gray-300 cursor-not-allowed line-through',
              ].join(' ')}
            >
              {shortTime(slot.start_time)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
