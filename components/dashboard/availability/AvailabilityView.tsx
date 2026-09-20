'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/dashboard/PageHeader'
import type { WeeklyRange } from '@/lib/availability/weekly'
import type { AvailabilityOverride } from '@/lib/availability/overrides'
import { WeeklySchedule } from './WeeklySchedule'
import { DateOverridesPanel } from './DateOverridesPanel'
import { RegenerateBar } from './RegenerateBar'

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
      />

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <RegenerateBar />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <WeeklySchedule weekly={weekly} loading={loading} onChanged={loadSchedule} />
        <DateOverridesPanel overrides={overrides} loading={loading} onChanged={loadSchedule} />
      </div>
    </>
  )
}
