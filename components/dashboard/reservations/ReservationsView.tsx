'use client'

import { useState } from 'react'
import type { TrainerReservation } from '@/lib/reservations/queries'
import type { ClientPackageSummary } from '@/lib/packages/status'
import { ReservationsTable } from './ReservationsTable'
import { NewReservationButton } from './NewReservationButton'
import { PackagesTable } from '@/components/dashboard/packages/PackagesTable'
import { NewPackageButton } from '@/components/dashboard/packages/NewPackageButton'

type View = 'table' | 'packages'

interface ReservationsViewProps {
  reservations: TrainerReservation[]
  packages: ClientPackageSummary[]
  /** Duraciones que ofrece el entrenador (60/90) */
  durations: number[]
  /** Mensaje si no se pudieron cargar los paquetes (p. ej. migración 006 sin aplicar) */
  packagesError?: string | null
}

const VIEWS: Array<{ id: View; label: string; icon: React.ReactNode }> = [
  { id: 'table', label: 'Table', icon: <path d="M3 6h18M3 12h18M3 18h18" /> },
  {
    id: 'packages',
    label: 'Packages',
    icon: (
      <>
        <path d="m3 7 9-4 9 4v10l-9 4-9-4Z" />
        <path d="m3 7 9 4 9-4M12 11v10" />
      </>
    ),
  },
]

/**
 * Tabla (pestañas + buscador) o Paquetes de clases, con un selector de vista
 * y el botón de acción que le corresponde ("Nueva reserva" o "Vender
 * paquete"). El calendario vive en Resumen (HomeCalendarSection).
 */
export function ReservationsView({ reservations, packages, durations, packagesError = null }: ReservationsViewProps) {
  const [view, setView] = useState<View>('table')

  const switcher = (
    <div role="group" aria-label="View" className="inline-flex rounded-xl bg-gray-100 p-1">
      {VIEWS.map((option) => (
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

  // El botón de acción cambia con la vista: reserva suelta o venta de paquete.
  const toolbar = (
    <div className="flex flex-wrap items-center gap-3 mb-1">
      {switcher}
      {view === 'packages' ? <NewPackageButton durations={durations} /> : <NewReservationButton durations={durations} />}
    </div>
  )

  if (view === 'packages') {
    return (
      <div className="flex flex-col gap-4">
        {toolbar}
        {packagesError ? (
          <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-8 text-center">
            <h2 className="text-base font-semibold text-gray-900">Packages could not be loaded</h2>
            <p className="mt-1.5 text-sm text-gray-600">
              If this is the first time, <code className="text-gray-900">migrations/006_class_packages.sql</code> still needs to be applied in Supabase.
            </p>
            <p className="mt-2 text-xs text-gray-400">{packagesError}</p>
          </div>
        ) : packages.length === 0 ? (
          <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-8 sm:p-12 text-center">
            <h2 className="text-base font-semibold text-gray-900">You haven&apos;t sold any packages yet</h2>
            <p className="mt-1.5 text-sm text-gray-600">
              Use "Sell package" to record it, then schedule each class on your availability.
            </p>
          </div>
        ) : (
          <PackagesTable packages={packages} />
        )}
      </div>
    )
  }

  if (reservations.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {toolbar}
        <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-8 sm:p-12 text-center">
          <h2 className="text-base font-semibold text-gray-900">No bookings yet</h2>
          <p className="mt-1.5 text-sm text-gray-600">
            When a client books from your public page, it will show up here.
          </p>
        </div>
      </div>
    )
  }

  return <ReservationsTable reservations={reservations} leading={toolbar} />
}
