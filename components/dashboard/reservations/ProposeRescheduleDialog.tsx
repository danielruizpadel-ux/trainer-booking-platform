'use client'

import { useState } from 'react'
import type { SlotPick } from '@/lib/reservations/calendar'
import { durationLabel } from '@/lib/availability/durations'
import { formatDayShort, formatTime } from '@/lib/reservations/format'
import { DialogShell, dialogButton } from '@/components/dashboard/DialogShell'
import { ReservationsCalendar } from './ReservationsCalendar'

interface ProposeRescheduleDialogProps {
  reservationId: string
  clientName: string
  /** Duración de la reserva original: la propuesta conserva la misma */
  durationMinutes: number
  onClose: () => void
  onProposed: () => void
}

/**
 * Diálogo "Proponer otra fecha": el calendario en modo selector, solo huecos
 * libres del propio entrenador. Al enviar, POST
 * /api/dashboard/reservations/[id]/propose crea la propuesta y libera el
 * hueco original (lib/reservations/proposal.ts).
 */
export function ProposeRescheduleDialog({ reservationId, clientName, durationMinutes, onClose, onProposed }: ProposeRescheduleDialogProps) {
  const [selected, setSelected] = useState<SlotPick | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!selected) return
    setSending(true)
    setError(null)
    try {
      const response = await fetch(`/api/dashboard/reservations/${reservationId}/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: selected.window_id, start_time: selected.start_time }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo enviar la propuesta')
      onProposed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la propuesta')
      setSending(false)
    }
  }

  return (
    <DialogShell
      eyebrow="Proponer otra fecha"
      title={`Elige un hueco libre para ${clientName}`}
      description={`Clase de ${durationLabel(durationMinutes)}. La franja actual se libera y el cliente recibe un enlace para aceptar o elegir otra hora.`}
      onClose={onClose}
      locked={sending}
      footer={
        <>
          <p className="text-sm text-gray-600">
            {selected ? (
              <>
                Propuesta:{' '}
                <span className="font-semibold text-gray-900">
                  {formatDayShort(selected.session_date)} · {formatTime(selected.start_time)} – {formatTime(selected.end_time)}
                </span>
              </>
            ) : (
              'Toca una hora de inicio libre en el calendario.'
            )}
            {error && (
              <span role="alert" className="block text-red-600 mt-1">
                {error}
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={sending} className={dialogButton.secondary}>
              Cancelar
            </button>
            <button type="button" onClick={send} disabled={!selected || sending} className={dialogButton.primary}>
              {sending ? 'Enviando…' : 'Enviar propuesta'}
            </button>
          </div>
        </>
      }
    >
      <ReservationsCalendar mode="select" compact duration={durationMinutes} selected={selected} onSlotSelect={setSelected} />
    </DialogShell>
  )
}
