import { NavIcon, type IconName } from './NavIcon'

interface StatCardProps {
  icon: IconName
  label: string
  /** null = todavía sin datos (se pinta un guion) */
  value: string | number | null
  hint: string
}

/**
 * Tarjeta de cifra del Resumen. La estructura ya es la definitiva; hasta la
 * Fase F los valores llegan como null.
 */
export function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <span className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <NavIcon name={icon} />
        </span>
      </div>
      <p
        className={`text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${
          value === null ? 'text-gray-300' : 'text-gray-900'
        }`}
        aria-label={value === null ? `${label}: sin datos` : undefined}
      >
        {value === null ? '—' : value}
      </p>
      <p className="text-sm text-gray-500">{hint}</p>
    </div>
  )
}
