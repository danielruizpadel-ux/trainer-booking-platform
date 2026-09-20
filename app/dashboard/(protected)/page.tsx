import type { Metadata } from 'next'
import { getCurrentSession } from '@/lib/auth/current-trainer'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { StatCard } from '@/components/dashboard/StatCard'

export const metadata: Metadata = { title: 'Resumen' }

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

  const firstName = trainer.name.trim().split(/\s+/)[0] || trainer.name

  return (
    <>
      <PageHeader
        eyebrow="Resumen"
        title={`Hola, ${firstName}`}
        description={`Tu agenda de un vistazo. Perfil público: /${trainer.slug}`}
      />

      <section aria-labelledby="stats-title">
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

      <section className="mt-6 bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
        <h2 className="text-base font-semibold text-gray-900">Todavía sin datos</h2>
        <p className="mt-1.5 text-sm text-gray-600">
          Las cifras se calcularán a partir de tus reservas reales en cuanto estén las
          secciones de Reservas y Disponibilidad. Mientras tanto la estructura ya es la
          definitiva.
        </p>
      </section>
    </>
  )
}
