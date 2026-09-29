import { getSupabaseServerClient } from '@/lib/supabase/client'
import { getTrainerDurations } from '@/lib/availability/trainer-durations'
import { RESERVATION_STATUS } from './status'
import { calculateBookingPrice } from './pricing'
import { requireBasePrice } from './trainer-prices'
import { parseDetails, type ReservationDetailsInput } from './edit'
import { OVERLAP_MESSAGE, isSlotConflictError, loadOwnedOpenWindow, lookupStatus, refreshWindowStatus } from './slots'
import { isPastMalaysiaSession } from '@/lib/dateUtils'

/**
 * Reserva creada a mano por el entrenador (Parte 4).
 *   confirmed = true   ya tiene la pista → confirmed
 *   confirmed = false  igual que el flujo público → pending_confirmation
 * Ocupa [start_time, start_time + duración) en la ventana elegida, con la
 * misma comprobación de solapamiento que el widget público. Precio: el de
 * 1 jugador de esa duración en la tabla del entrenador (trainer_session_prices),
 * sin descuento. Sin precio configurado, error claro (nunca un RM300 fijo).
 *
 * Datos del checkout (migración 010): sin cuenta de jugador (player_id NULL),
 * sin mensaje del cliente (el entrenador usa las notas internas), 1 jugador y
 * sin WhatsApp (no se ha pedido consentimiento).
 */
export type ManualResult = { ok: true; id: string; status: string } | { ok: false; status: number; message: string }

export interface ManualReservationInput extends ReservationDetailsInput {
  slot_id?: unknown
  start_time?: unknown
  duration_minutes?: unknown
  confirmed?: unknown
}

export async function createManualReservation(trainerId: string, input: ManualReservationInput): Promise<ManualResult> {
  const slotId = typeof input.slot_id === 'string' ? input.slot_id : ''
  const startTime = typeof input.start_time === 'string' ? input.start_time : ''
  if (!slotId || !startTime) return { ok: false, status: 400, message: 'slot_id y start_time son obligatorios' }

  const parsed = parseDetails({
    client_name: input.client_name ?? '',
    client_email: input.client_email ?? '',
    client_phone: input.client_phone,
    notes: input.notes,
  })
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message }

  const supabase = getSupabaseServerClient()
  const offered = await getTrainerDurations(supabase, trainerId)
  const duration = input.duration_minutes === undefined ? offered[0] : Number(input.duration_minutes)
  if (!offered.includes(duration as 60 | 90)) {
    return { ok: false, status: 400, message: 'Esa duración no está entre las que ofreces' }
  }

  const base = await requireBasePrice(supabase, trainerId, duration, 1)
  if (!base.ok) {
    return {
      ok: false,
      status: base.status,
      message: base.status === 409 ? `No tienes precio para una clase de ${duration} min (1 jugador). Configúralo en Perfil → Public pricing.` : base.message,
    }
  }

  const lookup = await loadOwnedOpenWindow(supabase, slotId, trainerId, startTime, duration)
  if (!lookup.ok) return { ok: false, status: lookupStatus(lookup.code), message: lookup.message }
  // El dashboard puede mostrar huecos antiguos en rangos ya generados; nunca
  // permitimos convertir uno de ellos en una reserva nueva.
  if (isPastMalaysiaSession(lookup.window.session_date, lookup.range.start_time)) {
    return { ok: false, status: 400, message: 'No se puede crear una reserva en el pasado' }
  }

  const confirmed = input.confirmed === true
  const status = confirmed ? RESERVATION_STATUS.CONFIRMED : RESERVATION_STATUS.PENDING_CONFIRMATION
  const { data, error } = await supabase
    .from('reservations')
    .insert({
      trainer_id: trainerId,
      availability_slot_id: slotId,
      ...parsed.updates,
      start_time: lookup.range.start_time,
      end_time: lookup.range.end_time,
      duration_minutes: duration,
      price: calculateBookingPrice(1, base.price, { durationMinutes: duration }).discountedPricePerSession,
      player_count: 1,
      whatsapp_opt_in: false,
      status,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (isSlotConflictError(error)) return { ok: false, status: 409, message: OVERLAP_MESSAGE }
  if (error || !data) return { ok: false, status: 500, message: error?.message ?? 'No se pudo crear la reserva' }

  await refreshWindowStatus(supabase, slotId, offered)
  return { ok: true, id: data.id, status }
}
