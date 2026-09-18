'use client'

import { useState } from 'react'
import NavToggleButtons from './NavToggleButtons'
import PeriodDisplay from './PeriodDisplay'
import NavigationArrows from './NavigationArrows'
import CalendarViewToggle from './CalendarViewToggle'
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

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200/50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Row 1: Navigation Arrows + Period + View Toggle + Mini Calendar */}
        <div className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Left: Navigation Controls */}
          <div className="flex items-center gap-2">
            <NavigationArrows onPrev={handlePrev} onNext={handleNext} />
          </div>

          {/* Center: Period Display */}
          <div className="flex-1 text-center">
            <PeriodDisplay currentDate={currentDate} currentView={currentView} />
          </div>

          {/* Right: View Toggle + Mini Calendar */}
          <div className="flex items-center gap-3 justify-end">
            <div className="hidden sm:block">
              <CalendarViewToggle currentView={currentView} onViewChange={onViewChange} />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowMiniCalendar(!showMiniCalendar)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors hover:text-gray-900"
                title="Abrir mini calendario"
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
          </div>
        </div>

        {/* Row 2: Quick Navigation Buttons (Mobile + Desktop) */}
        <div className="py-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
          <NavToggleButtons
            onJumpToToday={handleJumpToToday}
            onJumpToThisWeek={handleJumpToThisWeek}
            onJumpToThisMonth={handleJumpToThisMonth}
          />
          <div className="sm:hidden ml-auto">
            <CalendarViewToggle currentView={currentView} onViewChange={onViewChange} />
          </div>
        </div>
      </div>
    </div>
  )
}
