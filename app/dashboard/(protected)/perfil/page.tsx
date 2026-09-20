import type { Metadata } from 'next'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { ComingSoon } from '@/components/dashboard/ComingSoon'

export const metadata: Metadata = { title: 'Perfil' }

export default function PerfilPage() {
  return (
    <>
      <PageHeader
        eyebrow="Perfil"
        title="Perfil"
        description="Lo que ven tus clientes en tu página pública."
      />
      <ComingSoon
        icon="user"
        title="Datos del perfil"
        description="Aquí cambiarás tu foto, tu descripción, tus datos de contacto y tus precios base."
        phase="Fase E"
      />
    </>
  )
}
