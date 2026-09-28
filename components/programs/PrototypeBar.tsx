'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

/** Las pantallas del prototipo, en el orden del recorrido del jugador. */
const SCREENS = [
  { href: '/programa', label: '1 · Descubrir' },
  { href: '/programa/evaluacion', label: '2 · Tras la evaluación' },
  { href: '/programa/mi-programa', label: '3 · Mi programa' },
  { href: '/programa/reservar', label: '4 · Reservar sesión' },
  { href: '/programa/entrenador', label: '5 · Vista entrenador' },
] as const

/**
 * Franja del prototipo: deja claro que los datos son de ejemplo y permite
 * saltar entre pantallas. Desaparece cuando esto se conecte a datos reales.
 */
export function PrototypeBar() {
  // useSearchParams pide un Suspense; el fallback pinta la misma barra sin
  // mirar la query, así la página estática /programa la lleva en el HTML.
  return (
    <Suspense fallback={<PrototypeBarView evaluationBooking={false} />}>
      <PrototypeBarWithSearch />
    </Suspense>
  )
}

function PrototypeBarWithSearch() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return (
    <PrototypeBarView
      evaluationBooking={pathname === '/programa/reservar' && searchParams.get('tipo') === 'evaluacion'}
    />
  )
}

/** `evaluationBooking`: reservar la evaluación es parte del paso 1, no del 4. */
function PrototypeBarView({ evaluationBooking }: { evaluationBooking: boolean }) {
  const pathname = usePathname()
  const current = evaluationBooking ? '/programa' : pathname

  return (
    <div className="bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
        <p className="text-xs text-white/70 shrink-0">
          <span className="font-semibold text-white">Prototipo</span> · datos de ejemplo. No se cobra ni se reserva
          nada.
        </p>
        <nav aria-label="Pantallas del prototipo" className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
          <ul className="flex gap-1 w-max">
            {SCREENS.map((screen) => {
              const active = current === screen.href
              return (
                <li key={screen.href}>
                  <Link
                    href={screen.href}
                    aria-current={active ? 'page' : undefined}
                    className={`block h-8 px-3 rounded-lg text-xs font-medium leading-8 whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                      active ? 'bg-white text-gray-900' : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {screen.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </div>
  )
}
