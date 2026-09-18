'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CalendarNavbar from './CalendarNavbar'
import MonthView from './MonthView'
import WeekView from './WeekView'
import DayView from './DayView'
import DiscountSummary from './DiscountSummary'
import SessionSelector from './SessionSelector'
import TimePickerDropdown from './TimePickerDropdown'

type ViewType = 'month' | 'week' | 'day'

interface AvailabilitySlot {
  id: string
  session_date: string
  start_time: string
  end_time: string
  current_bookings: number
  max_capacity: number
}

interface Session {
  date: string
  time: string
}

interface AvailabilityCalendarProps {
  trainerId: string
  onDateSelect: (date: string, time: string) => void
  pricePerSession?: number
}

export default function AvailabilityCalendar({
  trainerId,
  onDateSelect,
  pricePerSession = 300,
}: AvailabilityCalendarProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<ViewType>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSessions, setSelectedSessions] = useState<Session[]>([])
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [showTimePickerForDate, setShowTimePickerForDate] = useState<string | null>(null)

  useEffect(() => {
    const loadSlots = async () => {
      try {
        if (!trainerId) {
          setError('Trainer ID not available')
          setIsLoading(false)
          return
        }

        console.log('📅 Loading availability for trainer:', trainerId)
        const today = new Date()
        const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)

        const startDate = today.toISOString().split('T')[0]
        const endDate = twoWeeksLater.toISOString().split('T')[0]

        const url = `/api/availability?trainer_id=${trainerId}&start_date=${startDate}&end_date=${endDate}`
        console.log('📡 Fetching:', url)

        const response = await fetch(url)

        if (!response.ok) {
          const errorData = await response.json()
          console.error('❌ API Error:', errorData)
          setError(`API Error: ${errorData.error || response.statusText}`)
          setIsLoading(false)
          return
        }

        const data = await response.json()
        console.log('📦 Response:', data)

        if (!data.success) {
          console.error('❌ Request failed:', data.error)
          setError(data.error || 'Failed to load availability')
          setIsLoading(false)
          return
        }

        if (!Array.isArray(data.data)) {
          console.error('❌ Invalid data format:', data.data)
          setError('Invalid data format from server')
          setIsLoading(false)
          return
        }

        if (data.data.length === 0) {
          console.warn('⚠️ No slots available')
          setError('No disponibilidad para estas fechas')
          setIsLoading(false)
          return
        }

        console.log(`✅ Loaded ${data.data.length} availability slots`)
        setSlots(data.data)
        setError(null)
      } catch (error) {
        console.error('❌ Error loading availability:', error)
        setError(error instanceof Error ? error.message : 'Failed to load availability')
      } finally {
        setIsLoading(false)
      }
    }

    loadSlots()
  }, [trainerId])

  const availableDates = new Set(slots.map((slot) => slot.session_date))

  const handleToggleDateSelection = (dateStr: string) => {
    const newDates = new Set(selectedDates)
    if (newDates.has(dateStr)) {
      newDates.delete(dateStr)
      // Remove all sessions for this date
      setSelectedSessions((prev) => prev.filter((s) => s.date !== dateStr))
    } else {
      newDates.add(dateStr)
      // Open time picker for this date
      setShowTimePickerForDate(dateStr)
    }
    setSelectedDates(newDates)
  }

  const handleToggleTime = (date: string, time: string) => {
    setSelectedSessions((prev) => {
      const exists = prev.some((s) => s.date === date && s.time === time)
      if (exists) {
        return prev.filter((s) => !(s.date === date && s.time === time))
      } else {
        return [...prev, { date, time }]
      }
    })
  }

  const handleRemoveSession = (date: string, time: string) => {
    setSelectedSessions((prev) => prev.filter((s) => !(s.date === date && s.time === time)))
    // If no sessions left for this date, remove from selected dates
    const remainingForDate = selectedSessions.filter((s) => s.date === date && !(s.date === date && s.time === time))
    if (remainingForDate.length === 0) {
      const newDates = new Set(selectedDates)
      newDates.delete(date)
      setSelectedDates(newDates)
    }
  }

  const handleConfirmReservation = () => {
    if (selectedSessions.length > 0) {
      console.log('Confirmar reserva de', selectedSessions.length, 'sesiones')
      const firstSession = selectedSessions[0]
      onDateSelect(firstSession.date, firstSession.time)
    }
  }

  const getSelectedTimesForDate = (date: string): Set<string> => {
    return new Set(selectedSessions.filter((s) => s.date === date).map((s) => s.time))
  }

  const getSlotsForDate = (date: string): AvailabilitySlot[] => {
    return slots.filter((slot) => slot.session_date === date)
  }

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

  if (error) {
    return (
      <motion.div
        className="text-center py-12 bg-red-50 rounded-lg border-2 border-red-300 p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <p className="text-red-700 font-semibold text-lg mb-2">❌ Error</p>
        <p className="text-red-600 mb-4">{error}</p>
        <p className="text-sm text-red-600 mb-4">Trainer ID: {trainerId}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
        >
          Reintentar
        </button>
      </motion.div>
    )
  }

  return (
    <div className="space-y-0">
      {/* Navbar */}
      <CalendarNavbar
        currentDate={currentDate}
        currentView={currentView}
        onDateChange={setCurrentDate}
        onViewChange={setCurrentView}
        availableDates={availableDates}
      />

      {/* Main Content */}
      <motion.div
        className="py-8 px-4 sm:px-6 lg:px-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Calendar View */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100/50 p-8 hover:shadow-md transition-shadow">
                {currentView === 'month' && (
                  <MonthView
                    currentDate={currentDate}
                    slots={slots}
                    selectedDates={selectedDates}
                    onDateToggle={handleToggleDateSelection}
                    onDateSelect={(dateStr) => {
                      setSelectedDate(dateStr)
                      setCurrentView('day')
                    }}
                    onNavigate={setCurrentDate}
                  />
                )}

                {currentView === 'week' && (
                  <WeekView
                    currentDate={currentDate}
                    slots={slots}
                    selectedDate={selectedDate || undefined}
                    selectedDates={selectedDates}
                    onDateToggle={handleToggleDateSelection}
                    onDateSelect={(dateStr) => {
                      setSelectedDate(dateStr)
                      setCurrentView('day')
                    }}
                    onNavigate={setCurrentDate}
                  />
                )}

                {currentView === 'day' && (
                  <DayView
                    selectedDate={selectedDate}
                    slots={slots}
                    selectedTime={undefined}
                    onTimeSelect={(time) => {
                      if (selectedDate) {
                        handleToggleTime(selectedDate, time)
                      }
                    }}
                  />
                )}
              </div>

              {/* Session Selector */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100/50 p-8">
                <SessionSelector sessions={selectedSessions} onRemove={handleRemoveSession} />
              </div>
            </div>

            {/* Discount Summary Sidebar */}
            <div>
              <DiscountSummary
                sessions={selectedSessions}
                pricePerSession={pricePerSession}
                onConfirm={handleConfirmReservation}
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Time Picker Dropdown Modal */}
      <AnimatePresence>
        {showTimePickerForDate && (
          <TimePickerDropdown
            date={showTimePickerForDate}
            slots={getSlotsForDate(showTimePickerForDate)}
            selectedTimes={getSelectedTimesForDate(showTimePickerForDate)}
            onToggleTime={handleToggleTime}
            onClose={() => setShowTimePickerForDate(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
