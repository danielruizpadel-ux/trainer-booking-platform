'use client'

import { useState } from 'react'
import { DialogShell, dialogButton, fieldClass, labelClass } from '@/components/dashboard/DialogShell'
import { CLASS_TYPES, type ClassType } from '@/lib/availability/manage'
import { toDateStr } from '@/lib/dateUtils'

interface NewSlotDialogProps {
  onClose: () => void
  onCreated: () => void
}

const CLASS_TYPE_LABEL: Record<ClassType, string> = {
  private: 'Privada',
  group: 'Grupal',
  academy: 'Academia',
}

/** Añadir un hueco nuevo a la disponibilidad (Fase D). */
export function NewSlotDialog({ onClose, onCreated }: NewSlotDialogProps) {
  const today = toDateStr(new Date())
  const [date, setDate] = useState(today)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [classType, setClassType] = useState<ClassType>('private')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/dashboard/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_date: date, start_time: start, end_time: end, class_type: classType }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo crear el hueco')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el hueco')
      setSending(false)
    }
  }

  return (
    <DialogShell
      eyebrow="Disponibilidad"
      title="Añadir hueco"
      description="Se ofrecerá en tu calendario público en cuanto lo guardes."
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
            <button type="button" onClick={create} disabled={sending} className={dialogButton.primary}>
              {sending ? 'Guardando…' : 'Añadir hueco'}
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-slot-date" className={labelClass}>
            Fecha
          </label>
          <input
            id="new-slot-date"
            type="date"
            min={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={sending}
            className={fieldClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-slot-start" className={labelClass}>
              Empieza
            </label>
            <input
              id="new-slot-start"
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              disabled={sending}
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-slot-end" className={labelClass}>
              Termina
            </label>
            <input
              id="new-slot-end"
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              disabled={sending}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-slot-type" className={labelClass}>
            Tipo de clase
          </label>
          <select
            id="new-slot-type"
            value={classType}
            onChange={(event) => setClassType(event.target.value as ClassType)}
            disabled={sending}
            className={fieldClass}
          >
            {CLASS_TYPES.map((value) => (
              <option key={value} value={value}>
                {CLASS_TYPE_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </DialogShell>
  )
}
