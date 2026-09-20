'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CalendarSlot } from '@/lib/reservations/calendar'
import { formatDayShort, formatTime } from '@/lib/reservations/format'
import { DialogShell, dialogButton } from '@/components/dashboard/DialogShell'
import { ClientFields, type ClientFieldValues } from './ClientFields'
import { ReservationsCalendar } from './ReservationsCalendar'

interface NewReservationDialogProps {
  onClose: () => void
}

/**
 * "Nueva reserva" (Parte 4): hueco libre → datos del cliente → ¿ya tengo la
 * pista? Crea `confirmed` o `pending_confirmation` vía POST /api/dashboard/reservations.
 */
export function NewReservationDialog({ onClose }: NewReservationDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<'slot' | 'client'>('slot')
  const [slot, setSlot] = useState<CalendarSlot | null>(null)
  const [client, setClient] = useState<ClientFieldValues>({ client_name: '', client_email: '', client_phone: '', notes: '' })
  const [confirmed, setConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (!slot) return
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/dashboard/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slot.id, ...client, confirmed }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo crear la reserva')
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la reserva')
      setSending(false)
    }
  }

  const slotLabel = slot ? `${formatDayShort(slot.session_date)} · ${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}` : null

  return (
    <DialogShell
      eyebrow="Nueva reserva"
      title={step === 'slot' ? 'Elige un hueco libre' : 'Datos del cliente'}
      description={step === 'slot' ? 'Solo tu disponibilidad abierta.' : slotLabel ?? undefined}
      onClose={onClose}
      locked={sending}
      footer={
        step === 'slot' ? (
          <>
            <p className="text-sm text-gray-600">{slotLabel ? <>Hueco: <span className="font-semibold text-gray-900">{slotLabel}</span></> : 'Toca un hueco libre del calendario.'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={dialogButton.secondary}>Cancelar</button>
              <button type="button" onClick={() => setStep('client')} disabled={!slot} className={dialogButton.primary}>Continuar</button>
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setStep('slot')} disabled={sending} className="h-11 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors self-start">
              ← Cambiar hueco
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={sending} className={dialogButton.secondary}>Cancelar</button>
              <button
                type="button"
                onClick={create}
                disabled={sending || !client.client_name.trim() || !client.client_email.trim()}
                className={dialogButton.primary}
              >
                {sending ? 'Creando…' : confirmed ? 'Crear confirmada' : 'Crear pendiente'}
              </button>
            </div>
          </>
        )
      }
    >
      {step === 'slot' ? (
        <ReservationsCalendar mode="select" compact selectedSlotId={slot?.id ?? null} onSlotSelect={setSlot} />
      ) : (
        <div className="flex flex-col gap-6">
          <ClientFields values={client} onChange={setClient} disabled={sending} idPrefix="new" />

          <label className="flex items-start gap-3 rounded-xl ring-1 ring-inset ring-gray-200 hover:ring-gray-300 p-4 cursor-pointer transition-all duration-150">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={sending}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Ya tengo la pista reservada</span>
              <span className="block text-sm text-gray-500">
                Marcado: la reserva nace confirmada. Sin marcar: queda pendiente de confirmar, igual que las de la web.
              </span>
            </span>
          </label>

          <p className="text-sm text-gray-500">Precio: el de una sesión según la tarifa habitual (RM 300). Se puede cambiar después desde Editar.</p>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </DialogShell>
  )
}
