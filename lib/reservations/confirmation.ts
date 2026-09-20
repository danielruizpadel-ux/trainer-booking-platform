import { getSupabaseServerClient } from '@/lib/supabase/client'
import {
  notifyReservationConfirmed,
  notifyReservationNeedsReschedule,
} from '@/lib/notifications/notify'
import { RESERVATION_STATUS, SLOT_STATUS, isAwaitingConfirmation } from './status'

/**
 * Las dos decisiones del entrenador sobre una reserva pendiente.
 *
 *   confirm           reserva → confirmed;        hueco → full
 *   needs_reschedule  reserva → needs_reschedule; hueco → available (liberado)
 *
 * Solo se puede decidir sobre una reserva que esté esperando confirmación.
 * Quien llama ya ha comprobado que la reserva es del entrenador de la sesión
 * (app/api/dashboard/reservations/[id]/route.ts).
 */

export type ReservationDecision = 'confirm' | 'needs_reschedule'

export interface DecidableReservation {
  id: string
  trainer_id: string
  availability_slot_id: string
  status: string | null
  client_name: string
  client_email: string
  client_phone: string | null
  notes: string | null
}

export type DecisionResult =
  | { ok: true; status: string }
  | { ok: false; code: 'invalid_state' | 'db_error'; message: string }

export async function applyReservationDecision(
  reservation: DecidableReservation,
  decision: ReservationDecision
): Promise<DecisionResult> {
  if (!isAwaitingConfirmation(reservation.status)) {
    return {
      ok: false,
      code: 'invalid_state',
      message: 'Esta reserva ya no está pendiente de confirmación',
    }
  }

  const supabase = getSupabaseServerClient()
  const now = new Date().toISOString()
  const nextStatus =
    decision === 'confirm' ? RESERVATION_STATUS.CONFIRMED : RESERVATION_STATUS.NEEDS_RESCHEDULE

  // 1. La reserva. El filtro por estado evita que dos clics seguidos (o dos
  //    pestañas) decidan dos veces sobre la misma fila.
  const { data: updated, error: reservationError } = await supabase
    .from('reservations')
    .update({ status: nextStatus, updated_at: now })
    .eq('id', reservation.id)
    .in('status', [RESERVATION_STATUS.PENDING_CONFIRMATION, 'pending'])
    .select('id')

  if (reservationError) {
    return { ok: false, code: 'db_error', message: reservationError.message }
  }
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      code: 'invalid_state',
      message: 'Esta reserva ya no está pendiente de confirmación',
    }
  }

  // 2. El hueco. No es crítico: si falla, la reserva ya tiene su estado y
  //    GET /api/availability cruza con `reservations` de todos modos.
  const { data: slot, error: slotReadError } = await supabase
    .from('availability_slots')
    .select('id, session_date, start_time, current_bookings, max_capacity')
    .eq('id', reservation.availability_slot_id)
    .maybeSingle()

  if (slotReadError || !slot) {
    console.warn('No se pudo leer el hueco de la reserva:', slotReadError?.message)
  } else {
    const slotUpdate =
      decision === 'confirm'
        ? { status: SLOT_STATUS.FULL, updated_at: now }
        : {
            status: SLOT_STATUS.AVAILABLE,
            current_bookings: Math.max(0, (slot.current_bookings ?? 0) - 1),
            updated_at: now,
          }

    const { error: slotError } = await supabase
      .from('availability_slots')
      .update(slotUpdate)
      .eq('id', slot.id)

    if (slotError) console.warn('No se pudo actualizar el hueco:', slotError.message)
  }

  // 3. Avisar al cliente (stub).
  const notifiable = {
    ...reservation,
    session_date: slot?.session_date ?? null,
    start_time: slot?.start_time ?? null,
  }
  if (decision === 'confirm') {
    await notifyReservationConfirmed(notifiable)
  } else {
    await notifyReservationNeedsReschedule(notifiable)
  }

  return { ok: true, status: nextStatus }
}
