'use client'

import { useEffect, useState } from 'react'
import type { WeeklyRange } from '@/lib/availability/weekly'
import { Toggle } from './Toggle'

const DAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DEFAULT_START = '09:00'
const DEFAULT_END = '17:00'

/** Rango en edición local: sin `id` = todavía no existe en el servidor. */
interface DraftRange {
  localKey: string
  id?: string
  day_of_week: number
  start_time: string
  end_time: string
  class_type: string
  enabled: boolean
}

function toDraft(ranges: WeeklyRange[]): DraftRange[] {
  return ranges.map((r) => ({ ...r, localKey: r.id }))
}

let localKeySeq = 0
function newLocalKey() {
  localKeySeq += 1
  return `new-${Date.now()}-${localKeySeq}`
}

interface WeeklyScheduleProps {
  weekly: WeeklyRange[]
  loading: boolean
  /** Se llama después de guardar con éxito, para recargar desde el servidor. */
  onSaved: () => void
}

/**
 * Horario semanal recurrente: edición local (interruptores, rangos, horas) y
 * un único "Guardar cambios" que reconcilia todo con el servidor de una vez
 * (crea lo nuevo, borra lo quitado, actualiza horas cambiadas, enciende/apaga
 * días completos) y regenera los huecos reales. "Cancelar" descarta la
 * edición y vuelve a lo último guardado.
 */
