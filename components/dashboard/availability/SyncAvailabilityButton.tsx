'use client'

import { useState } from 'react'

interface SyncResult {
  created: number
  removed: number
  legacyRemoved: number
  closed: number
  reopened: number
}

/**
 * Botón de mantenimiento (21/09/2026, a petición de Daniel): sincroniza a
 * mano los huecos reales con la plantilla y limpia huecos manuales que ya no
 * tienen sentido (más viejos que el rediseño de horario semanal, sin
 * reserva viva). No hace falta para el uso normal — cada cambio de horario
 * ya regenera solo — pero sirve para corregir un desajuste puntual sin
 * tener que tocar la base de datos a mano.
 */
export function SyncAvailabilityButton() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const [genRes, purgeRes] = await Promise.all([
        fetch('/api/dashboard/availability/generate', { method: 'POST' }).then((r) => r.json()),
        fetch('/api/dashboard/availability/purge-legacy', { method: 'POST' }).then((r) => r.json()),
      ])
      if (!genRes.success) throw new Error(genRes.error || 'No se pudo regenerar')
      if (!purgeRes.success) throw new Error(purgeRes.error || 'No se pudo limpiar')
      setResult({
        created: genRes.summary?.created ?? 0,
        removed: genRes.summary?.removed ?? 0,
        legacyRemoved: purgeRes.removed ?? 0,
        closed: genRes.summary?.closed ?? 0,
        reopened: genRes.summary?.reopened ?? 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al sincronizar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="h-11 px-5 rounded-xl bg-white text-gray-900 text-sm font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? 'Sincronizando…' : 'Sincronizar huecos'}
      </button>
      {result && !error && (
        <p className="text-xs text-gray-500">
          {result.created} creados, {result.removed + result.legacyRemoved} eliminados
          {result.closed > 0 ? `, ${result.closed} cerrados por reserva` : ''}
          {result.reopened > 0 ? `, ${result.reopened} reabiertos` : ''}.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
