'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import MonthView from './MonthView'
import WeekView from './WeekView'
import DayView from './DayView'
import CalendarNavbar from './CalendarNavbar'
import TimePickerDropdown from './TimePickerDropdown'
import { toDateStr, getMonday, isPastMalaysiaSession } from '@/lib/dateUtils'

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
  currentView: ViewType
  currentDate: Date
  onViewChange: (view: ViewType) => void
  onDateChange: (date: Date) => void
  /** Estado controlado por el padre: única fuente de verdad de las sesiones. */
  selectedSessions: Session[]
  onSessionChange: (sessions: Session[]) => void
  /** Duración de la clase (60/90): las horas libres dependen de ella (migración 007) */
  durationMinutes?: number
}

export default function AvailabilityCalendar({
  trainerId,
  currentView,
  currentDate,
  onViewChange,
  onDateChange,
  selectedSessions,
  onSessionChange,
  durationMinutes,
}: AvailabilityCalendarProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pickerDate, setPickerDate] = useState<string | null>(null)

  // Rango visible: mes/semana actual con margen, para que al navegar haya datos.
  const range = useMemo(() => {
    let from: Date
    let to: Date
    if (currentView === 'week') {
      from = getMonday(currentDate)
      to = new Date(from)
      to.setDate(to.getDate() + 6)
    } else if (currentView === 'day') {
      from = new Date(currentDate)
      to = new Date(currentDate)
    } else {
      from = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      to = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
    }
    from.setDate(from.getDate() - 7)
    to.setDate(to.getDate() + 7)
    return { start: toDateStr(from), end: toDateStr(to) }
  }, [currentDate, currentView])

  useEffect(() => {
    let cancelled = false

    const loadSlots = async () => {
      if (!trainerId) {
        setError('No se ha indicado el entrenador')
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const durationParam = durationMinutes ? `&duration=${durationMinutes}` : ''
        const url = `/api/availability?trainer_id=${trainerId}&start_date=${range.start}&end_date=${range.end}${durationParam}`
        const response = await fetch(url)
        const data = await response.json().catch(() => null)

        if (cancelled) return

        if (!response.ok || !data?.success || !Array.isArray(data.data)) {
          setSlots([])
          setError(data?.error || 'No se pudo cargar la disponibilidad')
          return
        }

        setSlots(data.data)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setSlots([])
          setError(err instanceof Error ? err.message : 'No se pudo cargar la disponibilidad')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadSlots()
    return () => {
      cancelled = true
    }
  }, [trainerId, range.start, range.end, durationMinutes])

  const visibleSlots = useMemo(
    () => slots.filter((slot) => !isPastMalaysiaSession(slot.session_date, slot.start_time)),
    [slots]
  )
  const availableDates = useMemo(() => new Set(visibleSlots.map((s) => s.session_date)), [visibleSlots])

  const selectedDates = useMemo(
    () => new Set(selectedSessions.map((s) => s.date)),
    [selectedSessions]
  )

  const sessionCountByDate = useMemo(
    () =>
      selectedSessions.reduce<Record<string, number>>((acc, s) => {
        acc[s.date] = (acc[s.date] || 0) + 1
        return acc
      }, {}),
    [selectedSessions]
  )

  const handleToggleTime = (date: string, time: string) => {
    if (isPastMalaysiaSession(date, time)) return
    const exists = selectedSessions.some((s) => s.date === date && s.time === time)
    if (exists) {
      onSessionChange(selectedSessions.filter((s) => !(s.date === date && s.time === time)))
    } else {
      onSessionChange([...selectedSessions, { date, time }])
    }
  }

  const openPickerFor = (dateStr: string) => setPickerDate(dateStr)

  const selectedTimesFor = (date: string) =>
    new Set(selectedSessions.filter((s) => s.date === date).map((s) => s.time))

  const currentDateStr = toDateStr(currentDate)

  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6">
      {/* ÚNICA navbar del calendario — vive dentro de la tarjeta */}
      <CalendarNavbar
        currentDate={currentDate}
        currentView={currentView}
        onDateChange={onDateChange}
        onViewChange={onViewChange}
        availableDates={availableDates}
      />

      {isLoading ? (
        <div className="py-16 text-center">
          <div className="inline-block h-8 w-8 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
          <p className="mt-3 text-sm text-gray-500">Cargando disponibilidad…</p>
        </div>
      ) : error ? (
        <div className="py-12 text-center">
          <p className="text-gray-900 font-medium">No hay disponibilidad para este periodo</p>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
          <button
            onClick={() => onDateChange(new Date())}
            className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            Volver a hoy
          </button>
        </div>
      ) : (
        <>
          {currentView === 'month' && (
            <MonthView
              currentDate={currentDate}
              slots={visibleSlots}
              selectedDates={selectedDates}
              sessionCountByDate={sessionCountByDate}
              onDateToggle={openPickerFor}
              onDateSelect={openPickerFor}
            />
          )}

          {currentView === 'week' && (
            <WeekView
              currentDate={currentDate}
              slots={visibleSlots}
              selectedDates={selectedDates}
              sessionCountByDate={sessionCountByDate}
              onDateToggle={openPickerFor}
              onDateSelect={openPickerFor}
            />
          )}

          {currentView === 'day' && (
            <DayView
              selectedDate={currentDateStr}
              slots={visibleSlots}
              selectedTimes={selectedTimesFor(currentDateStr)}
              onTimeSelect={(time) => handleToggleTime(currentDateStr, time)}
            />
          )}

          {currentView !== 'day' && (
            <p className="mt-5 text-xs text-gray-400 text-center">
              Toca un día disponible para elegir las horas
            </p>
          )}
        </>
      )}

      {/* Modal de horas */}
      <AnimatePresence>
        {pickerDate && (
          <TimePickerDropdown
            date={pickerDate}
            slots={visibleSlots.filter((s) => s.session_date === pickerDate)}
            selectedTimes={selectedTimesFor(pickerDate)}
            onToggleTime={handleToggleTime}
            onClose={() => setPickerDate(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
