'use client'

interface NavToggleButtonsProps {
  onJumpToToday: () => void
  onJumpToThisWeek: () => void
  onJumpToThisMonth: () => void
}

export default function NavToggleButtons({
  onJumpToToday,
  onJumpToThisWeek,
  onJumpToThisMonth,
}: NavToggleButtonsProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onJumpToToday}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-150"
      >
        Hoy
      </button>
      <button
        onClick={onJumpToThisWeek}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-150"
      >
        Esta Semana
      </button>
      <button
        onClick={onJumpToThisMonth}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-150"
      >
        Este Mes
      </button>
    </div>
  )
}
