'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TrainerReservation } from '@/lib/reservations/queries'
import type { CalendarSlot } from '@/lib/reservations/calendar'
import { formatDayShort, formatTime } from '@/lib/reservations/format'
import { RESERVATION_STATUS, isAwaitingConfirmation, reservationStatusLabel } from '@/lib/reservations/status'
import { DialogShell, dialogButton, fieldClass, labelClass } from '@/components/dashboard/DialogShell'
import { ClientFields, type ClientFieldValues } from './ClientFields'
import { ReservationsCalendar } from './ReservationsCalendar'

interface EditReservationDialogProps {
  reservation: TrainerReservation
  onClose: () => void
}

type Busy = null | 'save' | 'confirm' | 'cancel'

/**
 * Panel "Editar" (Parte 3): datos del cliente, precio, cambio de horario y
 * botones de estado. Edición directa: se asume que el entrenador ya habló
 * con el cliente, por eso no pasa por la página pública.
 */
export function EditReservationDialog({ reservation: r, onClose }: EditReservationDialogProps) {
  const router = useRouter()
  const [client, setClient] = useState<ClientFieldValues>({
    client_name: r.client_name,
    client_email: r.client_email,
    client_phone: r.client_phone ?? '',
    notes: r.notes ?? '',
  })
  const [price, setPrice] = useState(r.price === null || r.price === undefined ? '' : String(r.price))
  const [picking, setPicking] = useState(false)
  const [newSlot, setNewSlot] = useState<CalendarSlot | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)

  const status = (r.status ?? '').trim().toLowerCase()
  const isCancelled = status === RESERVATION_STATUS.CANCELLED || status === 'canceled'
  const canConfirm = isAwaitingConfirmation(status)

  async function call(method: 'PUT' | 'PATCH', body: unknown, kind: Exclude<Busy, null>) {
    setBusy(kind)
    setError(null)
    try {
      const response = await fetch(`/api/dashboard/reservations/${r.id}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar')
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setBusy(null)
    }
  }

  function save() {
    void call(
      'PUT',
      {
        ...client,
        price: price.trim() === '' ? null : Number(price),
        ...(newSlot ? { slot_id: newSlot.id } : {}),
      },
      'save'
    )
  }

  function cancelReservation() {
    if (!window.confirm(`¿Cancelar la reserva de ${r.client_name}? El hueco vuelve a estar libre.`)) return
    void call('PATCH', { action: 'cancel' }, 'cancel')
  }

  const currentSlot = r.slot
    ? `${formatDayShort(r.slot.session_date)} · ${formatTime(r.slot.start_time)} – ${formatTime(r.slot.end_time)}`
    : 'Sin hueco'

  return (
    <DialogShell
      eyebrow="Editar reserva"
      title={r.client_name}
      description={reservationStatusLabel(r.status)}
      onClose={onClose}
      locked={busy !== null}
      footer={
        <>
          <div className="flex flex-wrap gap-2">
            {!isCancelled && (
              <button type="button" onClick={cancelReservation} disabled={busy !== null} className={dialogButton.danger}>
                {busy === 'cancel' ? 'Cancelando…' : 'Cancelar reserva'}
              </button>
            )}
            {canConfirm && (
              <button type="button" onClick={() => call('PATCH', { action: 'confirm' }, 'confirm')} disabled={busy !== null} className={dialogButton.secondary}>
                {busy === 'confirm' ? 'Confirmando…' : 'Confirmar clase'}
              </button>
            )}
          </div>
          <div className="flex gap-2 sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy !== null} className={dialogButton.secondary}>
              Cerrar
            </button>
            <button type="button" onClick={save} disabled={busy !== null} className={dialogButton.primary}>
              {busy === 'save' ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Cliente</h3>
          <ClientFields values={client} onChange={setClient} disabled={busy !== null} idPrefix="edit" />
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-price" className={labelClass}>
              Precio (RM)
            </label>
            <input
              id="edit-price"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              disabled={busy !== null}
              className={`${fieldClass} tabular-nums`}
              placeholder="Sin precio"
            />
            <p className="text-xs text-gray-500">Override manual. Vacío = sin precio.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Horario</span>
            <div className="min-h-11 rounded-xl px-4 py-2.5 ring-1 ring-inset ring-gray-200 bg-gray-50/50 text-sm flex items-center justify-between gap-3">
              <span className={newSlot ? 'line-through text-gray-400' : 'text-gray-900'}>{currentSlot}</span>
              <button
                type="button"
                onClick={() => setPicking((v) => !v)}
                disabled={busy !== null}
                className="h-8 px-2.5 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap"
              >
                {picking ? 'Ocultar calendario' : 'Cambiar horario'}
              </button>
            </div>
            {newSlot && (
              <p className="text-sm text-gray-900">
                Nuevo: <span className="font-semibold">{formatDayShort(newSlot.session_date)} · {formatTime(newSlot.start_time)} – {formatTime(newSlot.end_time)}</span>{' '}
                <button type="button" onClick={() => setNewSlot(null)} className="text-gray-500 underline-offset-2 hover:underline">
                  deshacer
                </button>
              </p>
            )}
          </div>
        </section>

        {picking && (
          <section className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">
              Elige un hueco libre. El actual se libera y el nuevo queda {status === 'confirmed' ? 'ocupado' : 'pendiente'}.
              {!isCancelled && status === 'needs_reschedule' ? ' Al moverla vuelve a estar pendiente de confirmar.' : ''}
            </p>
            <ReservationsCalendar mode="select" compact selectedSlotId={newSlot?.id ?? null} onSlotSelect={setNewSlot} initialDate={r.slot?.session_date} />
          </section>
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
