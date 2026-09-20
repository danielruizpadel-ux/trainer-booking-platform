'use client'

import { toDateStr, mondayFirstIndex, isSameDay } from '@/lib/dateUtils'

interface AvailabilitySlot {
  session_date: string
}

interface MonthViewProps {
  currentDate: Date
  slots: AvailabilitySlot[]
  selectedDates?: Set<string>
  sessionCountByDate?: Record<string, number>
  onDateSelect: (date: string) => void
  onDateToggle?: (date: string) => void
}

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DAY_LABELS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export default function MonthView({
  currentDate,
  slots,
  selectedDates = new Set(),
  sessionCountByDate = {},
  onDateSelect,
  onDateToggle,
}: MonthViewProps) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // La rejilla empieza en LUNES, así que desplazamos con mondayFirstIndex
  const leadingBlanks = mondayFirstIndex(firstDay)

  const availableDates = new Set(slots.map((slot) => slot.session_date))
  const today = new Date()

  const cells: (number | null)[] = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let i = 1; i <= daysInMonth; i++) cells.push(i)
  while (cells.length % 7 !== 0) cells.push(null)

  const handleDayClick = (day: number) => {
    const dateStr = toDateStr(new Date(year, month, day))
    if (!availableDates.has(dateStr)) return
    if (onDateToggle) onDateToggle(dateStr)
    else onDateSelect(dateStr)
  }

  return (
    <div>
      {/* Cabecera de días */}
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className="text-center text-[11px] font-semibold uppercase tracking-wider text-gray-400 py-2"
            title={DAY_LABELS_FULL[i]}
          >
            <span className="hidden sm:inline">{DAY_LABELS_FULL[i].slice(0, 3)}</span>
            <span className="sm:hidden">{label}</span>
          </div>
        ))}
      </div>

      {/* Rejilla de días */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="aspect-square" />
          }

          const date = new Date(year, month, day)
          const dateStr = toDateStr(date)
          const hasAvailability = availableDates.has(dateStr)
          const isSelected = selectedDates.has(dateStr)
          const isToday = isSameDay(date, today)
          const count = sessionCountByDate[dateStr] || 0

          return (
            <button
              key={dateStr}
              onClick={() => handleDayClick(day)}
              disabled={!hasAvailability}
              aria-pressed={isSelected}
              className={[
                'relative aspect-square rounded-xl text-sm font-medium',
                'flex flex-col items-center justify-center gap-1',
                'transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
                isSelected
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700'
                  : hasAvailability
                  ? 'bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/60 cursor-pointer'
                  : 'text-gray-300 cursor-not-allowed',
                !isSelected && isToday ? 'ring-2 ring-inset ring-blue-500 font-bold' : '',
              ].join(' ')}
            >
              <span className="leading-none">{day}</span>

              {/* Indicador de disponibilidad / nº de sesiones elegidas */}
              {isSelected ? (
                <span className="text-[10px] leading-none font-semibold">
                  {count > 0 ? `${count}h` : '✓'}
                </span>
              ) : hasAvailability ? (
                <span className="h-1 w-1 rounded-full bg-blue-500" />
              ) : (
                <span className="h-1 w-1" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
