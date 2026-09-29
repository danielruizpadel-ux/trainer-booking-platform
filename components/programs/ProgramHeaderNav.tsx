'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Lado derecho de la cabecera de /programa. "Mi programa" solo tiene sentido
 * para un jugador ya inscrito: en la portada, el resultado de la evaluación y
 * la reserva de la evaluación no se enseña. En la vista de entrenador se
 * indica en qué vista se está.
 */
export function ProgramHeaderNav() {
  // Fallback sin query: la portada es estática y ahí no va enlace.
  return (
    <Suspense fallback={<HeaderNavView evaluationBooking={false} />}>
      <HeaderNavWithSearch />
    </Suspense>
  )
}

function HeaderNavWithSearch() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return (
    <HeaderNavView
      evaluationBooking={pathname === '/programa/reservar' && searchParams.get('tipo') === 'evaluacion'}
    />
  )
}

const ENROLLED_PATHS = ['/programa/mi-programa', '/programa/reservar']

function HeaderNavView({ evaluationBooking }: { evaluationBooking: boolean }) {
  const pathname = usePathname()

  if (pathname === '/programa/entrenador') {
    return <span className="h-9 px-3 text-sm font-medium text-gray-500 flex items-center shrink-0">Vista entrenador</span>
  }

  if (evaluationBooking || !ENROLLED_PATHS.includes(pathname)) return null

  const current = pathname === '/programa/mi-programa'
  return (
    <Link
      href="/programa/mi-programa"
      aria-current={current ? 'page' : undefined}
      className={`h-9 px-3 rounded-lg text-sm font-medium transition-colors flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        current ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      Mi programa
    </Link>
  )
}
