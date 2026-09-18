'use client'

type ViewType = 'month' | 'week' | 'day'

interface NavigationArrowsProps {
  onPrev: () => void
  onNext: () => void
}

export default function NavigationArrows({ onPrev, onNext }: NavigationArrowsProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onPrev}
        className="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-bold"
      >
        ← Anterior
      </button>
      <button
        onClick={onNext}
        className="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-bold"
      >
        Siguiente →
      </button>
    </div>
  )
}
