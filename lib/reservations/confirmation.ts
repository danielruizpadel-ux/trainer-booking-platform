import { getSupabaseServerClient } from '@/lib/supabase/client'
import {
  notifyReservationConfirmed,
  notifyReservationNeedsReschedule,
} from '@/lib/notifications/notify'
import { RESERVATION_STATUS, isAwaitingConfirmation } from './status'
import { refreshWindowStatus } from './slots'

/**
 * Las dos decisiones del entrenador sobre una reserva pendiente.
 *
 *   confirm           reserva → confirmed         (sigue ocupando su rango en la ventana)
 *   needs_reschedule  reserva → needs_reschedule  (deja de ocupar su rango: se libera)
 * En ambos casos se recalcula el estado de la ventana (refreshWindowStatus).
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
  start_time?: string | null
  end_time?: string | null
  duration_minutes?: number | null
  whatsapp_opt_in?: boolean | null
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

  // 2. La ventana: recalcular contador y estado (full solo si ya no cabe nada).
  //    No es crítico: si falla, la reserva ya tiene su estado y la
  //    disponibilidad se calcula por solapamiento de todos modos.
  await refreshWindowStatus(supabase, reservation.availability_slot_id)
  const { data: slot } = await supabase
    .from('availability_slots')
    .select('session_date, start_time')
    .eq('id', reservation.availability_slot_id)
    .maybeSingle()

  // 3. Avisar al cliente (stub).
  const notifiable = {
    ...reservation,
    session_date: slot?.session_date ?? null,
    start_time: reservation.start_time ?? slot?.start_time ?? null,
  }
  if (decision === 'confirm') {
    await notifyReservationConfirmed(notifiable)
  } else {
    await notifyReservationNeedsReschedule(notifiable)
  }

  return { ok: true, status: nextStatus }
}
