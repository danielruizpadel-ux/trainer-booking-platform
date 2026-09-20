import { getSupabaseServerClient } from '@/lib/supabase/client'
import { reservationHoldsSlot } from '@/lib/availability/slot-status'
import { notifyReservationCancelled, notifyReservationMoved } from '@/lib/notifications/notify'
import { RESERVATION_STATUS, isRescheduleProposed } from './status'
import { loadOwnedOpenSlot, occupySlot, releaseSlot, slotStatusFor } from './slots'

/**
 * Edición directa desde el panel (Parte 3): el entrenador ya ha hablado con
 * el cliente, así que no pasa por la página pública.
 *
 *   updateReservationDetails  nombre, email, teléfono, notas, precio (override manual)
 *   moveReservation           a otro hueco propio: libera el viejo y marca el nuevo
 *                             según el estado (pending si pendiente, full si confirmada).
 *                             Una needs_reschedule / cancelled movida se reactiva como
 *                             pending_confirmation.
 *   cancelReservation         → cancelled (sin intención de reprogramar) y libera el hueco
 */

export interface EditableReservation {
  id: string
  trainer_id: string
  availability_slot_id: string
  status: string | null
  client_name: string
  client_email: string
  client_phone: string | null
  notes: string | null
  price: number | null
}

export const SELECT_FOR_EDIT =
  'id, trainer_id, availability_slot_id, status, client_name, client_email, client_phone, notes, price'

export type EditResult = { ok: true } | { ok: false; status: number; message: string }

export interface ReservationDetailsInput {
  client_name?: unknown
  client_email?: unknown
  client_phone?: unknown
  notes?: unknown
  price?: unknown
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Valida y normaliza los campos editables. Devuelve el mensaje del primer error. */
export function parseDetails(input: ReservationDetailsInput): { ok: true; updates: Record<string, unknown> } | { ok: false; message: string } {
  const updates: Record<string, unknown> = {}

  if (input.client_name !== undefined) {
    const name = String(input.client_name ?? '').trim()
    if (!name) return { ok: false, message: 'El nombre no puede estar vacío' }
    updates.client_name = name
  }
  if (input.client_email !== undefined) {
    const email = String(input.client_email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return { ok: false, message: 'Email no válido' }
    updates.client_email = email
  }
  if (input.client_phone !== undefined) {
    const phone = String(input.client_phone ?? '').trim()
    updates.client_phone = phone || null
  }
  if (input.notes !== undefined) {
    const notes = String(input.notes ?? '').trim()
    updates.notes = notes || null
  }
  if (input.price !== undefined) {
    if (input.price === null || input.price === '') {
      updates.price = null
    } else {
      const price = Number(input.price)
      if (!Number.isFinite(price) || price < 0) return { ok: false, message: 'Precio no válido' }
      updates.price = Math.round(price * 100) / 100
    }
  }
  return { ok: true, updates }
}

export async function updateReservationDetails(
  reservation: EditableReservation,
  updates: Record<string, unknown>
): Promise<EditResult> {
  if (Object.keys(updates).length === 0) return { ok: true }
  const supabase = getSupabaseServerClient()
  const { error } = await supabase
    .from('reservations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', reservation.id)
  if (error) return { ok: false, status: 500, message: error.message }
  return { ok: true }
}

export async function moveReservation(reservation: EditableReservation, slotId: string): Promise<EditResult> {
  if (slotId === reservation.availability_slot_id) {
    return { ok: false, status: 400, message: 'Es el mismo hueco' }
  }
  const supabase = getSupabaseServerClient()
  const lookup = await loadOwnedOpenSlot(supabase, slotId, reservation.trainer_id)
  if (!lookup.ok) {
    const status = lookup.code === 'forbidden' ? 403 : lookup.code === 'not_found' ? 404 : lookup.code === 'taken' ? 409 : 500
    return { ok: false, status, message: lookup.message }
  }

  const wasHolding = reservationHoldsSlot(reservation.status)
  const nextStatus = wasHolding ? reservation.status : RESERVATION_STATUS.PENDING_CONFIRMATION

  const { error } = await supabase
    .from('reservations')
    .update({ availability_slot_id: slotId, status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', reservation.id)
  if (error) return { ok: false, status: 500, message: error.message }

  if (wasHolding) await releaseSlot(supabase, reservation.availability_slot_id)
  await occupySlot(supabase, slotId, slotStatusFor(nextStatus))

  await notifyReservationMoved({
    ...reservation,
    session_date: lookup.slot.session_date,
    start_time: lookup.slot.start_time,
  })
  return { ok: true }
}

export async function cancelReservation(reservation: EditableReservation): Promise<EditResult> {
  const current = (reservation.status ?? '').trim().toLowerCase()
  if (current === RESERVATION_STATUS.CANCELLED || current === 'canceled') {
    return { ok: false, status: 409, message: 'Esta reserva ya está cancelada' }
  }
  const supabase = getSupabaseServerClient()
  const wasHolding = reservationHoldsSlot(reservation.status)

  const updates: Record<string, unknown> = { status: RESERVATION_STATUS.CANCELLED, updated_at: new Date().toISOString() }
  if (isRescheduleProposed(reservation.status)) updates.proposal_token = null

  const { error } = await supabase.from('reservations').update(updates).eq('id', reservation.id)
  if (error) return { ok: false, status: 500, message: error.message }

  if (wasHolding) await releaseSlot(supabase, reservation.availability_slot_id)

  const { data: slot } = await supabase
    .from('availability_slots')
    .select('session_date, start_time')
    .eq('id', reservation.availability_slot_id)
    .maybeSingle()
  await notifyReservationCancelled({ ...reservation, session_date: slot?.session_date, start_time: slot?.start_time })
  return { ok: true }
}
