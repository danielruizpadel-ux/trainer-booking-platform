'use client'

import { useState } from 'react'

/**
 * Cada cambio en el horario semanal o las excepciones ya regenera los huecos
 * reales en el servidor al momento — no hace falta guardar aparte. Pero como
 * esta página no tiene calendario (se quitó a petición de Daniel), no hay
 * forma de "ver" que pasó algo: este botón llama al mismo generador a mano y
 * enseña el resultado, para comprobarlo o forzarlo si algo se quedó a medias.
 */
export function RegenerateBar() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function regenerate() {
    setStatus('loading')
    setMessage(null)
    try {
      const response = await fetch('/api/dashboard/availability/generate', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo regenerar')
      const { created, removed, keptOccupied } = data.summary ?? { created: 0, removed: 0, keptOccupied: 0 }
      const parts: string[] = []
      if (created > 0) parts.push(`${created} hueco${created === 1 ? '' : 's'} nuevo${created === 1 ? '' : 's'}`)
      if (removed > 0) parts.push(`${removed} cerrado${removed === 1 ? '' : 's'}`)
      if (keptOccupied > 0) parts.push(`${keptOccupied} con reserva, sin tocar`)
      setMessage(parts.length > 0 ? parts.join(' · ') : 'Sin cambios: ya estaba al día')
      setStatus('done')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo regenerar')
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-blue-50/60 ring-1 ring-inset ring-blue-100 px-4 py-3 mb-6">
      <p className="text-sm text-blue-900 flex-1">
        Los cambios de arriba se aplican solos. Si no ves los huecos actualizados en Reservas → Calendario, regenéralos aquí.
      </p>
      <button
        type="button"
        onClick={regenerate}
        disabled={status === 'loading'}
        className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 shrink-0"
      >
        {status === 'loading' ? 'Regenerando…' : 'Regenerar huecos ahora'}
      </button>
      {message && (
        <p role="status" className={`text-sm sm:basis-full ${status === 'error' ? 'text-red-600' : 'text-blue-800'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
