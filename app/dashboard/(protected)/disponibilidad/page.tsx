import type { Metadata } from 'next'
import { AvailabilityView } from '@/components/dashboard/availability/AvailabilityView'

export const metadata: Metadata = { title: 'Disponibilidad' }

export default function DisponibilidadPage() {
  return <AvailabilityView />
}
