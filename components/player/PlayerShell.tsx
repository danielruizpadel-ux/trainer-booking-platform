import Link from 'next/link'
import type { Player } from '@/lib/players/profile'
import { SignOutButton } from '@/components/dashboard/SignOutButton'

interface PlayerShellProps {
  player: Player
  children: React.ReactNode
}

/** Marco de /cuenta: cabecera (marca, jugador, salir) y contenido. Mismo lenguaje que DashboardShell. */
export function PlayerShell({ player, children }: PlayerShellProps) {
  const displayName = player.full_name?.trim() || player.email
  const initial = displayName.charAt(0).toUpperCase() || '?'

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link
            href="/cuenta"
            className="flex items-center gap-2.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
          >
            <span className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3a9 9 0 0 1 0 18M3 12h18" />
              </svg>
            </span>
            <span className="text-sm font-semibold text-gray-900 sr-only sm:not-sr-only">Tu cuenta</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 text-sm font-semibold flex items-center justify-center shrink-0">
                {initial}
              </span>
              <span className="text-sm font-medium text-gray-900 truncate hidden sm:inline">{displayName}</span>
            </div>
            <SignOutButton action="/cuenta/auth/signout" />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">{children}</main>
    </div>
  )
}
