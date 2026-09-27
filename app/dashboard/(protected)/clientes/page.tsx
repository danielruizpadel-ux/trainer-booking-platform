import type { Metadata } from 'next'
import { getCurrentSession } from '@/lib/auth/current-trainer'
import { listTrainerClients } from '@/lib/clients/queries'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { ClientsTable } from '@/components/dashboard/clients/ClientsTable'

export const metadata: Metadata = { title: 'Clientes' }
export const dynamic = 'force-dynamic'

export default async function ClientesPage() {
  const { trainer } = await getCurrentSession()
  if (!trainer) return null

  const clients = await listTrainerClients(trainer.id)

  return (
    <>
      <PageHeader
        eyebrow="Clientes"
        title="Clientes"
        description="Personas que tienen reservas contigo. Las cuentas de jugador se identifican por su cuenta; los invitados no se fusionan entre sí."
      />
      <ClientsTable clients={clients} />
    </>
  )
}
