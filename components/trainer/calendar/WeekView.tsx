'use client'

interface AvailabilitySlot {
  session_date: string
}

interface WeekViewProps {
  currentDate: Date
  slots: AvailabilitySlot[]
  selectedDate?: string
  selectedDates?: Set<string>
  onDateSelect: (date: string) => void
  onDateToggle?: (date: string) => void
  onNavigate: (date: Date) => void
}

export default function WeekView({
  currentDate,
  slots,
  selectedDate,
  selectedDates = new Set(),
  onDateSelect,
  onDateToggle,
  onNavigate,
}: WeekViewProps) {
  const availableDates = new Set(slots.map((slot) => slot.session_date))

  // Get Monday of current week
  const getMonday = (date: Date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  }

  const monday = getMonday(currentDate)
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    days.push(d)
  }

  const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

  const handlePrevWeek = () => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() - 7)
    onNavigate(newDate)
  }

  const handleNextWeek = () => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + 7)
    onNavigate(newDate)
  }

  const handleDayClick = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    if (availableDates.has(dateStr)) {
      if (onDateToggle) {
        onDateToggle(dateStr)
      } else {
        onDateSelect(dateStr)
      }
    }
  }

  return (
    <div>
      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-3">
        {days.map((date, index) => {
          const dateStr = date.toISOString().split('T')[0]
          const hasAvailability = availableDates.has(dateStr)
          const isSelected = selectedDates.has(dateStr)

          return (
            <button
              key={dateStr}
              onClick={() => handleDayClick(date)}
              disabled={!hasAvailability}
              className={`p-4 rounded-lg transition-all border-2 ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                  : hasAvailability
                  ? 'bg-white text-gray-900 border-blue-600 hover:bg-blue-50'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
            >
              <div className="font-bold text-lg">{date.getDate()}</div>
              <div className="text-sm">{dayNames[index]}</div>
              {isSelected && <div className="text-xs mt-1">✓</div>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
