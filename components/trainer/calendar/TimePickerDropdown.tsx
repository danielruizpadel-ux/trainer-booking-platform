'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

interface AvailabilitySlot {
  id: string
  session_date: string
  start_time: string
  current_bookings: number
  max_capacity: number
}

interface TimePickerDropdownProps {
  date: string
  slots: AvailabilitySlot[]
  selectedTimes: Set<string>
  onToggleTime: (date: string, time: string) => void
  onClose: () => void
}

export default function TimePickerDropdown({
  date,
  slots,
  selectedTimes,
  onToggleTime,
  onClose,
}: TimePickerDropdownProps) {
  const dateSlots = slots.filter((slot) => slot.session_date === date)

  const parseDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const dateObj = parseDate(date)
  const dateLabel = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          Selecciona horas para {dateLabel}
        </h3>

        <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto mb-6">
          {dateSlots.map((slot) => {
            const isSelected = selectedTimes.has(slot.start_time)
            const isAvailable = slot.current_bookings < slot.max_capacity

            return (
              <button
                // slot.id es la VENTANA (migración 007): varios inicios la comparten.
                key={`${slot.id}:${slot.start_time}`}
                onClick={() => onToggleTime(date, slot.start_time)}
                disabled={!isAvailable}
                className={`p-3 rounded-lg font-semibold text-sm transition-all border-2 ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                    : isAvailable
                    ? 'bg-white text-gray-900 border-gray-200 hover:border-blue-600'
                    : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                }`}
              >
                {slot.start_time.slice(0, 5)}
                {isSelected && <div className="text-xs mt-1">✓</div>}
              </button>
            )
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Listo
        </button>
      </motion.div>
    </motion.div>
  )
}
