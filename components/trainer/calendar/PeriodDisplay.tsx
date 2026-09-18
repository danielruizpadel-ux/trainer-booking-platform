'use client'

type ViewType = 'month' | 'week' | 'day'

interface PeriodDisplayProps {
  currentDate: Date
  currentView: ViewType
}

export default function PeriodDisplay({ currentDate, currentView }: PeriodDisplayProps) {
  const getMonday = (date: Date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff))
  }

  const formatDate = (date: Date, format: string) => {
    const options: Intl.DateTimeFormatOptions = {}
    if (format.includes('month')) options.month = 'long'
    if (format.includes('year')) options.year = 'numeric'
    if (format.includes('day')) options.day = 'numeric'
    if (format.includes('weekday')) options.weekday = 'long'
    return date.toLocaleDateString('es-ES', options)
  }

  let displayText = ''

  if (currentView === 'month') {
    displayText = `${formatDate(currentDate, 'month')} ${currentDate.getFullYear()}`
  } else if (currentView === 'week') {
    const monday = getMonday(currentDate)
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    displayText = `Semana del ${monday.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} - ${sunday.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
  } else if (currentView === 'day') {
    displayText = formatDate(currentDate, 'weekday day month year').charAt(0).toUpperCase() + formatDate(currentDate, 'weekday day month year').slice(1)
  }

  return (
    <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">{displayText}</h2>
  )
}
