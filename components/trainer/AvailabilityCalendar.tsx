'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface AvailabilitySlot {
  id: string
  session_date: string
  start_time: string
  end_time: string
  max_capacity: number
  current_bookings: number
}

interface AvailabilityCalendarProps {
  trainerId: string
  onDateSelect?: (date: string, time: string) => void
}

export default function AvailabilityCalendar({
  trainerId,
  onDateSelect,
}: AvailabilityCalendarProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

        if (!response.ok) throw new Error('Failed to load availability')

        const data = await response.json()
        if (data.success && Array.isArray(data.data)) {
          setSlots(data.data)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading availability')
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.1 },
    },
  }

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.85, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: { duration: 0.4, ease: 'easeOut' },
    },
  }

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className="inline-block text-5xl mb-4">
          ⏳
        </motion.div>
        <p className="text-lg text-slate-600 font-medium">Loading availability...</p>
      </div>
    )
  }

  if (error) {
    return (
      <motion.div className="rounded-2xl border-2 border-red-300 bg-red-50 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <p className="text-red-700 font-semibold text-lg">❌ {error}</p>
      </motion.div>
    )
  }

  return (
    <motion.div className="space-y-12" variants={containerVariants} initial="hidden" animate="visible">
      {/* Select Date Section */}
      <div>
        <h3 className="text-2xl font-bold text-slate-900 mb-6">Select a Date</h3>
        <motion.div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <AnimatePresence>
            {dates.map((dateString, i) => {
              const dateObj = parseDate(dateString)
              const label = dateObj.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })
              const isSelected = selectedDate === dateString

              return (
                <motion.button
                  key={dateString}
                  variants={cardVariants}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedDate(dateString)
                    setSelectedTime(null)
                    onDateSelect?.(dateString, '')
                  }}
                  className={`p-4 rounded-2xl font-bold text-lg transition-all shadow-sm border-2 ${
                    isSelected
                      ? 'bg-cyan-600 text-white border-cyan-700 shadow-lg'
                      : 'bg-white text-slate-900 border-slate-200 hover:border-cyan-400 hover:shadow-md'
                  }`}
                >
                  <div className="text-sm opacity-75">{label.split(' ').slice(0, 1).join(' ')}</div>
                  <div className="text-xl font-bold">{label.split(' ').slice(1).join(' ')}</div>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Select Time Section */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <h3 className="text-2xl font-bold text-slate-900 mb-6">
              Select a Time for{' '}
              <span className="text-cyan-600">
                {parseDate(selectedDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </h3>

            {selectedDateSlots.length === 0 ? (
              <motion.p className="text-lg text-slate-600 font-medium" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                No available times on this date
              </motion.p>
            ) : (
              <motion.div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                <AnimatePresence>
                  {selectedDateSlots.map((slot, i) => {
                    const isAvailable = slot.current_bookings < slot.max_capacity
                    const isSelected = selectedTime === slot.start_time

                    return (
                      <motion.button
                        key={slot.id}
                        variants={cardVariants}
                        whileHover={isAvailable ? { scale: 1.08, y: -2 } : {}}
                        whileTap={isAvailable ? { scale: 0.96 } : {}}
                        onClick={() => {
                          if (isAvailable) {
                            setSelectedTime(slot.start_time)
                            onDateSelect?.(selectedDate, slot.start_time)
                          }
                        }}
                        disabled={!isAvailable}
                        className={`p-4 rounded-2xl font-bold text-lg transition-all shadow-sm border-2 ${
                          isSelected
                            ? 'bg-cyan-600 text-white border-cyan-700 shadow-lg'
                            : isAvailable
                            ? 'bg-white text-slate-900 border-cyan-300 hover:bg-cyan-50 hover:shadow-md'
                            : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50'
                        }`}
                      >
                        <div>{slot.start_time}</div>
                        {!isAvailable && <div className="text-xs font-semibold mt-1">Full</div>}
                      </motion.button>
                    )
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection Summary */}
      <AnimatePresence>
        {selectedDate && selectedTime && (
          <motion.div
            className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-3xl p-8 border-2 border-cyan-300 shadow-md"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-2xl font-bold text-slate-900">
              ✅ <span className="text-cyan-600">Selected:</span>{' '}
              {parseDate(selectedDate).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}{' '}
              <span className="text-cyan-600">at {selectedTime}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
