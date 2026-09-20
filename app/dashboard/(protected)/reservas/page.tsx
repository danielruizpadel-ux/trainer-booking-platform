import type { Metadata } from 'next'
import { getCurrentSession } from '@/lib/auth/current-trainer'
import { listTrainerReservations } from '@/lib/reservations/queries'
import { isAwaitingConfirmation } from '@/lib/reservations/status'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { ReservationsView } from '@/components/dashboard/reservations/ReservationsView'
import { NewReservationButton } from '@/components/dashboard/reservations/NewReservationButton'

export const metadata: Metadata = { title: 'Reservas' }

// Siempre datos frescos: las decisiones cambian de pestaña al instante.
export const dynamic = 'force-dynamic'

export default async function ReservasPage() {
  const { trainer } = await getCurrentSession()
  if (!trainer) return null

  // El trainer_id sale de la sesión, nunca de la URL ni del cliente.
  const reservations = await listTrainerReservations(trainer.id)
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
        actions={<NewReservationButton />}
      />

      {reservations.length === 0 ? (
        <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-8 sm:p-12 text-center">
          <h2 className="text-base font-semibold text-gray-900">Todavía no hay reservas</h2>
          <p className="mt-1.5 text-sm text-gray-600">
            Cuando un cliente reserve desde tu página pública aparecerá aquí.
          </p>
        </div>
      ) : (
        <ReservationsView reservations={reservations} />
      )}
    </>
  )
}
