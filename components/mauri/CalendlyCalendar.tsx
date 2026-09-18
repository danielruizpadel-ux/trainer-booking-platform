'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface AvailabilitySlot {
  id: string
  session_date: string
  start_time: string
  end_time: string
  current_bookings: number
  max_capacity: number
}

interface CalendlyCalendarProps {
  trainerId: string
  onDateSelect: (date: string, time: string) => void
}

export default function CalendlyCalendar({
  trainerId,
  onDateSelect,
}: CalendlyCalendarProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)

  useEffect(() => {
    const loadSlots = async () => {
      try {
        const today = new Date()
        const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)

        const startDate = today.toISOString().split('T')[0]
        const endDate = twoWeeksLater.toISOString().split('T')[0]

        const response = await fetch(
          `/api/availability?trainer_id=${trainerId}&start_date=${startDate}&end_date=${endDate}`
        )

        const data = await response.json()
        if (data.success && Array.isArray(data.data)) {
          setSlots(data.data)
          // Select first available date by default
          const firstDate = data.data[0]?.session_date
          if (firstDate) {
            setSelectedDate(firstDate)
          }
        }
      } catch (error) {
        console.error('Error loading availability:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSlots()
  }, [trainerId])

  const parseDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  // Group slots by date
  const slotsByDate = slots.reduce(
    (acc, slot) => {
      if (!acc[slot.session_date]) {
        acc[slot.session_date] = []
      }
      acc[slot.session_date].push(slot)
      return acc
    },
    {} as Record<string, AvailabilitySlot[]>
  )

  const dates = Object.keys(slotsByDate).sort()
  const selectedDateSlots = selectedDate ? slotsByDate[selectedDate] : []

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, linear: true }}
          className="inline-block text-4xl mb-4"
        >
          ⏳
        </motion.div>
        <p className="text-gray-600 font-medium">Cargando disponibilidad...</p>
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Dates Grid */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-6">Selecciona una fecha</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <AnimatePresence>
            {dates.map((dateStr) => {
              const dateObj = parseDate(dateStr)
              const label = dateObj.toLocaleDateString('es-ES', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })
              const isSelected = selectedDate === dateStr

              return (
                <motion.button
                  key={dateStr}
                  onClick={() => {
                    setSelectedDate(dateStr)
                    setSelectedTime(null)
                  }}
                  className={`p-4 rounded-lg font-semibold transition-all border-2 ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-700 shadow-lg'
                      : 'bg-white text-gray-900 border-gray-200 hover:border-blue-600 hover:shadow-md'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="text-sm opacity-75">{label.split(' ')[0]}</div>
                  <div className="text-lg font-bold">{label.split(' ').slice(1).join(' ')}</div>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Times Grid */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              Horarios disponibles
            </h3>

            {selectedDateSlots.length === 0 ? (
              <p className="text-gray-600 text-center py-8">
                No hay horarios disponibles en esta fecha
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {selectedDateSlots.map((slot) => {
                  const isAvailable =
                    slot.current_bookings < slot.max_capacity
                  const isSelected = selectedTime === slot.start_time

                  return (
                    <motion.button
                      key={slot.id}
                      onClick={() => {
                        if (isAvailable) {
                          setSelectedTime(slot.start_time)
                          onDateSelect(selectedDate, slot.start_time)
                        }
                      }}
                      disabled={!isAvailable}
                      className={`p-3 rounded-lg font-semibold transition-all text-sm border-2 ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                          : isAvailable
                          ? 'bg-white text-gray-900 border-gray-200 hover:border-blue-600 hover:shadow-md'
                          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-50'
                      }`}
                      whileHover={isAvailable ? { scale: 1.08 } : {}}
                      whileTap={isAvailable ? { scale: 0.95 } : {}}
                    >
                      <div>{slot.start_time}</div>
                      {isSelected && <div className="text-xs mt-1">✓</div>}
                      {!isAvailable && <div className="text-xs">Lleno</div>}
                    </motion.button>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection Summary */}
      <AnimatePresence>
        {selectedDate && selectedTime && (
          <motion.div
            className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6 border-2 border-blue-200"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <p className="text-lg font-semibold text-gray-900">
              ✓ Sesión seleccionada:{' '}
              <span className="text-blue-600">
                {parseDate(selectedDate).toLocaleDateString('es-ES', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                a las {selectedTime}
              </span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
