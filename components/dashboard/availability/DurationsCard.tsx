'use client'

import { useEffect, useState } from 'react'
import { CLASS_DURATIONS, durationLabel } from '@/lib/availability/durations'
import { basePriceFor, formatRM, type SessionPriceRow } from '@/lib/reservations/pricing'

/**
 * Qué duraciones de clase ofrece el entrenador (1 h, 1 h 30 min o ambas).
 * Configuración global (trainers.class_durations, migración 007): vale para
 * el widget público, la reserva manual y los paquetes. No es por día ni por
 * franja.
 */
interface DurationsCardProps {
  /** Precios del entrenador (tarjeta Precios), para enseñar el de 1 jugador */
  prices?: SessionPriceRow[] | null
  /** Avisa de las duraciones ofrecidas (la tarjeta Precios las marca) */
  onDurationsChange?: (durations: number[]) => void
}

export function DurationsCard({ prices = null, onDurationsChange }: DurationsCardProps = {}) {
  const [durations, setDurationsState] = useState<number[] | null>(null)
  const setDurations = (value: number[]) => {
    setDurationsState(value)
    onDurationsChange?.(value)
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/availability/durations', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok || !data.success) throw new Error(data.error || 'No se pudieron cargar las duraciones')
        setDurations(data.durations)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
  }, [])

  async function toggle(value: number) {
    if (!durations) return
    const next = durations.includes(value) ? durations.filter((d) => d !== value) : [...durations, value].sort((a, b) => a - b)
    if (next.length === 0) {
      setError('Tienes que ofrecer al menos una duración')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/dashboard/availability/durations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durations: next }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar')
      setDurations(data.durations)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Duración de las clases</h2>
          <p className="mt-1 text-sm text-gray-500">
            Lo que tus clientes pueden elegir al reservar. El precio de cada duración y nº de jugadores lo pones en
            Precios; los descuentos por volumen se aplican igual.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CLASS_DURATIONS.map((d) => {
            const on = durations?.includes(d) ?? false
            const price = prices ? basePriceFor(prices, d, 1) : null
            return (
              <label
                key={d}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-inset cursor-pointer transition-all duration-150 ${
                  on ? 'ring-blue-600 bg-blue-50/60' : 'ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/40'
                } ${saving || !durations ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={saving || !durations}
                  onChange={() => toggle(d)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{durationLabel(d)}</span>
                  <span className="block text-xs text-gray-500 tabular-nums">
                    {prices === null ? '…' : price === null ? 'Sin precio' : `${formatRM(price)} · 1 jugador`}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {savedAt && !error && <p className="mt-3 text-xs text-gray-400">Guardado. Las horas libres se recalculan con la nueva rejilla.</p>}
    </section>
  )
}
