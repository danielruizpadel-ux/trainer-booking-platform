interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  /** Acciones a la derecha (botones), opcional */
  actions?: React.ReactNode
}

/** Cabecera de sección del dashboard, con la tipografía del sistema de diseño. */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{eyebrow}</p>
        )}
        <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-gray-500">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
