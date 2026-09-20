'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/dashboard/PageHeader'
import type { WeeklyRange } from '@/lib/availability/weekly'
import type { AvailabilityOverride } from '@/lib/availability/overrides'
import { WeeklySchedule } from './WeeklySchedule'
import { DateOverridesPanel } from './DateOverridesPanel'
import { AvailabilityCalendar } from './AvailabilityCalendar'
import { NewSlotButton } from './NewSlotButton'

type Tab = 'schedule' | 'calendar'

/**
 * Composición de /dashboard/disponibilidad (Fase D, rediseño estilo Cal.com):
 *   Horario semanal   plantilla recurrente + excepciones puntuales; genera
 *                      los huecos reales de las próximas 8 semanas sola.
 *   Calendario         los huecos reales ya generados, más "Añadir hueco"
 *                      para algo puntual fuera de la plantilla.
 */
export function AvailabilityView() {
  const [tab, setTab] = useState<Tab>('schedule')
  const [weekly, setWeekly] = useState<WeeklyRange[]>([])
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [calendarRefreshToken, setCalendarRefreshToken] = useState(0)

  const loadSchedule = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/dashboard/availability/schedule')
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

  function handleChanged() {
    loadSchedule()
    setCalendarRefreshToken((t) => t + 1)
  }

  const switcher = (
    <div role="group" aria-label="Vista" className="inline-flex rounded-xl bg-gray-100 p-1">
      {(
        [
          { id: 'schedule', label: 'Horario semanal' },
          { id: 'calendar', label: 'Calendario' },
        ] as Array<{ id: Tab; label: string }>
      ).map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={tab === option.id}
          onClick={() => setTab(option.id)}
          className={`h-8 px-3 rounded-lg text-sm font-medium transition-all duration-150 ${
            tab === option.id ? 'bg-white text-gray-900 ring-1 ring-gray-200/70' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <PageHeader
        eyebrow="Disponibilidad"
        title="Disponibilidad"
        description={
          tab === 'schedule'
            ? 'Tu horario habitual, cada semana. Los huecos reales se generan solos para las próximas 8 semanas.'
            : 'Los huecos ya generados. Toca uno libre para cerrarlo, o añade uno puntual fuera de tu horario.'
        }
        actions={tab === 'calendar' ? <NewSlotButton onCreated={() => setCalendarRefreshToken((t) => t + 1)} /> : undefined}
      />

      <div className="mb-6">{switcher}</div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {tab === 'schedule' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
          <WeeklySchedule weekly={weekly} loading={loading} onChanged={handleChanged} />
          <DateOverridesPanel overrides={overrides} loading={loading} onChanged={handleChanged} />
        </div>
      ) : (
        <AvailabilityCalendar refreshToken={calendarRefreshToken} onSlotDeleted={() => setCalendarRefreshToken((t) => t + 1)} />
      )}
    </>
  )
}
