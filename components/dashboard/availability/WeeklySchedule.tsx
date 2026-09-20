'use client'

import { useState } from 'react'
import type { WeeklyRange } from '@/lib/availability/weekly'
import { Toggle } from './Toggle'

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

interface WeeklyScheduleProps {
  weekly: WeeklyRange[]
  loading: boolean
  onChanged: () => void
}

/**
 * Horario semanal recurrente (Fase D, rediseño): un interruptor por día y,
 * si está encendido, uno o varios rangos horarios editables. Cada cambio se
 * guarda al momento (PATCH/POST/PUT/DELETE) y regenera los huecos reales de
 * las próximas 8 semanas en el servidor — no hay un botón "Guardar" aparte.
 */
export function WeeklySchedule({ weekly, loading, onChanged }: WeeklyScheduleProps) {
  const [busyDay, setBusyDay] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const byDay = new Map<number, WeeklyRange[]>()
  for (const range of weekly) {
    const list = byDay.get(range.day_of_week) ?? []
    list.push(range)
    byDay.set(range.day_of_week, list)
  }

  async function call(url: string, init?: RequestInit) {
    const response = await fetch(url, init)
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar el cambio')
    return data
  }

  async function toggleDay(day: number, enabled: boolean) {
    setBusyDay(day)
    setError(null)
    try {
      await call(`/api/dashboard/availability/schedule/day/${day}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
    } finally {
      setBusyDay(null)
    }
  }

  async function addRange(day: number) {
    setBusyDay(day)
    setError(null)
    try {
      await call('/api/dashboard/availability/schedule/range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_of_week: day, start_time: '09:00', end_time: '17:00', class_type: 'private' }),
      })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir el horario')
    } finally {
      setBusyDay(null)
    }
  }

  async function updateRange(day: number, id: string, patch: { start_time?: string; end_time?: string }, current: WeeklyRange) {
    setBusyDay(day)
    setError(null)
    try {
      await call(`/api/dashboard/availability/schedule/range/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_time: patch.start_time ?? current.start_time.slice(0, 5), end_time: patch.end_time ?? current.end_time.slice(0, 5) }),
      })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el horario')
    } finally {
      setBusyDay(null)
    }
  }

  async function removeRange(day: number, id: string) {
    setBusyDay(day)
    setError(null)
    try {
      await call(`/api/dashboard/availability/schedule/range/${id}`, { method: 'DELETE' })
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el horario')
    } finally {
      setBusyDay(null)
    }
  }

  return (
    <div className={`bg-white rounded-2xl ring-1 ring-gray-200/70 divide-y divide-gray-100 ${loading ? 'opacity-60' : ''} transition-opacity`}>
      {error && (
        <p role="alert" className="px-5 sm:px-6 py-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {DAY_LABELS.map((label, day) => {
        const ranges = byDay.get(day) ?? []
        const enabled = ranges.length > 0 && ranges[0].enabled
        const isBusy = busyDay === day

        return (
          <div key={day} className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6 px-5 sm:px-6 py-5">
            <div className="flex items-center gap-3 sm:w-40 shrink-0">
              <Toggle checked={enabled} disabled={isBusy || loading} onChange={(value) => toggleDay(day, value)} label={label} />
              <span className={`text-sm font-medium ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
            </div>

            <div className="flex-1 min-w-0">
              {!enabled ? (
                <p className="text-sm text-gray-400 py-2">Sin horario</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {ranges.map((range) => (
                    <div key={range.id} className="flex items-center gap-2">
                      <input
                        type="time"
                        defaultValue={range.start_time.slice(0, 5)}
                        disabled={isBusy}
                        onBlur={(event) => {
                          if (event.target.value && event.target.value !== range.start_time.slice(0, 5)) {
                            updateRange(day, range.id, { start_time: event.target.value }, range)
                          }
                        }}
                        className="h-9 rounded-lg px-2.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 transition-all duration-150"
                      />
                      <span className="text-sm text-gray-400">–</span>
                      <input
                        type="time"
                        defaultValue={range.end_time.slice(0, 5)}
                        disabled={isBusy}
                        onBlur={(event) => {
                          if (event.target.value && event.target.value !== range.end_time.slice(0, 5)) {
                            updateRange(day, range.id, { end_time: event.target.value }, range)
                          }
                        }}
                        className="h-9 rounded-lg px-2.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 transition-all duration-150"
                      />
                      <button
                        type="button"
                        aria-label="Quitar este horario"
                        disabled={isBusy}
                        onClick={() => removeRange(day, range.id)}
                        className="h-9 w-9 shrink-0 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center disabled:opacity-50"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => addRange(day)}
                    className="self-start text-sm font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 disabled:opacity-50 mt-1"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Añadir horario
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
