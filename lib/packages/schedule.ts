import { getSupabaseServerClient } from '@/lib/supabase/client'
import { RESERVATION_STATUS } from '@/lib/reservations/status'
import { OVERLAP_MESSAGE, isOverlapError, loadOwnedOpenWindow, lookupStatus, refreshWindowStatus } from '@/lib/reservations/slots'
import { SELECT_FOR_EDIT, afterReservationCancelled, type EditableReservation } from '@/lib/reservations/edit'
import { reservationHoldsSlot } from '@/lib/availability/slot-status'
import type { ClientPackage, PackageSessionStatus } from './status'
import { isPastMalaysiaSession } from '@/lib/dateUtils'

/**
 * Agendar / desagendar una sesión de paquete.
 *
 *   schedule    la sesión se convierte en una fila REAL de reservations sobre
 *               un hueco del entrenador (mismo camino que la reserva manual,
 *               lib/reservations/manual.ts) con el precio por sesión del
 *               paquete; el hueco pasa a pending o full. La reserva y el
 *               enlace del crédito se escriben juntos en una transacción
 *               (schedule_package_session, migración 011).
 *   unschedule  cancela esa reserva (mismo efecto que Reservas → Cancelar:
 *               releaseSlot + cancelled) y la sesión vuelve a not_scheduled,
 *               las dos cosas en una transacción (unschedule_package_session).
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
  if (isPastMalaysiaSession(lookup.window.session_date, lookup.range.start_time)) {
    return { ok: false, status: 400, message: 'No se puede agendar una sesión en el pasado' }
  }

  // Reserva + enlace del crédito en UNA transacción (migración 011): la
  // función bloquea la fila de package_sessions, vuelve a comprobar que el
  // crédito está libre y la ventana (abierta, rango dentro, no pasada),
  // inserta la reserva con los datos y el precio del paquete y la enlaza. Dos
  // peticiones para el mismo crédito, aunque sean a horas distintas, dejan
  // como mucho una reserva viva y ninguna huérfana. Las comprobaciones de
  // arriba (free, loadOwnedOpenWindow, pasado) solo sirven para responder
  // pronto con el mensaje de siempre; la que manda es la de la función.
  const status = confirmed ? RESERVATION_STATUS.CONFIRMED : RESERVATION_STATUS.PENDING_CONFIRMATION
  const { data, error: rpcError } = await supabase.rpc('schedule_package_session', {
    p_session_id: session.id,
    p_trainer_id: trainerId,
    p_slot_id: slotId,
    p_start_time: lookup.range.start_time,
    p_status: status,
  })
  if (isOverlapError(rpcError)) return { ok: false, status: 409, message: OVERLAP_MESSAGE }
  if (rpcError) return rpcErrorResult(rpcError, 'schedule_package_session')
  const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string; reservation_id?: string | null } | null
  const failure = row?.outcome ? SCHEDULE_FAILURES[row.outcome] : undefined
  if (failure) return { ok: false, ...failure }
  if (row?.outcome !== 'scheduled' || !row.reservation_id) {
    return { ok: false, status: 500, message: 'No se pudo crear la reserva' }
  }

  await refreshWindowStatus(supabase, slotId)

  return { ok: true, reservationId: row.reservation_id }
}

type Failure = { status: number; message: string }

/** Resultados de schedule_package_session (migración 011) que no son éxito. */
const SCHEDULE_FAILURES: Record<string, Failure> = {
  not_found: { status: 404, message: 'Sesión o hueco no encontrado' },
  forbidden: { status: 403, message: 'Este paquete no es tuyo' },
  package_inactive: { status: 409, message: 'Este paquete no está activo' },
  already_scheduled: { status: 409, message: 'Esta sesión ya está agendada' },
  window_closed: { status: 409, message: 'Esa ventana está cerrada' },
  out_of_window: { status: 409, message: 'Esa franja ya no está libre' },
  past: { status: 400, message: 'No se puede agendar una sesión en el pasado' },
  invalid: { status: 400, message: 'Hora no válida' },
}

/** Resultados de unschedule_package_session (migración 011) que no son éxito. */
const UNSCHEDULE_FAILURES: Record<string, Failure> = {
  not_found: { status: 404, message: 'Sesión no encontrada' },
  forbidden: { status: 403, message: 'Este paquete no es tuyo' },
  not_scheduled: { status: 409, message: 'Esta sesión no está agendada' },
  changed: { status: 409, message: 'La sesión ha cambiado mientras tanto. Recarga y vuelve a intentarlo.' },
}

/**
 * Error de la llamada RPC (no un outcome). Si la función no existe se dice
 * qué migración falta: PostgREST responde PGRST202 (y Postgres 42883), pero
 * también se reconoce por el texto por si llega por otro camino con otro código.
 */
function rpcErrorResult(error: { code?: string; message?: string }, fn: string): { ok: false } & Failure {
  const text = error.message ?? ''
  const missing =
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    (text.includes(fn) && /could not find the function|does not exist|schema cache/i.test(text))
  return {
    ok: false,
    status: 500,
    message: missing ? 'Falta aplicar migrations/011_package_session_atomic_schedule.sql en Supabase' : text || 'Error de base de datos',
  }
}

export async function unschedulePackageSession(trainerId: string, sessionId: string): Promise<ScheduleResult> {
  const loaded = await loadOwnSession(trainerId, sessionId)
  if (loaded.error) return { ok: false, status: loaded.error.status, message: loaded.error.message }
  const { session, supabase } = loaded

  if (session.status !== 'scheduled') {
    return { ok: false, status: 409, message: 'Esta sesión no está agendada' }
  }

  // Cancelar la reserva y devolver el crédito en UNA transacción (migración
  // 011): si algo falla, la reserva y el crédito se quedan como estaban. La
  // función solo actúa si el crédito sigue enlazado a la reserva que vemos
  // aquí; si entretanto se reagendó, responde `changed` y no toca la nueva.
  const linked = await loadLinkedReservation(supabase, session.reservation_id)
  const { data, error: rpcError } = await supabase.rpc('unschedule_package_session', {
    p_session_id: session.id,
    p_trainer_id: trainerId,
    p_expected_reservation_id: session.reservation_id,
  })
  if (rpcError) return rpcErrorResult(rpcError, 'unschedule_package_session')
  const row = (Array.isArray(data) ? data[0] : data) as
    | { outcome?: string; cancelled_reservation_id?: string | null; slot_id?: string | null }
    | null
  const failure = row?.outcome ? UNSCHEDULE_FAILURES[row.outcome] : undefined
  if (failure) return { ok: false, ...failure }
  if (row?.outcome !== 'unscheduled') return { ok: false, status: 500, message: 'No se pudo desagendar la sesión' }

  // Ya confirmado: recalcular la ventana y avisar, como Reservas → Cancelar.
  // Si fallan, la cancelación y el crédito devuelto se quedan igual.
  if (row.cancelled_reservation_id) {
    if (linked && linked.id === row.cancelled_reservation_id) {
      await afterReservationCancelled(linked, true)
    } else if (row.slot_id) {
      await refreshWindowStatus(supabase, row.slot_id)
    }
  }

  return { ok: true, reservationId: null }
}
