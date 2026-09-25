import { getSupabaseServerClient } from '@/lib/supabase/client'
import { RESERVATION_STATUS } from '@/lib/reservations/status'
import { OVERLAP_MESSAGE, isOverlapError, loadOwnedOpenWindow, lookupStatus, refreshWindowStatus } from '@/lib/reservations/slots'
import { SELECT_FOR_EDIT, cancelReservation, type EditableReservation } from '@/lib/reservations/edit'
import { reservationHoldsSlot } from '@/lib/availability/slot-status'
import type { ClientPackage, PackageSessionStatus } from './status'

/**
 * Agendar / desagendar una sesión de paquete.
 *
 *   schedule    la sesión se convierte en una fila REAL de reservations sobre
 *               un hueco del entrenador (mismo camino que la reserva manual,
 *               lib/reservations/manual.ts) con el precio por sesión del
 *               paquete; el hueco pasa a pending o full.
 *   unschedule  cancela esa reserva (mismo efecto que Reservas → Cancelar:
 *               releaseSlot + cancelled) y la sesión vuelve a not_scheduled.
 *               El cliente recupera el crédito (decisión 2.7 del plan).
 */
export type ScheduleResult = { ok: true; reservationId: string | null } | { ok: false; status: number; message: string }

interface SessionWithPackage {
  id: string
  session_number: number
  status: PackageSessionStatus
  reservation_id: string | null
  client_packages: ClientPackage | null
}

type LoadedSession =
  | { error: { status: number; message: string } }
  | { session: SessionWithPackage; pkg: ClientPackage; supabase: ReturnType<typeof getSupabaseServerClient>; error?: undefined }

async function loadOwnSession(trainerId: string, sessionId: string): Promise<LoadedSession> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('package_sessions')
    .select('id, session_number, status, reservation_id, client_packages ( * )')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) return { error: { status: 500, message: error.message } }
  const session = data as unknown as SessionWithPackage | null
  if (!session || !session.client_packages) return { error: { status: 404, message: 'Sesión no encontrada' } }
  if (session.client_packages.trainer_id !== trainerId) {
    return { error: { status: 403, message: 'Este paquete no es tuyo' } }
  }
  return { session, pkg: session.client_packages, supabase }
}

async function loadLinkedReservation(supabase: ReturnType<typeof getSupabaseServerClient>, reservationId: string | null) {
  if (!reservationId) return null
  const { data } = await supabase.from('reservations').select(SELECT_FOR_EDIT).eq('id', reservationId).maybeSingle()
  return (data as unknown as EditableReservation | null) ?? null
}

export async function schedulePackageSession(
  trainerId: string,
  sessionId: string,
  slotId: string,
  startTime: string,
  confirmed: boolean
): Promise<ScheduleResult> {
  const loaded = await loadOwnSession(trainerId, sessionId)
  if (loaded.error) return { ok: false, status: loaded.error.status, message: loaded.error.message }
  const { session, pkg, supabase } = loaded

  if (pkg.status !== 'active') {
    return { ok: false, status: 409, message: 'Este paquete no está activo' }
  }

  // Se puede agendar si nunca se agendó, o si su reserva ya no ocupa hueco
  // (cancelada / sin pista desde Reservas): el crédito no se pierde.
  const linked = await loadLinkedReservation(supabase, session.reservation_id)
  const free =
    session.status === 'not_scheduled' ||
    (session.status === 'scheduled' && (!linked || !reservationHoldsSlot(linked.status)))
  if (!free) {
    return { ok: false, status: 409, message: 'Esta sesión ya está agendada' }
  }

  // La duración la fija el paquete al venderlo (migración 007).
  const duration = pkg.duration_minutes ?? 60
  const lookup = await loadOwnedOpenWindow(supabase, slotId, trainerId, startTime, duration)
  if (!lookup.ok) return { ok: false, status: lookupStatus(lookup.code), message: lookup.message }

  const status = confirmed ? RESERVATION_STATUS.CONFIRMED : RESERVATION_STATUS.PENDING_CONFIRMATION
  const label = `Paquete de ${pkg.sessions_total} clases · sesión ${session.session_number}/${pkg.sessions_total}`
  const { data: reservation, error: insertError } = await supabase
    .from('reservations')
    .insert({
      trainer_id: trainerId,
      availability_slot_id: slotId,
      client_name: pkg.client_name,
      client_email: pkg.client_email,
      client_phone: pkg.client_phone,
      notes: pkg.notes ? `${label} · ${pkg.notes}` : label,
      price: pkg.price_per_session_discounted,
      // Migración 010: el paquete aún no tiene jugador (player_id NULL), sin
      // mensaje del cliente, 1 jugador y sin WhatsApp (no se pidió).
      player_count: 1,
      whatsapp_opt_in: false,
      start_time: lookup.range.start_time,
      end_time: lookup.range.end_time,
      duration_minutes: duration,
      status,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (isOverlapError(insertError)) return { ok: false, status: 409, message: OVERLAP_MESSAGE }
  if (insertError || !reservation) {
    return { ok: false, status: 500, message: insertError?.message ?? 'No se pudo crear la reserva' }
  }

  await refreshWindowStatus(supabase, slotId)

  const { error: linkError } = await supabase
    .from('package_sessions')
    .update({ reservation_id: reservation.id, status: 'scheduled', updated_at: new Date().toISOString() })
    .eq('id', session.id)
  if (linkError) return { ok: false, status: 500, message: linkError.message }

  return { ok: true, reservationId: reservation.id }
}

export async function unschedulePackageSession(trainerId: string, sessionId: string): Promise<ScheduleResult> {
  const loaded = await loadOwnSession(trainerId, sessionId)
  if (loaded.error) return { ok: false, status: loaded.error.status, message: loaded.error.message }
  const { session, supabase } = loaded

  if (session.status !== 'scheduled') {
    return { ok: false, status: 409, message: 'Esta sesión no está agendada' }
  }

  const linked = await loadLinkedReservation(supabase, session.reservation_id)
  if (linked && reservationHoldsSlot(linked.status)) {
    const cancelled = await cancelReservation(linked)
    if (!cancelled.ok) return { ok: false, status: cancelled.status, message: cancelled.message }
  }

  const { error } = await supabase
    .from('package_sessions')
    .update({ reservation_id: null, status: 'not_scheduled', updated_at: new Date().toISOString() })
    .eq('id', session.id)
  if (error) return { ok: false, status: 500, message: error.message }

  return { ok: true, reservationId: null }
}
