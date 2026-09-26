'use client'

import { useState } from 'react'
import { DialogShell, dialogButton, fieldClass, labelClass } from '@/components/dashboard/DialogShell'
import { toDateStr } from '@/lib/dateUtils'

interface AddOverrideDialogProps {
  onClose: () => void
  onCreated: () => void
}

/** "Add Override": cerrar una fecha entera, o darle un horario distinto al habitual. */
export function AddOverrideDialog({ onClose, onCreated }: AddOverrideDialogProps) {
  const today = toDateStr(new Date())
  const [date, setDate] = useState(today)
  const [blocked, setBlocked] = useState(true)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('17:00')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Guardada, pero los huecos no se sincronizaron: no se deja volver a enviarla.
  const [savedNotSynced, setSavedNotSynced] = useState(false)

  async function create() {
    setSending(true)
    setError(null)
    try {
      const body = blocked
        ? { override_date: date, is_blocked: true }
        : { override_date: date, is_blocked: false, start_time: start, end_time: end }
      const response = await fetch('/api/dashboard/availability/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        if (data.code === 'sync_failed' && data.saved) {
          onCreated()
          setSavedNotSynced(true)
          setSending(false)
          setError(data.error)
          return
        }
        throw new Error(data.error || 'No se pudo añadir la excepción')
      }
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir la excepción')
      setSending(false)
    }
  }

  return (
    <DialogShell
      eyebrow="Disponibilidad"
      title="Añadir excepción"
      description="Para un día concreto que se sale de tu horario habitual."
      onClose={onClose}
      locked={sending}
      size="md"
      footer={
        <>
          <div />
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={sending} className={dialogButton.secondary}>
              Cancelar
            </button>
            <button type="button" onClick={create} disabled={sending || savedNotSynced} className={dialogButton.primary}>
              {sending ? 'Guardando…' : savedNotSynced ? 'Guardada, sin sincronizar' : 'Añadir excepción'}
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="override-date" className={labelClass}>
            Fecha
          </label>
          <input
            id="override-date"
            type="date"
            min={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={sending}
            className={fieldClass}
          />
        </div>

        <div role="radiogroup" aria-label="Tipo de excepción" className="flex flex-col gap-2">
          <label className="flex items-start gap-3 rounded-xl ring-1 ring-inset ring-gray-200 hover:ring-gray-300 p-4 cursor-pointer transition-all duration-150">
            <input type="radio" checked={blocked} onChange={() => setBlocked(true)} disabled={sending} className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500" />
            <span>
              <span className="block text-sm font-medium text-gray-900">Cerrado todo el día</span>
              <span className="block text-sm text-gray-500">No se ofrece ningún hueco ese día, aunque tu horario habitual lo abra.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl ring-1 ring-inset ring-gray-200 hover:ring-gray-300 p-4 cursor-pointer transition-all duration-150">
            <input type="radio" checked={!blocked} onChange={() => setBlocked(false)} disabled={sending} className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500" />
            <span className="block text-sm font-medium text-gray-900">Horario distinto ese día</span>
          </label>
        </div>

        {!blocked && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="override-start" className={labelClass}>
                Empieza
              </label>
              <input id="override-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} disabled={sending} className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="override-end" className={labelClass}>
                Termina
              </label>
              <input id="override-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} disabled={sending} className={fieldClass} />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </DialogShell>
  )
}