export function WeeklySchedule({ weekly, loading, onSaved }: WeeklyScheduleProps) {
  const [draft, setDraft] = useState<DraftRange[]>(() => toDraft(weekly))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  // Solo se resincroniza cuando el padre trae datos nuevos de verdad (carga
  // inicial, o justo después de guardar) — nunca pisa una edición en curso.
  useEffect(() => {
    setDraft(toDraft(weekly))
    setDirty(false)
  }, [weekly])

  function mutate(updater: (current: DraftRange[]) => DraftRange[]) {
    setDraft(updater)
    setDirty(true)
    setSavedMessage(null)
  }

  function toggleDay(day: number, enabled: boolean) {
    mutate((current) => {
      const hasRanges = current.some((r) => r.day_of_week === day)
      if (!hasRanges && enabled) {
        return [
          ...current,
          { localKey: newLocalKey(), day_of_week: day, start_time: DEFAULT_START, end_time: DEFAULT_END, class_type: 'private', enabled: true },
        ]
      }
      return current.map((r) => (r.day_of_week === day ? { ...r, enabled } : r))
    })
  }

  function addRange(day: number) {
    mutate((current) => [
      ...current,
      { localKey: newLocalKey(), day_of_week: day, start_time: DEFAULT_START, end_time: DEFAULT_END, class_type: 'private', enabled: true },
    ])
  }

  function updateRange(localKey: string, patch: { start_time?: string; end_time?: string }) {
    mutate((current) => current.map((r) => (r.localKey === localKey ? { ...r, ...patch } : r)))
  }

  function removeRange(day: number, localKey: string) {
    mutate((current) => {
      const remaining = current.filter((r) => r.localKey !== localKey)
      const dayStillHasRanges = remaining.some((r) => r.day_of_week === day)
      // Sin rangos, el día no puede quedar "encendido": se apaga solo.
      return dayStillHasRanges ? remaining : remaining.map((r) => (r.day_of_week === day ? { ...r, enabled: false } : r))
    })
  }

  function cancel() {
    setDraft(toDraft(weekly))
    setDirty(false)
    setError(null)
    setSavedMessage(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSavedMessage(null)
    try {
      const originalById = new Map(weekly.map((r) => [r.id, r]))
      const draftIds = new Set(draft.filter((r) => r.id).map((r) => r.id as string))

      // 1) borrar lo que ya no está
      for (const original of weekly) {
        if (!draftIds.has(original.id)) {
          await call(`/api/dashboard/availability/schedule/range/${original.id}`, { method: 'DELETE' }, SAVED_EVEN_IF_NOT_SYNCED)
        }
      }

      // 2) crear lo nuevo — solo si sigue encendido; uno que se creó y se
      //    apagó localmente sin llegar a guardarse no necesita persistirse.
      for (const range of draft) {
        if (!range.id && range.enabled) {
          await call('/api/dashboard/availability/schedule/range', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              day_of_week: range.day_of_week,
              start_time: range.start_time,
              end_time: range.end_time,
              class_type: range.class_type,
            }),
          }, SAVED_EVEN_IF_NOT_SYNCED)
        }
      }

      // 3) horas cambiadas en rangos que ya existían
      for (const range of draft) {
        if (!range.id) continue
        const original = originalById.get(range.id)
        if (original && (original.start_time.slice(0, 5) !== range.start_time.slice(0, 5) || original.end_time.slice(0, 5) !== range.end_time.slice(0, 5))) {
          await call(`/api/dashboard/availability/schedule/range/${range.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start_time: range.start_time, end_time: range.end_time }),
          }, SAVED_EVEN_IF_NOT_SYNCED)
        }
      }

      // 4) días que ya tenían rangos y solo cambiaron de encendido/apagado
      for (let day = 0; day < 7; day += 1) {
        const originalRanges = weekly.filter((r) => r.day_of_week === day)
        if (originalRanges.length === 0) continue // sin rangos previos, nada que apagar/encender aquí
        const originalEnabled = originalRanges[0].enabled
        const draftRanges = draft.filter((r) => r.day_of_week === day)
        const draftEnabled = draftRanges.length > 0 && draftRanges[0].enabled
        if (originalEnabled !== draftEnabled) {
          await call(`/api/dashboard/availability/schedule/day/${day}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: draftEnabled }),
          }, SAVED_EVEN_IF_NOT_SYNCED)
        }
      }

      // 5) un regenerado final para tener el resumen de qué cambió de verdad.
      //    Si falla, el horario está guardado pero la disponibilidad publicada
      //    NO ha cambiado (la sincronización es atómica): se dice así, no "Guardado".
      const generateResult = await call('/api/dashboard/availability/generate', { method: 'POST' })
      const { created, removed, keptOccupied, closed, reopened } =
        generateResult.summary ?? { created: 0, removed: 0, keptOccupied: 0, closed: 0, reopened: 0 }
      const parts: string[] = []
      if (created > 0) parts.push(`${created} hueco${created === 1 ? '' : 's'} nuevo${created === 1 ? '' : 's'}`)
      if (removed > 0) parts.push(`${removed} retirado${removed === 1 ? '' : 's'}`)
      if (closed > 0) parts.push(`${closed} con reserva, cerrado${closed === 1 ? '' : 's'} a nuevas reservas`)
      if (reopened > 0) parts.push(`${reopened} reabierto${reopened === 1 ? '' : 's'}`)
      const stillHeld = keptOccupied - closed - reopened
      if (stillHeld > 0) parts.push(`${stillHeld} con reserva, sin tocar`)
      setSavedMessage(parts.length > 0 ? `Guardado — ${parts.join(' · ')}` : 'Guardado — sin cambios en los huecos')

      setDirty(false)
      onSaved()
    } catch (err) {
      if (err instanceof SyncFailedError) {
        // El horario sí se guardó (todos los pasos anteriores fueron bien):
        // se recarga, pero sin mensaje de éxito y diciendo qué NO pasó.
        setDirty(false)
        onSaved()
        setError(SAVED_NOT_PUBLISHED)
        return
      }
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const byDay = new Map<number, DraftRange[]>()
  for (const range of draft) {
    const list = byDay.get(range.day_of_week) ?? []
    list.push(range)
    byDay.set(range.day_of_week, list)
  }

  return (
    <div className={`bg-white rounded-2xl ring-1 ring-gray-200/70 ${loading ? 'opacity-60' : ''} transition-opacity`}>
      <div className="divide-y divide-gray-100">
        {error && (
          <p role="alert" className="px-5 sm:px-6 py-3 text-sm text-red-600">
            {error}
          </p>
        )}
        {DAY_LABELS.map((label, day) => {
          const ranges = byDay.get(day) ?? []
          const enabled = ranges.length > 0 && ranges[0].enabled

          return (
            <div key={day} className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6 px-5 sm:px-6 py-5">
              <div className="flex items-center gap-3 sm:w-40 shrink-0">
                <Toggle checked={enabled} disabled={saving} onChange={(value) => toggleDay(day, value)} label={label} />
                <span className={`text-sm font-medium ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
              </div>

              <div className="flex-1 min-w-0">
                {!enabled ? (
                  <p className="text-sm text-gray-400 py-2">Sin horario</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {ranges.map((range, index) => (
                      <div key={range.localKey} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={range.start_time.slice(0, 5)}
                          disabled={saving}
                          onChange={(event) => updateRange(range.localKey, { start_time: event.target.value })}
                          className="h-9 rounded-lg px-2.5 text-sm text-blue-700 font-medium ring-1 ring-inset ring-gray-200 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 transition-all duration-150"
                        />
                        <span className="text-sm text-gray-400">–</span>
                        <input
                          type="time"
                          value={range.end_time.slice(0, 5)}
                          disabled={saving}
                          onChange={(event) => updateRange(range.localKey, { end_time: event.target.value })}
                          className="h-9 rounded-lg px-2.5 text-sm text-blue-700 font-medium ring-1 ring-inset ring-gray-200 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 transition-all duration-150"
                        />
                        <button
                          type="button"
                          aria-label="Quitar este horario"
                          disabled={saving}
                          onClick={() => removeRange(day, range.localKey)}
                          className="h-9 w-9 shrink-0 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center disabled:opacity-50"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                        {index === ranges.length - 1 && (
                          <button
                            type="button"
                            aria-label="Añadir otro horario ese día"
                            disabled={saving}
                            onClick={() => addRange(day)}
                            className="h-9 w-9 shrink-0 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center justify-center disabled:opacity-50"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 sm:px-6 py-4 border-t border-gray-100">
        <button
          type="button"
          onClick={cancel}
          disabled={!dirty || saving}
          className="h-11 px-5 rounded-xl bg-white text-gray-900 text-sm font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="h-11 px-5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {savedMessage && (
          <p role="status" className="text-sm text-emerald-700">
            {savedMessage}
          </p>
        )}
      </div>
    </div>
  )
}

/** El cambio se guardó pero los huecos no se sincronizaron (code 'sync_failed', ver lib/availability/sync-response.ts). */
class SyncFailedError extends Error {}

/**
 * Pasos del guardado que escriben el horario: si solo falla la
 * sincronización (el cambio SÍ se guardó), se sigue con el resto; el paso
 * final (generate) vuelve a sincronizarlo todo y es el que decide qué se dice.
 */
const SAVED_EVEN_IF_NOT_SYNCED = { tolerateSyncFailure: true }

const SAVED_NOT_PUBLISHED =
  'Tu horario se ha guardado, pero tu disponibilidad publicada NO se ha actualizado: sigue exactamente como antes. Vuelve a intentarlo con «Sincronizar huecos».'

async function call(url: string, init?: RequestInit, options: { tolerateSyncFailure?: boolean } = {}) {
  const response = await fetch(url, init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.success) {
    if (data.code === 'sync_failed') {
      if (options.tolerateSyncFailure && data.saved) return data
      throw new SyncFailedError(data.error || 'La disponibilidad publicada no se ha actualizado')
    }
    throw new Error(data.error || 'No se pudo guardar el cambio')
  }
  return data
}
