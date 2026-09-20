'use client'

import { useState } from 'react'
import type { TrainerReservation } from '@/lib/reservations/queries'
import { ReservationsTable } from './ReservationsTable'
import { ReservationsCalendar } from './ReservationsCalendar'

type View = 'table' | 'calendar'

interface ReservationsViewProps {
  reservations: TrainerReservation[]
}

/**
 * Tabla (pestañas + buscador) o Calendario (semana/día), con un selector
 * junto a las pestañas. Un clic en una reserva del calendario vuelve a la
 * tabla y la resalta.
 */
export function ReservationsView({ reservations }: ReservationsViewProps) {
  const [view, setView] = useState<View>('table')
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null)

  function jumpToReservation(id: string) {
    setFocus({ id, nonce: Date.now() })
    setView('table')
  }

  const switcher = (
    <div role="group" aria-label="Vista" className="inline-flex rounded-xl bg-gray-100 p-1 mb-1">
      {(
        [
          { id: 'table', label: 'Tabla', icon: <path d="M3 6h18M3 12h18M3 18h18" /> },
          { id: 'calendar', label: 'Calendario', icon: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></> },
        ] as Array<{ id: View; label: string; icon: React.ReactNode }>
      ).map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={view === option.id}
          onClick={() => setView(option.id)}
          className={`h-8 px-3 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition-all duration-150 ${
            view === option.id ? 'bg-white text-gray-900 ring-1 ring-gray-200/70' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {option.icon}
          </svg>
          {option.label}
        </button>
      ))}
    </div>
  )

  if (view === 'calendar') {
    return (
      <div className="flex flex-col gap-4">
        {switcher}
        <ReservationsCalendar mode="view" onReservationClick={jumpToReservation} />
      </div>
    )
  }

  return <ReservationsTable reservations={reservations} leading={switcher} focus={focus} />
}
