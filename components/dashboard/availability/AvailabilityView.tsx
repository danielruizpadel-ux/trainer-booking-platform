'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { AvailabilityCalendar } from './AvailabilityCalendar'
import { NewSlotButton } from './NewSlotButton'

/** Composición de /dashboard/disponibilidad: cabecera + calendario (Fase D). */
export function AvailabilityView() {
  const [refreshToken, setRefreshToken] = useState(0)

  return (
    <>
      <PageHeader
        eyebrow="Disponibilidad"
        title="Disponibilidad"
        description="Los huecos que ofreces en tu calendario público. Toca uno libre para cerrarlo."
        actions={<NewSlotButton onCreated={() => setRefreshToken((t) => t + 1)} />}
      />
      <AvailabilityCalendar refreshToken={refreshToken} />
    </>
  )
}
