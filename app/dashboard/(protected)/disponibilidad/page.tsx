import type { Metadata } from 'next'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { ComingSoon } from '@/components/dashboard/ComingSoon'

export const metadata: Metadata = { title: 'Disponibilidad' }

export default function DisponibilidadPage() {
  return (
    <>
      <PageHeader
        eyebrow="Disponibilidad"
        title="Disponibilidad"
        description="Los huecos que ofreces en el calendario público."
      />
      <ComingSoon
        icon="clock"
        title="Gestión de huecos"
        description="Aquí crearás, editarás y cerrarás los horarios que tus clientes pueden reservar."
        phase="Fase D"
      />
    </>
  )
}
