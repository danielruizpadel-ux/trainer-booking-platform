'use client'

import { motion, AnimatePresence } from 'framer-motion'

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
  selectedTime?: string
  onTimeSelect: (time: string) => void
}

export default function DayView({
  selectedDate,
  slots,
  selectedTime,
  onTimeSelect,
}: DayViewProps) {
  if (!selectedDate) {
    return (
      <div className="text-center py-12 text-gray-500">
        Selecciona un día para ver los horarios disponibles
      </div>
    )
  }

  const daySlots = slots.filter((slot) => slot.session_date === selectedDate)

  if (daySlots.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No hay horarios disponibles para este día
      </div>
    )
  }

  const parseDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const date = parseDate(selectedDate)
  const formattedDate = date.toLocaleDateString('es-ES', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={selectedDate}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="space-y-6"
      >
        {/* Date Header */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 capitalize">{formattedDate}</h2>
          <p className="text-gray-600 mt-1">{daySlots.length} horarios disponibles</p>
        </div>

        {/* Time Slots Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {daySlots.map((slot) => {
            const isAvailable = slot.current_bookings < slot.max_capacity
            const isSelected = selectedTime === slot.start_time

            const [hour, minute] = slot.start_time.split(':')
            const displayTime = `${hour}:${minute}`

            return (
              <motion.button
                key={slot.id}
                onClick={() => {
                  if (isAvailable) {
                    onTimeSelect(slot.start_time)
                  }
                }}
                disabled={!isAvailable}
                whileHover={isAvailable ? { scale: 1.05 } : {}}
                whileTap={isAvailable ? { scale: 0.98 } : {}}
                className={`p-4 rounded-lg font-semibold transition-all border-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                    : isAvailable
                    ? 'bg-white text-gray-900 border-gray-200 hover:border-blue-600 hover:shadow-md'
                    : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                }`}
              >
                <div className="text-lg">{displayTime}</div>
                {!isAvailable && <div className="text-xs mt-1">Lleno</div>}
                {isSelected && <div className="text-xs mt-1">✓</div>}
              </motion.button>
            )
          })}
        </div>

        {/* Selection Summary */}
        <AnimatePresence>
          {selectedTime && (
            <motion.div
              className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6 border-2 border-blue-200"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <p className="text-lg font-semibold text-gray-900">
                ✓ Horario seleccionado:{' '}
                <span className="text-blue-600">
                  {formattedDate} a las {selectedTime}
                </span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}
