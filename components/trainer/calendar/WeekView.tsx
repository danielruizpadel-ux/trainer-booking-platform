'use client'

import { toDateStr, getMonday, isSameDay } from '@/lib/dateUtils'

interface AvailabilitySlot {
  session_date: string
}

interface WeekViewProps {
  currentDate: Date
  slots: AvailabilitySlot[]
  selectedDate?: string
  selectedDates?: Set<string>
  sessionCountByDate?: Record<string, number>
  onDateSelect: (date: string) => void
  onDateToggle?: (date: string) => void
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function WeekView({
  currentDate,
  slots,
  selectedDates = new Set(),
  sessionCountByDate = {},
  onDateSelect,
  onDateToggle,
}: WeekViewProps) {
  const availableDates = new Set(slots.map((slot) => slot.session_date))
  const slotsByDate = slots.reduce<Record<string, number>>((acc, s) => {
    acc[s.session_date] = (acc[s.session_date] || 0) + 1
    return acc
  }, {})

  const monday = getMonday(currentDate)
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    days.push(d)
  }

  const today = new Date()

  const handleDayClick = (date: Date) => {
    const dateStr = toDateStr(date)
    if (!availableDates.has(dateStr)) return
    if (onDateToggle) onDateToggle(dateStr)
    else onDateSelect(dateStr)
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {days.map((date, index) => {
        const dateStr = toDateStr(date)
        const hasAvailability = availableDates.has(dateStr)
        const isSelected = selectedDates.has(dateStr)
        const isToday = isSameDay(date, today)
        const chosen = sessionCountByDate[dateStr] || 0
        const free = slotsByDate[dateStr] || 0

        return (
          <button
            key={dateStr}
            onClick={() => handleDayClick(date)}
            disabled={!hasAvailability}
            aria-pressed={isSelected}
            className={[
              'rounded-xl p-3 text-center transition-all duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              isSelected
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700'
                : hasAvailability
                ? 'bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/60'
                : 'bg-gray-50 text-gray-300 cursor-not-allowed',
              !isSelected && isToday ? 'ring-2 ring-inset ring-blue-500' : '',
            ].join(' ')}
          >
            <div
              className={`text-[11px] font-semibold uppercase tracking-wider ${
                isSelected ? 'text-blue-100' : 'text-gray-400'
              }`}
            >
              {DAY_NAMES[index]}
            </div>
            <div className="text-2xl font-bold leading-tight mt-1">{date.getDate()}</div>
            <div className={`text-[11px] mt-1 ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
              {isSelected
                ? chosen > 0
                  ? `${chosen} elegida${chosen > 1 ? 's' : ''}`
                  : 'seleccionado'
                : hasAvailability
                ? `${free} libre${free > 1 ? 's' : ''}`
                : '—'}
            </div>
          </button>
        )
      })}
    </div>
  )
}
