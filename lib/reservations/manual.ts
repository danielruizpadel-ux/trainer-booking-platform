import { getSupabaseServerClient } from '@/lib/supabase/client'
import { RESERVATION_STATUS, SLOT_STATUS } from './status'
import { calculateBookingPrice } from './pricing'
import { parseDetails, type ReservationDetailsInput } from './edit'
import { loadOwnedOpenSlot, occupySlot } from './slots'

/**
 * Reserva creada a mano por el entrenador (Parte 4).
 *   confirmed = true   ya tiene la pista → confirmed, hueco full
 *   confirmed = false  igual que el flujo público → pending_confirmation, hueco pending
 * Precio: la misma regla que POST /api/reservations (lib/reservations/pricing.ts),
 * para una sesión.
 */
export type ManualResult = { ok: true; id: string; status: string } | { ok: false; status: number; message: string }

export async function createManualReservation(
  trainerId: string,
  slotId: string,
  details: ReservationDetailsInput,
  confirmed: boolean
): Promise<ManualResult> {
  const parsed = parseDetails({
    client_name: details.client_name ?? '',
    client_email: details.client_email ?? '',
    client_phone: details.client_phone,
    notes: details.notes,
  })
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message }

  const supabase = getSupabaseServerClient()
  const lookup = await loadOwnedOpenSlot(supabase, slotId, trainerId)
  if (!lookup.ok) {
    const status = lookup.code === 'forbidden' ? 403 : lookup.code === 'not_found' ? 404 : lookup.code === 'taken' ? 409 : 500
    return { ok: false, status, message: lookup.message }
  }

  const status = confirmed ? RESERVATION_STATUS.CONFIRMED : RESERVATION_STATUS.PENDING_CONFIRMATION
  const { data, error } = await supabase
    .from('reservations')
    .insert({
      trainer_id: trainerId,
      availability_slot_id: slotId,
      ...parsed.updates,
      price: calculateBookingPrice(1).discountedPricePerSession,
      status,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, status: 500, message: error?.message ?? 'No se pudo crear la reserva' }

  await occupySlot(supabase, slotId, confirmed ? SLOT_STATUS.FULL : SLOT_STATUS.PENDING)
  return { ok: true, id: data.id, status }
}
