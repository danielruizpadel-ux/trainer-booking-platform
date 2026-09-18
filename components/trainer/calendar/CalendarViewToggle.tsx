'use client'

type ViewType = 'month' | 'week' | 'day'

interface CalendarViewToggleProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
}

export default function CalendarViewToggle({
  currentView,
  onViewChange,
}: CalendarViewToggleProps) {
  const views: Array<{ id: ViewType; label: string }> = [
    { id: 'month', label: 'Mes' },
    { id: 'week', label: 'Semana' },
    { id: 'day', label: 'Día' },
  ]

  return (
    <div className="flex gap-2">
      {views.map((view) => (
        <button
          key={view.id}
          onClick={() => onViewChange(view.id)}
          className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-all duration-200 ${
            currentView === view.id
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900'
          }`}
        >
          {view.label}
        </button>
      ))}
    </div>
  )
}
