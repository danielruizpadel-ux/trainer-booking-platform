/**
 * Iconos de la interfaz: SVG inline con el patrón del calendario
 * (DESIGN_SYSTEM.md → Iconografía). Sustituyen a los emojis, que están
 * prohibidos en la UI. Decorativos por defecto (aria-hidden): el texto de al
 * lado es el que se lee; si un icono va solo, pásale `label`.
 */

export type IconName =
  | 'check'
  | 'calendar'
  | 'clock'
  | 'tag'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-down'
  | 'mail'
  | 'phone'
  | 'message'
  | 'star'
  | 'user'
  | 'users'
  | 'info'
  | 'alert'
  | 'x'
  | 'target'
  | 'court'
  | 'sparkle'
  | 'lock'

interface IconProps {
  name: IconName
  size?: number
  className?: string
  /** Texto para lectores de pantalla cuando el icono va sin texto al lado. */
  label?: string
}

export function Icon({ name, size = 18, className, label }: IconProps) {
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'star' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...a11y}
    >
      {name === 'check' && <path d="M20 6 9 17l-5-5" />}
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
      {name === 'tag' && (
        <>
          <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
          <circle cx="7.5" cy="7.5" r="1.5" />
        </>
      )}
      {name === 'arrow-left' && <path d="M19 12H5M11 18l-6-6 6-6" />}
      {name === 'arrow-right' && <path d="M5 12h14M13 6l6 6-6 6" />}
      {name === 'arrow-down' && <path d="M12 5v14M6 13l6 6 6-6" />}
      {name === 'mail' && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </>
      )}
      {name === 'phone' && (
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
      )}
      {name === 'message' && <path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12Z" />}
      {name === 'star' && (
        <path strokeWidth="1" d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9Z" />
      )}
      {name === 'user' && (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </>
      )}
      {name === 'users' && (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      )}
      {name === 'info' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" />
        </>
      )}
      {name === 'alert' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </>
      )}
      {name === 'x' && <path d="M18 6 6 18M6 6l12 12" />}
      {name === 'target' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </>
      )}
      {name === 'court' && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 12h18M12 4v4M12 16v4" />
        </>
      )}
      {name === 'sparkle' && (
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
      )}
      {name === 'lock' && (
        <>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      )}
    </svg>
  )
}
