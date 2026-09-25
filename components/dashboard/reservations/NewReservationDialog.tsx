'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SlotPick } from '@/lib/reservations/calendar'
import { formatDayShort, formatTime } from '@/lib/reservations/format'
import { durationLabel } from '@/lib/availability/durations'
import { basePriceFor, formatRM } from '@/lib/reservations/pricing'
import { useTrainerPricing } from '@/components/dashboard/useTrainerPricing'
import { DurationPicker } from './DurationPicker'
import { DialogShell, dialogButton } from '@/components/dashboard/DialogShell'
import { ClientFields, type ClientFieldValues } from './ClientFields'
import { ReservationsCalendar } from './ReservationsCalendar'

interface NewReservationDialogProps {
  /** Duraciones que ofrece el entrenador (60/90) */
  durations: number[]
  onClose: () => void
}

/**
 * "Nueva reserva" (Parte 4): hueco libre → datos del cliente → ¿ya tengo la
 * pista? Crea `confirmed` o `pending_confirmation` vía POST /api/dashboard/reservations.
 */
export function NewReservationDialog({ durations, onClose }: NewReservationDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<'slot' | 'client'>('slot')
  const [duration, setDuration] = useState<number>(durations[0] ?? 60)
  const [slot, setSlot] = useState<SlotPick | null>(null)
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
        body: JSON.stringify({ slot_id: slot.window_id, start_time: slot.start_time, duration_minutes: duration, ...client, confirmed }),
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

  const slotLabel = slot
    ? `${formatDayShort(slot.session_date)} · ${formatTime(slot.start_time)} – ${formatTime(slot.end_time)} · ${durationLabel(duration)}`
    : null
  // Precio de 1 jugador del entrenador: solo para enseñarlo; lo fija el servidor.
  const pricing = useTrainerPricing()
  const price = pricing.rows ? basePriceFor(pricing.rows, duration, 1) : null

  return (
    <DialogShell
      eyebrow="Nueva reserva"
      title={step === 'slot' ? 'Elige una franja libre' : 'Datos del cliente'}
      description={step === 'slot' ? 'Solo tu disponibilidad abierta. Toca una hora de inicio.' : slotLabel ?? undefined}
      onClose={onClose}
      locked={sending}
      footer={
        step === 'slot' ? (
          <>
            <p className="text-sm text-gray-600">{slotLabel ? <>Franja: <span className="font-semibold text-gray-900">{slotLabel}</span></> : 'Toca una hora de inicio libre en el calendario.'}</p>
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
        <div className="flex flex-col gap-4">
          <DurationPicker
            durations={durations}
            value={duration}
            onChange={(value) => {
              setDuration(value)
              setSlot(null)
            }}
          />
          <ReservationsCalendar mode="select" compact duration={duration} selected={slot} onSlotSelect={setSlot} />
        </div>
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

          <p className="text-sm text-gray-500">
            {price !== null ? (
              <>Precio: {formatRM(price)} (clase de {durationLabel(duration)}, 1 jugador). Se puede cambiar después desde Editar.</>
            ) : pricing.rows ? (
              <span className="text-red-600">Sin precio para {durationLabel(duration)} (1 jugador): ponlo en Perfil → Public pricing.</span>
            ) : (
              'Cargando precio…'
            )}
          </p>

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
