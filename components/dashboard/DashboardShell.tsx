import Link from 'next/link'
import type { CurrentTrainer } from '@/lib/auth/current-trainer'
import { DashboardNav } from './DashboardNav'
import { SignOutButton } from './SignOutButton'

interface DashboardShellProps {
  trainer: CurrentTrainer
  children: React.ReactNode
}

/**
 * Marco de todas las páginas privadas: cabecera fija (marca, navegación en
 * md+, entrenador y salida), contenido, y barra de navegación inferior en
 * móvil. Las páginas solo ponen su cabecera y sus tarjetas.
 */
export function DashboardShell({ trainer, children }: DashboardShellProps) {
  const initial = trainer.name.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link
              href="/dashboard"
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
              <span className="text-sm font-semibold text-gray-900 hidden sm:inline">
                Panel del entrenador
              </span>
            </Link>
            <DashboardNav variant="top" />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 text-sm font-semibold flex items-center justify-center shrink-0">
                {initial}
              </span>
              <span className="text-sm font-medium text-gray-900 truncate hidden sm:inline">
                {trainer.name}
              </span>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* pb extra en móvil para que la barra inferior no tape el final */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 pb-28 md:pb-10">
        {children}
      </main>

      <DashboardNav variant="bottom" />
    </div>
  )
}
