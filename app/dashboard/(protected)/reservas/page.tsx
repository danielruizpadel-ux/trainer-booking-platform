import type { Metadata } from 'next'
import { getCurrentSession } from '@/lib/auth/current-trainer'
import { listTrainerReservations } from '@/lib/reservations/queries'
import { listTrainerPackages } from '@/lib/packages/queries'
import { isAwaitingConfirmation } from '@/lib/reservations/status'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { ReservationsView } from '@/components/dashboard/reservations/ReservationsView'

export const metadata: Metadata = { title: 'Reservas' }

// Siempre datos frescos: las decisiones cambian de pestaña al instante.
export const dynamic = 'force-dynamic'

export default async function ReservasPage() {
  const { trainer } = await getCurrentSession()
  if (!trainer) return null

  // El trainer_id sale de la sesión, nunca de la URL ni del cliente.
  const reservations = await listTrainerReservations(trainer.id)

  // Paquetes de clases: misma página, pestaña "Paquetes" del selector de vista.
  let packages: Awaited<ReturnType<typeof listTrainerPackages>> = []
  let packagesError: string | null = null
  try {
    packages = await listTrainerPackages(trainer.id)
  } catch (error) {
    // Antes de aplicar migrations/006_class_packages.sql la tabla no existe.
    packagesError = error instanceof Error ? error.message : String(error)
  }
  // Solo las que puede decidir el entrenador; una propuesta enviada espera al cliente.
  const pendingCount = reservations.filter((r) => isAwaitingConfirmation(r.status)).length

  return (
    <>
      <PageHeader
        eyebrow="Reservas"
        title="Reservas"
        description={
          pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? 'reserva requiere' : 'reservas requieren'} tu confirmación. Reserva la pista y confirma la clase; si no consigues pista, avisa al cliente para que elija otra hora.`
            : 'Las sesiones que han reservado tus clientes.'
        }
      />

      <ReservationsView reservations={reservations} packages={packages} durations={trainer.class_durations} packagesError={packagesError} />
    </>
  )
}
