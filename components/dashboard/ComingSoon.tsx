import { NavIcon, type IconName } from './NavIcon'

interface ComingSoonProps {
  icon: IconName
  title: string
  description: string
  /** Fase del plan en la que se implementa (docs/estado-desarrollo.md) */
  phase: string
}

/** Placeholder de sección aún no implementada. */
export function ComingSoon({ icon, title, description, phase }: ComingSoonProps) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-8 sm:p-12 flex flex-col items-center text-center gap-4">
      <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
        <NavIcon name={icon} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Próximamente</p>
        <h2 className="mt-1.5 text-base font-semibold text-gray-900">{title}</h2>
        <p className="mt-1.5 text-sm text-gray-600 max-w-md">{description}</p>
      </div>
      <span className="h-7 px-2.5 rounded-lg bg-gray-100 text-xs font-medium text-gray-500 inline-flex items-center">
        {phase}
      </span>
    </div>
  )
}
