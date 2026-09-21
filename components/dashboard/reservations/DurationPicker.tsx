'use client'

import { durationLabel } from '@/lib/availability/durations'

interface DurationPickerProps {
  /** Duraciones que ofrece el entrenador */
  durations: number[]
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

/** Selector 1 h / 1 h 30 min. Con una sola duración ofrecida solo la informa. */
export function DurationPicker({ durations, value, onChange, disabled = false }: DurationPickerProps) {
  if (durations.length <= 1) {
    return <p className="text-sm text-gray-600">Clases de <span className="font-semibold text-gray-900">{durationLabel(durations[0] ?? 60)}</span>.</p>
  }
  return (
    <div role="radiogroup" aria-label="Duración" className="inline-flex rounded-xl bg-gray-100 p-1">
      {durations.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          disabled={disabled}
          onClick={() => onChange(d)}
          className={`h-9 px-4 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-50 ${
            value === d ? 'bg-white text-gray-900 ring-1 ring-gray-200/70' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {durationLabel(d)}
        </button>
      ))}
    </div>
  )
}
