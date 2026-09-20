/** Secciones del dashboard. El orden es el de la barra de navegación. */
export const DASHBOARD_NAV = [
  { href: '/dashboard', label: 'Resumen', icon: 'home' },
  { href: '/dashboard/reservas', label: 'Reservas', icon: 'calendar' },
  { href: '/dashboard/disponibilidad', label: 'Disponibilidad', icon: 'clock' },
  { href: '/dashboard/perfil', label: 'Perfil', icon: 'user' },
] as const

export type DashboardNavIcon = (typeof DASHBOARD_NAV)[number]['icon']

/** `/dashboard` solo es activo en exacto; el resto también en sus subrutas. */
export function isNavItemActive(href: string, pathname: string) {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}
