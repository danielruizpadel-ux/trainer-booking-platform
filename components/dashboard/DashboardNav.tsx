'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DASHBOARD_NAV, isNavItemActive } from './nav-items'
import { NavIcon } from './NavIcon'

interface DashboardNavProps {
  /** 'top' va en la cabecera (md+); 'bottom' es la barra fija de móvil */
  variant: 'top' | 'bottom'
}

/**
 * La misma lista de secciones en dos formas: pestañas en la cabecera a partir
 * de md, y barra inferior con icono + etiqueta en móvil. La activa se marca
 * con el estado "seleccionado" del sistema de diseño.
 */
export function DashboardNav({ variant }: DashboardNavProps) {
  const pathname = usePathname()

  if (variant === 'bottom') {
    return (
      <nav
        aria-label="Secciones"
        className="md:hidden fixed inset-x-0 bottom-0 z-20 bg-white/95 backdrop-blur border-t border-gray-100 pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${DASHBOARD_NAV.length}, minmax(0, 1fr))` }}>
          {DASHBOARD_NAV.map((item) => {
            const active = isNavItemActive(item.href, pathname)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-medium transition-colors ${
                    active ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <span
                    className={`h-8 w-12 rounded-xl flex items-center justify-center transition-colors ${
                      active ? 'bg-blue-50' : ''
                    }`}
                  >
                    <NavIcon name={item.icon} size={20} />
                  </span>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    )
  }

  return (
    <nav aria-label="Secciones" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {DASHBOARD_NAV.map((item) => {
          const active = isNavItemActive(item.href, pathname)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`h-9 px-3 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <NavIcon name={item.icon} size={16} />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
