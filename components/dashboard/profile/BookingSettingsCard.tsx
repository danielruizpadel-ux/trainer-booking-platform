import Link from 'next/link'

interface BookingSettingsCardProps {
  durations: number[]
  publicUrl: string
}

/**
 * Resumen en solo lectura de cómo se reserva. CUÁNDO trabaja el entrenador y
 * qué duraciones ofrece se edita en Disponibilidad; aquí solo se enseña.
 */
export function BookingSettingsCard({ durations, publicUrl }: BookingSettingsCardProps) {
  return (
    <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Booking settings</h2>
          <p className="mt-1 text-sm text-gray-500">Your schedule, time off and session lengths live in Availability.</p>
        </div>
        <Link
          href="/dashboard/disponibilidad"
          className="h-11 px-4 rounded-xl bg-white text-gray-900 text-sm font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 inline-flex items-center justify-center w-full sm:w-auto shrink-0"
        >
          Manage availability
        </Link>
      </div>

      <dl className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <dt className="text-gray-400">Session lengths</dt>
        <dd className="flex flex-wrap gap-1.5">
          {durations.map((d) => (
            <span key={d} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {d} min
            </span>
          ))}
        </dd>

        <dt className="text-gray-400">Booking page</dt>
        <dd className="min-w-0">
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 break-all">
            {publicUrl}
          </a>
        </dd>
      </dl>
    </section>
  )
}
