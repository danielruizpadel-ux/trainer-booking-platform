'use client'

import { useState } from 'react'
import { callApi } from './api'
import { describeSync, type SyncReport } from './sync-report'

/**
 * Botón de mantenimiento (21/09/2026, a petición de Daniel): sincroniza a
 * mano los huecos reales con la plantilla y limpia huecos manuales que ya no
 * tienen sentido (más viejos que el rediseño de horario semanal, sin
 * reserva). No hace falta para el uso normal — cada cambio de horario ya
 * regenera solo — pero sirve para corregir un desajuste puntual.
 *
 * 26/09/2026 (revisión de Codex): antes lanzaba las dos cosas a la vez y un
 * fallo de una dejaba dudas sobre la otra. Ahora van en serie: primero la
 * sincronización (atómica, 014); la limpieza solo si la sincronización se
 * confirmó. Cada una se informa por separado (sync-report.ts), sin afirmar
 * lo que no se sabe si se pierde una respuesta.
 */
export function SyncAvailabilityButton() {
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<SyncReport | null>(null)

  const run = async () => {
    setBusy(true)
    setReport(null)
    try {
      const sync = await callApi('/api/dashboard/availability/generate', { method: 'POST' }, 'No se ha sincronizado.')
      const purge =
        sync.kind === 'ok' ? await callApi('/api/dashboard/availability/purge-legacy', { method: 'POST' }, 'No se pudo limpiar') : null
      setReport(describeSync(sync, purge))
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
      {report && (
        <div className="flex max-w-sm flex-col items-end gap-1 text-right text-xs">
          {[report.sync, report.purge].map((line, i) => (
            <p
              key={i}
              role={line.tone === 'error' ? 'alert' : 'status'}
              className={line.tone === 'ok' ? 'text-gray-500' : line.tone === 'warning' ? 'text-amber-700' : 'text-red-600'}
            >
              {line.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
