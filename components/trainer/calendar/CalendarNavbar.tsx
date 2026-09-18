'use client'

import { useState } from 'react'
import MiniCalendarOverlay from './MiniCalendarOverlay'

type ViewType = 'month' | 'week' | 'day'

interface CalendarNavbarProps {
  currentDate: Date
  currentView: ViewType
  onDateChange: (date: Date) => void
  onViewChange: (view: ViewType) => void
  availableDates?: Set<string>
}

export default function CalendarNavbar({
  currentDate,
  currentView,
  onDateChange,
  onViewChange,
  availableDates,
}: CalendarNavbarProps) {
  const [showMiniCalendar, setShowMiniCalendar] = useState(false)

  const handleJumpToToday = () => {
    onDateChange(new Date())
  }

  const handleJumpToThisWeek = () => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    onDateChange(new Date(today.setDate(diff)))
    if (currentView !== 'week') onViewChange('week')
  }

  const handleJumpToThisMonth = () => {
    onDateChange(new Date())
    if (currentView !== 'month') onViewChange('month')
  }

  const handlePrev = () => {
    const newDate = new Date(currentDate)
    if (currentView === 'month') {
      newDate.setMonth(newDate.getMonth() - 1)
    } else if (currentView === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else if (currentView === 'day') {
      newDate.setDate(newDate.getDate() - 1)
    }
    onDateChange(newDate)
  }

  const handleNext = () => {
    const newDate = new Date(currentDate)
    if (currentView === 'month') {
      newDate.setMonth(newDate.getMonth() + 1)
    } else if (currentView === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else if (currentView === 'day') {
      newDate.setDate(newDate.getDate() + 1)
    }
    onDateChange(newDate)
  }

  const getMonthYear = () => {
    return currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  }

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* CONSOLIDATED: ONE LINE NAVBAR */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-semibold"
              title="Anterior"
            >
              ← Anterior
            </button>
          </div>

          {/* Center: Quick Jump Buttons + Period */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleJumpToToday}
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-700"
            >
              Hoy
            </button>
            <button
              onClick={handleJumpToThisWeek}
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-700"
            >
              Esta Semana
            </button>
            <button
              onClick={handleJumpToThisMonth}
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition-all bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-700"
            >
              Este Mes
            </button>
            <span className="text-gray-400">|</span>
            <span className="text-sm font-semibold text-gray-900 min-w-32 text-center">{getMonthYear()}</span>
          </div>

          {/* Right: View Toggle + Mini Cal */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(['month', 'week', 'day'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => onViewChange(view)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    currentView === view ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {view === 'month' ? 'Mes' : view === 'week' ? 'Semana' : 'Día'}
                </button>
              ))}
            </div>
            <div className="relative">
              <button
                onClick={() => setShowMiniCalendar(!showMiniCalendar)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Calendario"
              >
                📅
              </button>
              <MiniCalendarOverlay
                isOpen={showMiniCalendar}
                onClose={() => setShowMiniCalendar(false)}
                currentDate={currentDate}
                onDateSelect={onDateChange}
                availableDates={availableDates}
              />
            </div>
            <button
              onClick={handleNext}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-semibold"
              title="Siguiente"
            >
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
