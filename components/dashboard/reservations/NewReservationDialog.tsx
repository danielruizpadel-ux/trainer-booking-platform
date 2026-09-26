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
import { addMinutes } from '@/lib/availability/windows'

interface NewReservationDialogProps {
  /** Duraciones que ofrece el entrenador (60/90) */
  durations: number[]
  onClose: () => void
  /**
   * Franja ya elegida (clic en un hueco libre del calendario del Resumen): se
   * abre directamente en "Datos del cliente" con esa fecha, hora y duración.
   * "Cambiar hueco" vuelve al selector en esa misma semana.
   */
  initialSlot?: SlotPick | null
  /**
   * Con `initialSlot`: duraciones del entrenador que caben a esa hora. Si hay
   * más de una, se elige en "Datos del cliente" (solo entre esas). El
   * servidor vuelve a validar al guardar.
   */
  initialDurations?: number[]
  /** Tras crear la reserva (p. ej. para recargar el calendario que la abrió) */
  onCreated?: () => void
  /**
   * Clase puntual (tramo arrastrado en el Resumen): fecha, hora y duración ya
   * fijadas, puede estar fuera del horario. Sin selector de hueco ni de
   * duración; se guarda con POST /api/dashboard/reservations/one-off.
   */
  oneOff?: { session_date: string; start_time: string; duration_minutes: number } | null
}

/**
 * "Nueva reserva" (Parte 4): hueco libre → datos del cliente → ¿ya tengo la
 * pista? Crea `confirmed` o `pending_confirmation` vía POST /api/dashboard/reservations.
 */
export function NewReservationDialog({ durations, onClose, initialSlot = null, initialDurations, onCreated, oneOff = null }: NewReservationDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<'slot' | 'client'>(initialSlot || oneOff ? 'client' : 'slot')
  const [duration, setDuration] = useState<number>(oneOff?.duration_minutes ?? initialSlot?.duration_minutes ?? durations[0] ?? 60)
  const [slot, setSlot] = useState<SlotPick | null>(
    oneOff
      ? { window_id: '', session_date: oneOff.session_date, start_time: oneOff.start_time, end_time: addMinutes(oneOff.start_time, oneOff.duration_minutes), duration_minutes: oneOff.duration_minutes }
      : initialSlot
  )
  // ¿La franja es la precargada? Solo entonces se elige la duración aquí;
  // elegida en el calendario del paso 1, la duración ya va con ella.
  const [preloaded, setPreloaded] = useState(Boolean(initialSlot))
  const fittingDurations = (initialDurations ?? (initialSlot ? [initialSlot.duration_minutes] : [])).filter((d) => durations.includes(d))
  const [client, setClient] = useState<ClientFieldValues>({ client_name: '', client_email: '', client_phone: '', notes: '' })
  const [confirmed, setConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Se perdió la respuesta al crear: no se deja reenviar (podría duplicarla).
  const [unconfirmed, setUnconfirmed] = useState(false)

  async function create() {
    if (!slot) return
    setSending(true)
    setError(null)
    try {
      // La puntual no lleva ventana: la decide el servidor (ver lib/reservations/one-off.ts).
      const response = oneOff
        ? await fetch('/api/dashboard/reservations/one-off', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_date: slot.session_date, start_time: slot.start_time, duration_minutes: duration, ...client, confirmed }),
          })
        : await fetch('/api/dashboard/reservations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slot_id: slot.window_id, start_time: slot.start_time, duration_minutes: duration, ...client, confirmed }),
          })
      const data = await response.json().catch(() => null)
      if (!data) throw new UnconfirmedCreate()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo crear la reserva')
      router.refresh()
      onCreated?.()
      onClose()
    } catch (err) {
      // fetch rechazado (red) o respuesta ilegible: puede haberse creado.
      if (err instanceof UnconfirmedCreate || err instanceof TypeError) {
        setUnconfirmed(true)
        router.refresh()
        onCreated?.()
        setError(UNCONFIRMED_CREATE_MESSAGE)
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo crear la reserva')
      }
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
      eyebrow={oneOff ? 'Clase puntual' : 'Nueva reserva'}
      title={step === 'slot' ? 'Elige una franja libre' : 'Datos del cliente'}
      description={
        step === 'slot'
          ? 'Solo tu disponibilidad abierta. Toca una hora de inicio.'
          : oneOff && slotLabel
            ? `${slotLabel}. Solo esta vez: no cambia tu disponibilidad.`
            : (slotLabel ?? undefined)
      }
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
            {oneOff ? (
              <span className="hidden sm:block" />
            ) : (
              <button type="button" onClick={() => setStep('slot')} disabled={sending} className="h-11 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors self-start">
                ← Cambiar hueco
              </button>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} disabled={sending} className={dialogButton.secondary}>Cancelar</button>
              <button
                type="button"
                onClick={create}
                disabled={sending || unconfirmed || !client.client_name.trim() || !client.client_email.trim()}
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
          <ReservationsCalendar
            mode="select"
            compact
            duration={duration}
            selected={slot}
            onSlotSelect={(pick) => {
              setSlot(pick)
              setPreloaded(false)
            }}
            initialDate={slot?.session_date ?? initialSlot?.session_date}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {!oneOff && preloaded && slot && durations.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-900">Duración</span>
              <DurationPicker
                durations={fittingDurations}
                value={duration}
                disabled={sending}
                onChange={(value) => {
                  setDuration(value)
                  setSlot({ ...slot, duration_minutes: value, end_time: addMinutes(slot.start_time, value) })
                }}
              />
              {durations.some((d) => !fittingDurations.includes(d)) && (
                <p className="text-xs text-gray-500">
                  {durations
                    .filter((d) => !fittingDurations.includes(d))
                    .map((d) => durationLabel(d))
                    .join(', ')}{' '}
                  no cabe a esta hora.
                </p>
              )}
            </div>
          )}
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

/** Sin respuesta legible del servidor al crear: no se sabe si se creó. */
class UnconfirmedCreate extends Error {}

const UNCONFIRMED_CREATE_MESSAGE =
  'No hemos podido confirmar si la reserva se ha creado (se perdió la respuesta). Revisa el calendario antes de volver a intentarlo.'
