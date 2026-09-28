import type { Metadata } from 'next'
import Link from 'next/link'
import { PrototypeBar } from '@/components/programs/PrototypeBar'
import { ProgramHeaderNav } from '@/components/programs/ProgramHeaderNav'
import { PROGRAM_NAME } from '@/lib/programs/catalog'

export const metadata: Metadata = {
  title: { default: PROGRAM_NAME, template: `%s · ${PROGRAM_NAME}` },
  // Prototipo con datos de ejemplo: fuera de buscadores.
  robots: { index: false, follow: false },
}

/**
 * Prototipo de UI de los programas de entrenamiento. Todas las pantallas
 * cuelgan de aquí y usan datos de lib/programs/sample-data.ts. Sin login:
 * el perfil y la sesión global del jugador son de otra fase.
 */
export default function ProgramLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <PrototypeBar />
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link
            href="/programa"
            className="flex items-center gap-2.5 min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3a9 9 0 0 1 0 18M3 12h18" />
              </svg>
            </span>
            <span className="text-sm font-semibold text-gray-900 truncate">{PROGRAM_NAME}</span>
          </Link>
          <ProgramHeaderNav />
        </div>
      </header>
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-28 md:pb-12">
        {children}
      </main>
    </div>
  )
}
