'use client'

import { useEffect, useMemo, useState } from 'react'
import { CLASS_DURATIONS } from '@/lib/availability/durations'
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
  /** Duraciones que ofrece el entrenador (trainers.class_durations) */
  offered: number[]
}

/**
 * Precios públicos: duración × nº de jugadores (trainer_session_prices,
 * migración 010), GET/PUT /api/dashboard/pricing con el entrenador de la
 * sesión. Es la tarifa VIGENTE: cambiarla solo afecta a reservas futuras;
 * las hechas guardan su precio. La reserva manual y los paquetes usan el de
 * 1 jugador.
 *
 * Solo se enseñan las duraciones que ofrece. El servidor exige la rejilla
 * completa, así que las ocultas se guardan con sus valores actuales; si a
 * una oculta le falta algún precio, se enseña para poder rellenarlo.
 */
export function PricingCard({ pricing, offered }: PricingCardProps) {
  const [grid, setGrid] = useState<Grid | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    if (pricing.rows) setGrid(toGrid(pricing.rows))
  }, [pricing.rows])

  const hiddenIncomplete = useMemo(
    () =>
      grid
        ? CLASS_DURATIONS.filter((d) => !offered.includes(d) && PLAYER_COUNTS.some((p) => invalidCell(grid[key(d, p)])))
        : [],
    [grid, offered]
  )
  const visible = CLASS_DURATIONS.filter((d) => showAll || offered.includes(d) || hiddenIncomplete.includes(d))
  const hiddenCount = CLASS_DURATIONS.length - visible.length

  const dirty = grid !== null && pricing.rows !== null && JSON.stringify(grid) !== JSON.stringify(toGrid(pricing.rows))
  const hasInvalid = grid !== null && Object.values(grid).some(invalidCell)

  function setCell(d: number, p: number, value: string) {
    if (!grid) return
    setGrid({ ...grid, [key(d, p)]: value })
    setSavedAt(null)
  }

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
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not save prices.')
      pricing.setRows(data.prices)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save prices.')
    } finally {
      setSaving(false)
    }
  }

  const discountsCopy = SESSION_DISCOUNTS.slice()
    .reverse()
    .map((s) => `${s.minSessions}+ sessions −${s.percent}%`)
    .join(' · ')

  return (
    <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Public pricing</h2>
          <p className="mt-1 text-sm text-gray-500">
            These prices are shown on your public booking page, per session for the whole group.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!grid || !dirty || hasInvalid || saving}
          className="h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100 shrink-0 w-full sm:w-auto"
        >
          {saving ? 'Saving…' : 'Save prices'}
        </button>
      </div>

      {!grid && (
        <p role={pricing.error ? 'alert' : undefined} className={`mt-5 text-sm ${pricing.error ? 'text-red-600' : 'text-gray-400'}`}>
          {pricing.error ? 'Could not load prices.' : 'Loading prices…'}
        </p>
      )}

      {grid && (
        <div className="mt-5">
          {/* Cabecera de columnas: solo en sm+ (en móvil cada casilla lleva su etiqueta) */}
          <div className="hidden sm:grid grid-cols-[7rem_repeat(4,minmax(0,1fr))] gap-3 px-1 pb-2">
            <span />
            {PLAYER_COUNTS.map((p) => (
              <span key={p} className="text-xs font-semibold uppercase tracking-wider text-gray-400 text-center">
                {p} {p === 1 ? 'player' : 'players'}
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {visible.map((d) => {
              const isOffered = offered.includes(d)
              return (
                <div
                  key={d}
                  className="rounded-xl ring-1 ring-inset ring-gray-200 p-4 sm:p-3 sm:grid sm:grid-cols-[7rem_repeat(4,minmax(0,1fr))] sm:items-center sm:gap-3"
                >
                  <div className="mb-3 sm:mb-0 sm:pl-1">
                    <p className="text-sm font-semibold text-gray-900">{d} minutes</p>
                    {!isOffered && <p className="text-xs text-gray-400">Not offered now</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:contents">
                    {PLAYER_COUNTS.map((p) => {
                      const id = `price-${d}-${p}`
                      const value = grid[key(d, p)]
                      const invalid = invalidCell(value)
                      return (
                        <div key={p} className="flex flex-col gap-1">
                          <label htmlFor={id} className="text-xs text-gray-500 sm:sr-only">
                            {p} {p === 1 ? 'player' : 'players'}
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">RM</span>
                            <input
                              id={id}
                              inputMode="decimal"
                              value={value}
                              onChange={(event) => setCell(d, p, event.target.value)}
                              disabled={saving}
                              aria-invalid={invalid}
                              aria-label={`${d} minutes, ${p} ${p === 1 ? 'player' : 'players'}`}
                              className={`h-11 w-full min-w-0 rounded-lg pl-10 pr-3 text-right text-sm text-gray-900 tabular-nums ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 ${
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

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 h-9 px-3 -ml-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Also set prices for durations you don&apos;t offer now
            </button>
          )}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-gray-100 flex flex-col gap-1.5 text-xs text-gray-500">
        <p>Existing reservations keep their original price. Manual bookings and packages use the 1-player price.</p>
        <p>
          Multi-session discount in the same booking: {discountsCopy}. Not editable yet.
        </p>
      </div>

      {hasInvalid && <p className="mt-3 text-sm text-red-600">Every price must be greater than 0, with at most 2 decimals.</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {savedAt && !error && <p className="mt-3 text-sm text-emerald-600">Saved. New bookings use these prices.</p>}
    </section>
  )
}
