'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PackageDetail, PackageSession } from '@/lib/packages/status'
import { sessionCanBeScheduled, sessionHoldsCredit } from '@/lib/packages/status'
import type { SlotPick } from '@/lib/reservations/calendar'
import type { TrainerReservation } from '@/lib/reservations/queries'
import { formatDayShort, formatDuration, formatTime, reservationRangeOf } from '@/lib/reservations/format'
import { durationLabel } from '@/lib/availability/durations'
import { formatRM } from '@/lib/reservations/pricing'
import { DialogShell, dialogButton } from '@/components/dashboard/DialogShell'
import { ReservationsCalendar } from '@/components/dashboard/reservations/ReservationsCalendar'
import { StatusBadge } from '@/components/dashboard/reservations/StatusBadge'
import { EditReservationDialog } from '@/components/dashboard/reservations/EditReservationDialog'

interface PackageDetailDialogProps {
  packageId: string
  onClose: () => void
}

/**
 * Detalle de un paquete: cabecera (cliente, tamaño, precio) y una fila por
 * sesión. "Agendar" abre el mismo calendario selector que usan las reservas;
 * una sesión agendada es una reserva real, así que "Editar" abre
 * EditReservationDialog tal cual y "Cancelar" devuelve el crédito.
 */
export function PackageDetailDialog({ packageId, onClose }: PackageDetailDialogProps) {
  const router = useRouter()
  const [pkg, setPkg] = useState<PackageDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState<PackageSession | null>(null)
  const [slot, setSlot] = useState<SlotPick | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<TrainerReservation | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/dashboard/packages/${packageId}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo cargar el paquete')
      setPkg(data.package as PackageDetail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el paquete')
    }
  }, [packageId])

  useEffect(() => {
    void load()
  }, [load])

  function close() {
    router.refresh()
    onClose()
  }

  async function patch(session: PackageSession, body: unknown) {
    setBusy(session.id)
    setError(null)
    try {
      const response = await fetch(`/api/dashboard/packages/${packageId}/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar')
      setScheduling(null)
      setSlot(null)
      setConfirmed(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(null)
    }
  }

  function unschedule(session: PackageSession) {
    if (!window.confirm(`¿Cancelar la sesión ${session.session_number}? El hueco se libera y el cliente conserva el crédito.`)) return
    void patch(session, { action: 'unschedule' })
  }

  const scheduled = pkg ? pkg.sessions.filter(sessionHoldsCredit).length : 0

  return (
    <DialogShell
      eyebrow="Paquete de clases"
      title={pkg ? pkg.client_name : 'Cargando…'}
      description={
        pkg
          ? `${pkg.sessions_total} clases de ${durationLabel(pkg.duration_minutes ?? 60)} · ${formatRM(pkg.price_per_session_discounted)} por clase${pkg.discount_percent > 0 ? ` (−${pkg.discount_percent} %)` : ''} · total ${formatRM(pkg.price_total)}`
          : undefined
      }
      onClose={close}
      locked={busy !== null || editing !== null}
      footer={
        <>
          <p className="text-sm text-gray-600">
            {pkg && (
              <>
                <span className="font-semibold text-gray-900 tabular-nums">{scheduled}/{pkg.sessions_total}</span> sesiones agendadas
                {pkg.client_phone && <span className="text-gray-400"> · {pkg.client_phone}</span>}
              </>
            )}
          </p>
          <button type="button" onClick={close} disabled={busy !== null} className={dialogButton.secondary}>
            Cerrar
          </button>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {pkg && (
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl ring-1 ring-gray-200/70 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/50 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <th scope="col" className="px-4 py-3 font-semibold">#</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Hora</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                    <th scope="col" className="px-4 py-3 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.sessions.map((session) => {
                    const r = session.reservation
                    const free = sessionCanBeScheduled(session)
                    const isBusy = busy === session.id
                    const isPicking = scheduling?.id === session.id
                    return (
                      <tr key={session.id} className={`border-t border-gray-100 ${isPicking ? 'bg-blue-50/60' : ''}`}>
                        <td className="px-4 py-3 tabular-nums text-gray-500">{session.session_number}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                          {r?.slot ? formatDayShort(r.slot.session_date) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-gray-900">
                          {r?.slot ? (
                            <>
                              {formatTime(reservationRangeOf(r)!.start_time)}
                              <span className="text-gray-500"> · {formatDuration(reservationRangeOf(r)!.start_time, reservationRangeOf(r)!.end_time)}</span>
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r && !free ? (
                            <StatusBadge status={r.status} />
                          ) : r ? (
                            <span className="inline-flex items-center gap-2">
                              <StatusBadge status={r.status} />
                              <span className="text-xs text-gray-500">crédito disponible</span>
                            </span>
                          ) : (
                            <span className="h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center bg-gray-100 text-gray-600">
                              Sin agendar
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {free ? (
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => {
                                  setScheduling(isPicking ? null : session)
                                  setSlot(null)
                                  setError(null)
                                }}
                                className={`h-9 px-3 rounded-lg text-sm font-semibold transition-all duration-150 whitespace-nowrap ${
                                  isPicking
                                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                                    : 'text-blue-600 hover:bg-blue-50'
                                }`}
                              >
                                {isPicking ? 'Eligiendo hueco…' : 'Agendar'}
                              </button>
                            ) : r ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy !== null}
                                  onClick={() => setEditing(toTrainerReservation(r))}
                                  className="h-9 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors whitespace-nowrap"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  disabled={busy !== null}
                                  onClick={() => unschedule(session)}
                                  className="h-9 px-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
                                >
                                  {isBusy ? 'Cancelando…' : 'Cancelar'}
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {scheduling && (
            <section className="flex flex-col gap-4 rounded-2xl ring-1 ring-blue-200 p-4 sm:p-5 bg-blue-50/30">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Agendar sesión {scheduling.session_number}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Clase de {durationLabel(pkg.duration_minutes ?? 60)} (la duración del paquete). Toca una hora de inicio libre; se crea una reserva normal a {formatRM(pkg.price_per_session_discounted)}.
                </p>
              </div>
              <ReservationsCalendar mode="select" compact duration={pkg.duration_minutes ?? 60} selected={slot} onSlotSelect={setSlot} />
              <label className="flex items-start gap-3 rounded-xl ring-1 ring-inset ring-gray-200 bg-white hover:ring-gray-300 p-4 cursor-pointer transition-all duration-150">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={busy !== null}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">Ya tengo la pista reservada</span>
                  <span className="block text-sm text-gray-500">Marcado: nace confirmada. Sin marcar: pendiente de confirmar.</span>
                </span>
              </label>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm text-gray-600">
                  {slot ? (
                    <>
                      Franja:{' '}
                      <span className="font-semibold text-gray-900">
                        {formatDayShort(slot.session_date)} · {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                      </span>
                    </>
                  ) : (
                    'Toca una hora de inicio libre en el calendario.'
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScheduling(null)
                      setSlot(null)
                    }}
                    disabled={busy !== null}
                    className={dialogButton.secondary}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => slot && patch(scheduling, { action: 'schedule', slot_id: slot.window_id, start_time: slot.start_time, confirmed })}
                    disabled={!slot || busy !== null}
                    className={dialogButton.primary}
                  >
                    {busy === scheduling.id ? 'Agendando…' : `Agendar sesión ${scheduling.session_number}`}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {editing && (
        <EditReservationDialog
          reservation={editing}
          onClose={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
    </DialogShell>
  )
}

/** La reserva enlazada tiene la misma forma que una fila de Reservas. */
function toTrainerReservation(r: NonNullable<PackageSession['reservation']>): TrainerReservation {
  return {
    id: r.id,
    status: r.status,
    client_name: r.client_name,
    client_email: r.client_email,
    client_phone: r.client_phone,
    notes: r.notes,
    price: r.price,
    created_at: r.created_at,
    start_time: r.start_time,
    end_time: r.end_time,
    duration_minutes: r.duration_minutes,
    proposal_token: null,
    rescheduled_from_id: null,
    slot: r.slot,
  }
}
