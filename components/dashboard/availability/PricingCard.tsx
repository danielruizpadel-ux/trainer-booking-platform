'use client'

import { useEffect, useState } from 'react'
import { CLASS_DURATIONS, durationLabel } from '@/lib/availability/durations'
import { PLAYER_COUNTS, SESSION_DISCOUNTS, basePriceFor, type SessionPriceRow } from '@/lib/reservations/pricing'
import type { useTrainerPricing } from '@/components/dashboard/useTrainerPricing'

type Grid = Record<string, string>

const key = (duration: number, players: number) => `${duration}:${players}`

function toGrid(rows: SessionPriceRow[]): Grid {
  const grid: Grid = {}
  for (const d of CLASS_DURATIONS) {
    for (const p of PLAYER_COUNTS) {
      const price = basePriceFor(rows, d, p)
      grid[key(d, p)] = price === null ? '' : String(price)
    }
  }
  return grid
}

/** Mismo criterio que el servidor (parseTrainerPrices); el que manda es el servidor. */
function invalidCell(value: string): boolean {
  const n = Number(value.trim().replace(',', '.'))
  return value.trim() === '' || !Number.isFinite(n) || n <= 0 || n > 100000 || Math.round(n * 100) !== n * 100
}

interface PricingCardProps {
  pricing: ReturnType<typeof useTrainerPricing>
  /** Duraciones que ofrece ahora (las otras se pueden dejar preparadas) */
  offered: number[] | null
}

/**
 * Precios por duración × nº de jugadores (trainer_session_prices, migración
 * 010). Es la tarifa VIGENTE: cambiarla no toca las reservas ya hechas, que
 * guardan su precio. La reserva manual y los paquetes usan el de 1 jugador.
 */
export function PricingCard({ pricing, offered }: PricingCardProps) {
  const [grid, setGrid] = useState<Grid | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    if (pricing.rows) setGrid(toGrid(pricing.rows))
  }, [pricing.rows])

  const dirty = grid !== null && pricing.rows !== null && JSON.stringify(grid) !== JSON.stringify(toGrid(pricing.rows))
  const hasInvalid = grid !== null && Object.values(grid).some(invalidCell)

  async function save() {
    if (!grid) return
    setSaving(true)
    setError(null)
    try {
      const prices = CLASS_DURATIONS.flatMap((d) =>
        PLAYER_COUNTS.map((p) => ({ duration_minutes: d, player_count: p, price_rm: grid[key(d, p)].trim().replace(',', '.') }))
      )
      const response = await fetch('/api/dashboard/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudieron guardar los precios')
      pricing.setRows(data.prices)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los precios')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Precios</h2>
          <p className="mt-1 text-sm text-gray-500">
            Precio por clase según la duración y cuántas personas vienen. Lo que ya está reservado conserva su precio.
            La reserva manual y los paquetes usan el precio de 1 jugador.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!grid || !dirty || hasInvalid || saving}
          className="h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100 shrink-0"
        >
          {saving ? 'Guardando…' : 'Guardar precios'}
        </button>
      </div>

      {pricing.error && !grid && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {pricing.error}
        </p>
      )}

      {grid && (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {CLASS_DURATIONS.map((d) => {
            const isOffered = offered === null || offered.includes(d)
            return (
              <div key={d} className="rounded-xl ring-1 ring-inset ring-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {durationLabel(d)}
                  {!isOffered && <span className="normal-case tracking-normal font-medium"> · no la ofreces ahora</span>}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {PLAYER_COUNTS.map((p) => {
                    const id = `price-${d}-${p}`
                    const value = grid[key(d, p)]
                    const invalid = invalidCell(value)
                    return (
                      <div key={p} className="flex items-center justify-between gap-3">
                        <label htmlFor={id} className="text-sm text-gray-700">
                          {p} {p === 1 ? 'jugador' : 'jugadores'}
                        </label>
                        <div className="relative w-32">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">RM</span>
                          <input
                            id={id}
                            inputMode="decimal"
                            value={value}
                            onChange={(event) => {
                              setGrid({ ...grid, [key(d, p)]: event.target.value })
                              setSavedAt(null)
                            }}
                            disabled={saving}
                            aria-invalid={invalid}
                            className={`h-10 w-full rounded-lg pl-10 pr-3 text-right text-sm text-gray-900 tabular-nums ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
                              invalid ? 'ring-red-300' : 'ring-gray-200'
                            }`}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-500">
        Descuento por nº de sesiones en una misma reserva:{' '}
        {SESSION_DISCOUNTS.slice()
          .reverse()
          .map((s) => `${s.minSessions}+ sesiones −${s.percent} %`)
          .join(' · ')}
        . De momento no es editable.
      </p>

      {hasInvalid && <p className="mt-2 text-sm text-red-600">Cada precio tiene que ser mayor que 0 (como mucho 2 decimales).</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {savedAt && !error && <p className="mt-2 text-xs text-gray-400">Guardado. Las próximas reservas usan estos precios.</p>}
    </section>
  )
}
