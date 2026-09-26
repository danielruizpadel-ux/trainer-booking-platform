'use client'

import { useState } from 'react'
import type { AvailabilityOverride } from '@/lib/availability/overrides'
import { formatDayShort, formatTime } from '@/lib/reservations/format'
import { AddOverrideDialog } from './AddOverrideDialog'

interface DateOverridesPanelProps {
  overrides: AvailabilityOverride[]
  loading: boolean
  onChanged: () => void
}

/** Panel "Date Overrides": excepciones puntuales sobre el horario semanal. */
export function DateOverridesPanel({ overrides, loading, onChanged }: DateOverridesPanelProps) {
  const [open, setOpen] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function remove(id: string) {
    setRemovingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/dashboard/availability/overrides/${id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        // Quitada, pero los huecos no se sincronizaron: se recarga la lista y se avisa.
        if (data.code === 'sync_failed' && data.saved) onChanged()
        throw new Error(data.error || 'No se pudo quitar la excepción')
      }
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar la excepción')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className={`bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6 ${loading ? 'opacity-60' : ''} transition-opacity`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Excepciones</h2>
          <p className="mt-1 text-sm text-gray-500">Fechas concretas en las que tu disponibilidad cambia del horario habitual.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-sm font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Añadir excepción
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {overrides.length === 0 ? (
        <p className="mt-5 text-sm text-gray-400">No tienes ninguna excepción próxima.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {overrides.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl ring-1 ring-inset ring-gray-200 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{formatDayShort(item.override_date)}</p>
                <p className="text-sm text-gray-500">
                  {item.is_blocked ? 'Cerrado todo el día' : `${formatTime(item.start_time ?? '')} – ${formatTime(item.end_time ?? '')}`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Quitar excepción"
                disabled={removingId === item.id}
                onClick={() => remove(item.id)}
                className="h-9 w-9 shrink-0 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center disabled:opacity-50"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <AddOverrideDialog onClose={() => setOpen(false)} onCreated={onChanged} />}
    </div>
  )
}
