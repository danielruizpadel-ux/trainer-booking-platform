'use client'

interface MiniCalendarProps {
  currentDate: Date
  onDateChange: (date: Date) => void
  availableDates?: Set<string>
}

export default function MiniCalendar({
  currentDate,
  onDateChange,
  availableDates,
}: MiniCalendarProps) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay()

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]

  const days = []
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i)
  }

  const handlePrevMonth = () => {
    onDateChange(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    onDateChange(new Date(year, month + 1, 1))
  }

  const handleDayClick = (day: number) => {
    const newDate = new Date(year, month, day)
    const dateStr = newDate.toISOString().split('T')[0]
    if (!availableDates || availableDates.has(dateStr)) {
      onDateChange(newDate)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      {/* Month Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevMonth}
          className="text-gray-600 hover:text-gray-900 font-bold"
        >
          ←
        </button>
        <h3 className="font-semibold text-gray-900 text-sm">
          {monthNames[month]} {year}
        </h3>
        <button
          onClick={handleNextMonth}
          className="text-gray-600 hover:text-gray-900 font-bold"
        >
          →
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day) => (
          <div key={day} className="text-center text-xs font-bold text-gray-500">
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} />
          }

          const date = new Date(year, month, day)
          const dateStr = date.toISOString().split('T')[0]
          const isSelected =
            currentDate.getDate() === day &&
            currentDate.getMonth() === month &&
            currentDate.getFullYear() === year
          const hasAvailability = !availableDates || availableDates.has(dateStr)

          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              disabled={!hasAvailability}
              className={`p-1 text-xs rounded transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white font-bold'
                  : hasAvailability
                  ? 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
