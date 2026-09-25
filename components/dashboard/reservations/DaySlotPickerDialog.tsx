'use client'

import { DialogShell } from '@/components/dashboard/DialogShell'

interface DaySlotPickerDialogProps {
  /** "Miércoles, 23 sept" */
  dayLabel: string
  /** "09:00 – 17:00" */
  rangeLabel: string
  /** "1 h 30 min" */
  durationLabel: string
  /** Horas de inicio ya calculadas con bookableStarts */
  starts: string[]
  selectedStart?: string | null
  /** true en modo select (horas clicables), false en modo view (solo informativo) */
  interactive: boolean
  onSelect?: (start: string) => void
  onClose: () => void
}

/**
 * Modal con una rejilla legible de horas de inicio para un tramo libre
 * concreto. Sustituye a la lista de botones incrustada en el bloque del
 * calendario (desbordaba en columnas estrechas de la vista semanal).
 * Mismo espíritu que el modal "Selecciona horas para..." del widget
 * público (components/booking), adaptado a la paleta del dashboard.
 */
export function DaySlotPickerDialog({
  dayLabel,
  rangeLabel,
  durationLabel,
  starts,
  selectedStart = null,
  interactive,
  onSelect,
  onClose,
}: DaySlotPickerDialogProps) {
  return (
    <DialogShell
      eyebrow={`Clase de ${durationLabel}`}
      title={dayLabel}
      description={`Tramo libre ${rangeLabel}`}
      onClose={onClose}
      size="md"
    >
      {starts.length === 0 ? (
        <p className="text-sm text-gray-500">No cabe ninguna clase de esta duración en este tramo.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
          {starts.map((s) => {
            const isSelected = s === selectedStart
            if (!interactive) {
              return (
                <span
                  key={s}
                  className={`h-11 flex items-center justify-center rounded-lg text-sm font-semibold tabular-nums cursor-default ${
                    isSelected ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700 ring-1 ring-inset ring-gray-200'
                  }`}
                >
                  {s}
                </span>
              )
            }
            return (
              <button
                key={s}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect?.(s)}
                className={`h-11 rounded-lg text-sm font-semibold tabular-nums transition-all duration-150 ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-blue-700 ring-1 ring-inset ring-blue-200 hover:ring-blue-500 hover:bg-blue-50'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>
      )}
    </DialogShell>
  )
}
