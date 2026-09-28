export type ProgramIconName =
  | 'check'
  | 'court'
  | 'calendar'
  | 'clock'
  | 'target'
  | 'arrow-right'
  | 'arrow-left'
  | 'lock'
  | 'users'
  | 'clipboard'
  | 'info'
  | 'sparkle'

interface ProgramIconProps {
  name: ProgramIconName
  size?: number
  className?: string
}

/** Iconos de /programa, SVG inline con el patrón del calendario. */
export function ProgramIcon({ name, size = 18, className }: ProgramIconProps) {
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
      className={className}
    >
      {name === 'check' && <path d="M20 6 9 17l-5-5" />}
      {name === 'court' && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 12h18M12 4v4M12 16v4" />
        </>
      )}
      {name === 'calendar' && (
        <>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </>
      )}
      {name === 'clock' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
      {name === 'target' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </>
      )}
      {name === 'arrow-right' && <path d="M5 12h14M13 6l6 6-6 6" />}
      {name === 'arrow-left' && <path d="M19 12H5M11 18l-6-6 6-6" />}
      {name === 'lock' && (
        <>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      )}
      {name === 'users' && (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      )}
      {name === 'clipboard' && (
        <>
          <rect x="6" y="4" width="12" height="17" rx="2" />
          <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
        </>
      )}
      {name === 'info' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" />
        </>
      )}
      {name === 'sparkle' && <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />}
    </svg>
  )
}
