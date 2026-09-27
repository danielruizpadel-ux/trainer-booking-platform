import type { DashboardNavIcon } from './nav-items'

/** Los de la navegación más los que usan las tarjetas del Resumen. */
export type IconName = DashboardNavIcon | 'coins'

interface NavIconProps {
  name: IconName
  size?: number
}

/** Iconos del dashboard, SVG inline con el patrón del calendario. */
export function NavIcon({ name, size = 18 }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'home' && (
        <>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </>
      )}
      {name === 'calendar' && (
        <>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </>
      )}
      {name === 'users' && (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      )}
      {name === 'clock' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
      {name === 'coins' && (
        <>
          <circle cx="9" cy="9" r="6" />
          <path d="M14.5 6.5A6 6 0 1 1 6.5 14.5" />
        </>
      )}
      {name === 'user' && (
        <>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </>
      )}
    </svg>
  )
}
