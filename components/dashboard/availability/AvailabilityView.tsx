'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/dashboard/PageHeader'
import type { WeeklyRange } from '@/lib/availability/weekly'
import type { AvailabilityOverride } from '@/lib/availability/overrides'
import { WeeklySchedule } from './WeeklySchedule'
import { DateOverridesPanel } from './DateOverridesPanel'
import { DurationsCard } from './DurationsCard'
import { PricingCard } from './PricingCard'
import { useTrainerPricing } from '@/components/dashboard/useTrainerPricing'
import { SyncAvailabilityButton } from './SyncAvailabilityButton'

/**
 * Composición de /dashboard/disponibilidad: horario semanal recurrente +
 * excepciones puntuales (estilo Cal.com). Cada cambio genera solo, en el
 * servidor, los huecos reales de las próximas 8 semanas — no hay vista de
 * calendario aquí (se quitó a petición de Daniel: los huecos ya generados se
 * ven, si hace falta, desde Reservas → Calendario).
 */
export function AvailabilityView() {
  const [weekly, setWeekly] = useState<WeeklyRange[]>([])
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pricing = useTrainerPricing()
  const [offered, setOffered] = useState<number[] | null>(null)

  const loadSchedule = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/dashboard/availability/schedule', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok || !data.success) throw new Error(data.error || 'No se pudo cargar el horario')
        return data
      })
      .then((data) => {
        setWeekly(data.weekly)
        setOverrides(data.overrides)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  return (
    <>
      <PageHeader
        eyebrow="Disponibilidad"
        title="Disponibilidad"
        description="Tu horario habitual, cada semana. Los huecos reales se generan solos para las próximas 8 semanas."
        actions={<SyncAvailabilityButton />}
      />

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-col gap-6">
        <DurationsCard prices={pricing.rows} onDurationsChange={setOffered} />
        <PricingCard pricing={pricing} offered={offered} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <WeeklySchedule weekly={weekly} loading={loading} onSaved={loadSchedule} />
        <DateOverridesPanel overrides={overrides} loading={loading} onChanged={loadSchedule} />
      </div>
    </>
  )
}
