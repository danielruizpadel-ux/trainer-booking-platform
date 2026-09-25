import type { PlanSession } from '@/lib/programs/types'

interface ProgramProgressBarProps {
  sessions: PlanSession[]
  total: number
  /** Pinta el número de cada sesión debajo (pantallas anchas) */
  showNumbers?: boolean
}

/**
 * Una casilla por sesión del plan: hecha (azul), reservada (azul claro con
 * borde) o por reservar (gris). Se lee de un vistazo cuánto falta.
 */
export function ProgramProgressBar({ sessions, total, showNumbers = false }: ProgramProgressBarProps) {
  const byNumber = new Map(sessions.map((s) => [s.number, s]))
  const completed = sessions.filter((s) => s.status === 'completed').length

  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-label={`${completed} de ${total} sesiones completadas`}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }, (_, i) => {
          const status = byNumber.get(i + 1)?.status ?? 'unscheduled'
          return (
            <span
              key={i}
              className={`h-2.5 rounded-full ${
                status === 'completed'
                  ? 'bg-blue-600'
                  : status === 'booked'
                    ? 'bg-blue-100 ring-1 ring-inset ring-blue-300'
                    : 'bg-gray-100'
              }`}
            />
          )
        })}
      </div>
      {showNumbers && (
        <div
          aria-hidden
          className="mt-1.5 grid gap-1.5 text-center text-[11px] tabular-nums text-gray-400"
          style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: total }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProgressLegend({ completed, booked, toBook }: { completed: number; booked: number; toBook: number }) {
  const items = [
    { label: 'Hechas', value: completed, swatch: 'bg-blue-600' },
    { label: 'Reservadas', value: booked, swatch: 'bg-blue-100 ring-1 ring-inset ring-blue-300' },
    { label: 'Por reservar', value: toBook, swatch: 'bg-gray-100 ring-1 ring-inset ring-gray-200' },
  ]
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${item.swatch}`} aria-hidden />
          <span>
            {item.label} <span className="font-semibold text-gray-900 tabular-nums">{item.value}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
