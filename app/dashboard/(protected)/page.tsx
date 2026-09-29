import type { Metadata } from 'next'
import { getCurrentSession } from '@/lib/auth/current-trainer'
import { listTrainerReservations } from '@/lib/reservations/queries'
import { StatCard } from '@/components/dashboard/StatCard'
import { HomeCalendarSection } from '@/components/dashboard/home/HomeCalendarSection'

export const metadata: Metadata = { title: 'Resumen' }

// El calendario pinta reservas reales: siempre datos frescos.
export const dynamic = 'force-dynamic'

/**
 * Resumen. Las cifras llegan en la Fase F; aquí ya está la estructura con los
 * valores a null para que el diseño no cambie cuando haya datos.
 */
export default async function DashboardHomePage() {
  const { trainer } = await getCurrentSession()
  // Sin entrenador no se llega a pintar: el layout muestra la pantalla de
  // "cuenta no vinculada" y no renderiza children. Next evalúa la página en
  // paralelo, así que aquí solo hay que no reventar.
  if (!trainer) return null

  // El trainer_id sale de la sesión, nunca de la URL ni del cliente.
  const reservations = await listTrainerReservations(trainer.id)

  return (
    <>
      {/* Sin cabecera ni saludo: el calendario es lo primero que se ve. */}
      <section aria-label="Calendario">
        <h1 className="sr-only">Resumen</h1>
        <HomeCalendarSection reservations={reservations} durations={trainer.class_durations} />
      </section>

      <section aria-labelledby="stats-title" className="mt-10">
        <h2 id="stats-title" className="sr-only">
          Cifras
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            icon="calendar"
            label="Reservas de hoy"
            value={null}
            hint="Sesiones confirmadas para hoy"
          />
          <StatCard
            icon="clock"
            label="Próximas"
            value={null}
            hint="Reservas pendientes en los próximos 7 días"
          />
          <StatCard
            icon="coins"
            label="Ingresos estimados"
            value={null}
            hint="Este mes, en RM, según las reservas confirmadas"
          />
        </div>
      </section>

      <p className="mt-6 text-xs text-gray-400">
        Las cifras de arriba se calcularán a partir de tus reservas reales más adelante; la
        estructura ya es la definitiva.
      </p>
    </>
  )
}
