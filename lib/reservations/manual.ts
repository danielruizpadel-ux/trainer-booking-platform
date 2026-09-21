import { getSupabaseServerClient } from '@/lib/supabase/client'
import { getTrainerDurations } from '@/lib/availability/trainer-durations'
import { RESERVATION_STATUS } from './status'
import { calculateBookingPrice } from './pricing'
import { parseDetails, type ReservationDetailsInput } from './edit'
import { loadOwnedOpenWindow, lookupStatus, refreshWindowStatus } from './slots'

/**
 * Reserva creada a mano por el entrenador (Parte 4).
 *   confirmed = true   ya tiene la pista → confirmed
 *   confirmed = false  igual que el flujo público → pending_confirmation
 * Ocupa [start_time, start_time + duración) en la ventana elegida, con la
 * misma comprobación de solapamiento que el widget público. Precio: la misma
 * regla que POST /api/reservations (lib/reservations/pricing.ts), una sesión
 * de esa duración.
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

  const lookup = await loadOwnedOpenWindow(supabase, slotId, trainerId, startTime, duration)
  if (!lookup.ok) return { ok: false, status: lookupStatus(lookup.code), message: lookup.message }

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
      price: calculateBookingPrice(1, duration).discountedPricePerSession,
      status,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, status: 500, message: error?.message ?? 'No se pudo crear la reserva' }

  await refreshWindowStatus(supabase, slotId, offered)
  return { ok: true, id: data.id, status }
}
