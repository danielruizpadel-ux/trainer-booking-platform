'use client'

interface AvailabilitySlot {
  session_date: string
}

interface MonthViewProps {
  currentDate: Date
  slots: AvailabilitySlot[]
  selectedDates?: Set<string>
  onDateSelect: (date: string) => void
  onDateToggle?: (date: string) => void
  onNavigate: (date: Date) => void
}

export default function MonthView({
  currentDate,
  slots,
  selectedDates = new Set(),
  onDateSelect,
  onDateToggle,
  onNavigate,
}: MonthViewProps) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay()

  // Build set of available dates
  const availableDates = new Set(slots.map((slot) => slot.session_date))

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
    onNavigate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    onNavigate(new Date(year, month + 1, 1))
  }

  const handleDayClick = (day: number) => {
    const date = new Date(year, month, day)
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
      {/* Month Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handlePrevMonth}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 font-bold"
        >
          ← Anterior
        </button>
        <h2 className="font-bold text-xl text-gray-900">
          {monthNames[month]} {year}
        </h2>
        <button
          onClick={handleNextMonth}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 font-bold"
        >
          Siguiente →
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(
          (day) => (
            <div key={day} className="text-center font-bold text-gray-700 text-sm py-2">
              {day}
            </div>
          )
        )}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="aspect-square" />
          }

          const date = new Date(year, month, day)
          const dateStr = date.toISOString().split('T')[0]
          const hasAvailability = availableDates.has(dateStr)
          const isSelected = selectedDates.has(dateStr)

          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              disabled={!hasAvailability}
              className={`aspect-square rounded-lg font-semibold transition-all text-sm border-2 ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                  : hasAvailability
                  ? 'bg-white text-gray-900 border-blue-600 hover:bg-blue-50 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
            >
              {isSelected && <span className="mr-1">✓</span>}
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
