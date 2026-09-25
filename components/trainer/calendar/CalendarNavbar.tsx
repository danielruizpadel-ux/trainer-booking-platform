'use client'

import { useRef, useState } from 'react'
import MiniCalendarOverlay from './MiniCalendarOverlay'
import { getMonday } from '@/lib/dateUtils'

type ViewType = 'month' | 'week' | 'day'

interface CalendarNavbarProps {
  currentDate: Date
  currentView: ViewType
  onDateChange: (date: Date) => void
  onViewChange: (view: ViewType) => void
  availableDates?: Set<string>
}

const VIEWS: { key: ViewType; label: string }[] = [
  { key: 'month', label: 'Mes' },
  { key: 'week', label: 'Semana' },
  { key: 'day', label: 'Día' },
]

export default function CalendarNavbar({
  currentDate,
  currentView,
  onDateChange,
  onViewChange,
  availableDates,
}: CalendarNavbarProps) {
  const [showMiniCalendar, setShowMiniCalendar] = useState(false)
  const miniTriggerRef = useRef<HTMLButtonElement>(null)

  const shift = (direction: -1 | 1) => {
    const d = new Date(currentDate)
    if (currentView === 'month') d.setMonth(d.getMonth() + direction)
    else if (currentView === 'week') d.setDate(d.getDate() + 7 * direction)
    else d.setDate(d.getDate() + direction)
    onDateChange(d)
  }

  const goToday = () => onDateChange(new Date())

  const periodLabel = () => {
    if (currentView === 'month') {
      return currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    }
    if (currentView === 'week') {
      const monday = getMonday(currentDate)
      const sunday = new Date(monday)
      sunday.setDate(sunday.getDate() + 6)
      const sameMonth = monday.getMonth() === sunday.getMonth()
      const left = monday.toLocaleDateString('es-ES', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
      const right = sunday.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
      return `${left} – ${right}`
    }
    return currentDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const arrowBtn =
    'h-9 w-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-100">
      {/* Izquierda: navegación de periodo */}
      {/* flex-wrap: a 320 px "septiembre de 2026" + flechas + Hoy no caben en una línea. */}
      <div className="flex flex-wrap items-center gap-1 min-w-0">
        <button onClick={() => shift(-1)} className={arrowBtn} aria-label="Periodo anterior">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="relative">
          <button
            ref={miniTriggerRef}
            type="button"
            onClick={() => setShowMiniCalendar((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={showMiniCalendar}
            className="px-2 py-1.5 rounded-lg text-base font-semibold text-gray-900 capitalize hover:bg-gray-100 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Ir a una fecha"
          >
            {periodLabel()}
          </button>
          <MiniCalendarOverlay
            isOpen={showMiniCalendar}
            onClose={() => setShowMiniCalendar(false)}
            triggerRef={miniTriggerRef}
            currentDate={currentDate}
            onDateSelect={(d) => {
              onDateChange(d)
              onViewChange('day')
              setShowMiniCalendar(false)
            }}
            availableDates={availableDates}
          />
        </div>

        <button onClick={() => shift(1)} className={arrowBtn} aria-label="Periodo siguiente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button
          onClick={goToday}
          className="ml-1 px-3 h-9 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Hoy
        </button>
      </div>

      {/* Derecha: selector de vista (segmented control) */}
      <div className="inline-flex items-center gap-0.5 p-1 bg-gray-100 rounded-lg">
        {VIEWS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onViewChange(key)}
            className={`px-3 h-7 rounded-md text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              currentView === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
