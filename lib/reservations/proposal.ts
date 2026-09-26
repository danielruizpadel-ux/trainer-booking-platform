import { randomBytes } from 'node:crypto'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { notifyProposalResponded, notifyRescheduleProposed } from '@/lib/notifications/notify'
import { RESERVATION_STATUS, isAwaitingConfirmation, isRescheduleProposed } from './status'
import {
  CREDIT_TAKEN_MESSAGE,
  OVERLAP_MESSAGE,
  isCreditTakenError,
  isSlotConflictError,
  loadOwnedOpenWindow,
  lookupStatus,
  refreshWindowStatus,
  reservationRange,
} from './slots'
import { isPastMalaysiaSession } from '@/lib/dateUtils'

/**
 * Propuesta de nueva fecha (migración 004).
 *
 *   proposeReschedule   entrenador: reserva ORIGINAL pending_confirmation → needs_reschedule
 *                       (hueco liberado) + reserva NUEVA reschedule_proposed sobre el hueco
 *                       elegido (hueco → pending), con token de un solo uso. Todo en una
 *                       transacción (propose_reschedule, migración 019); si la original es
 *                       de un paquete, la propuesta hereda su crédito y el crédito pasa a
 *                       apuntar a ella: un crédito respalda como mucho una reserva viva.
 *   respondToProposal   cliente, sin login, desde /propuesta/[token]:
 *                       acepta → pending_confirmation · elige otra → needs_reschedule (hueco liberado)
 */

export interface ProposableReservation {
  id: string
  trainer_id: string
  availability_slot_id: string
  status: string | null
  client_name: string
  client_email: string
  client_phone: string | null
  notes: string | null
  price: number | null
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  /** Migración 010: identidad y datos del checkout; la propuesta los hereda */
  player_id: string | null
  client_message: string | null
  player_count: number | null
  whatsapp_opt_in: boolean | null
}

export type ProposeResult =
  | { ok: true; proposalId: string; token: string }
  | { ok: false; status: number; message: string }

const SELECT_FOR_PROPOSAL =
  'id, trainer_id, availability_slot_id, status, client_name, client_email, client_phone, notes, price, start_time, end_time, duration_minutes, player_id, client_message, player_count, whatsapp_opt_in'

export async function proposeReschedule(
  original: ProposableReservation,
  slotId: string,
  startTime: string,
  origin: string
): Promise<ProposeResult> {
  if (!isAwaitingConfirmation(original.status)) {
    return { ok: false, status: 409, message: 'Solo se puede proponer otra fecha sobre una reserva pendiente' }
  }
  const duration = original.duration_minutes ?? 60
  if (slotId === original.availability_slot_id && (original.start_time ?? '').slice(0, 5) === startTime.slice(0, 5)) {
    return { ok: false, status: 400, message: 'Elige una franja distinta de la actual' }
  }

  const supabase = getSupabaseServerClient()
  // La original deja de contar como ocupante: se puede proponer la misma
  // ventana en otra franja, o incluso la misma franja de otra ventana.
  const lookup = await loadOwnedOpenWindow(supabase, slotId, original.trainer_id, startTime, duration, {
    ignoreReservationId: original.id,
  })
  if (!lookup.ok) return { ok: false, status: lookupStatus(lookup.code), message: lookup.message }
  // Antes de liberar la original: una propuesta en el pasado no debe dejarla en needs_reschedule.
  if (isPastMalaysiaSession(lookup.window.session_date, lookup.range.start_time)) {
    return { ok: false, status: 400, message: 'No se puede proponer una fecha pasada' }
  }

  const token = randomBytes(24).toString('base64url')

  // Liberar la original, crear la propuesta y, si la original es de un
  // paquete, pasarle el crédito, en UNA transacción (propose_reschedule,
  // migración 019). Antes eran escrituras sueltas: si la propuesta fallaba se
  // intentaba "restaurar" la original con otra escritura, y entre medias el
  // crédito parecía libre y se podía agendar una tercera reserva (R2). Las
  // comprobaciones de arriba solo sirven para responder pronto; la función
  // las repite con la fila bloqueada.
  const { data, error: rpcError } = await supabase.rpc('propose_reschedule', {
    p_original_id: original.id,
    p_trainer_id: original.trainer_id,
    p_slot_id: slotId,
    p_start_time: lookup.range.start_time,
    p_token: token,
  })
  if (isSlotConflictError(rpcError)) return { ok: false, status: 409, message: OVERLAP_MESSAGE }
  if (isCreditTakenError(rpcError)) return { ok: false, status: 409, message: CREDIT_TAKEN_MESSAGE }
  if (rpcError) {
    const text = rpcError.message ?? ''
    const missing =
      rpcError.code === 'PGRST202' ||
      rpcError.code === '42883' ||
      (text.includes('propose_reschedule') && /could not find the function|does not exist|schema cache/i.test(text))
    return {
      ok: false,
      status: 500,
      message: missing ? 'Falta aplicar migrations/019_package_credit_single_live.sql en Supabase' : `No se pudo crear la propuesta: ${text}`,
    }
  }
  const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string; proposal_id?: string | null } | null
  const failure = row?.outcome ? PROPOSE_FAILURES[row.outcome] : undefined
  if (failure) return { ok: false, ...failure }
  if (row?.outcome !== 'proposed' || !row.proposal_id) {
    return { ok: false, status: 500, message: 'No se pudo crear la propuesta' }
  }
  const proposal = { id: row.proposal_id }

  await refreshWindowStatus(supabase, original.availability_slot_id)
  if (slotId !== original.availability_slot_id) await refreshWindowStatus(supabase, slotId)

  await notifyRescheduleProposed(
    {
      ...original,
      id: proposal.id,
      session_date: lookup.window.session_date,
      start_time: lookup.range.start_time,
    },
    `${origin}/propuesta/${token}`
  )

  return { ok: true, proposalId: proposal.id, token }
}

/** Resultados de propose_reschedule (migración 019) que no son éxito. */
const PROPOSE_FAILURES: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: 'Reserva o hueco no encontrado' },
  forbidden: { status: 403, message: 'Esta reserva no es tuya' },
  not_pending: { status: 409, message: 'Solo se puede proponer otra fecha sobre una reserva pendiente' },
  same_range: { status: 400, message: 'Elige una franja distinta de la actual' },
  window_closed: { status: 409, message: 'Esa ventana está cerrada' },
  out_of_window: { status: 409, message: 'Esa franja ya no está libre' },
  past: { status: 400, message: 'No se puede proponer una fecha pasada' },
  invalid: { status: 400, message: 'Hora no válida' },
}

export interface PublicProposal {
  id: string
  client_name: string
  price: number | null
  duration_minutes: number
  /** Fecha de la ventana y el rango REAL de la clase propuesta */
  slot: { session_date: string; start_time: string; end_time: string }
  trainer: { name: string; slug: string }
}

/** Lo que ve el cliente en /propuesta/[token]. null si no existe o ya se respondió. */
export async function getProposalByToken(token: string): Promise<PublicProposal | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reservations')
    .select('id, client_name, price, status, start_time, end_time, duration_minutes, availability_slots ( session_date, start_time, end_time ), trainers ( name, slug )')
    .eq('proposal_token', token)
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as {
    id: string
    client_name: string
    price: number | null
    status: string | null
    start_time: string | null
    end_time: string | null
    duration_minutes: number | null
    availability_slots: PublicProposal['slot'] | null
    trainers: PublicProposal['trainer'] | null
  }
  if (!isRescheduleProposed(row.status) || !row.availability_slots || !row.trainers) return null
  const range = reservationRange(row, row.availability_slots)
  return {
    id: row.id,
    client_name: row.client_name,
    price: row.price,
    duration_minutes: row.duration_minutes ?? 60,
    slot: { session_date: row.availability_slots.session_date, ...range },
    trainer: row.trainers,
  }
}

export type RespondResult =
  | { ok: true; accepted: boolean; trainerSlug: string }
  | { ok: false; status: number; message: string }

export async function respondToProposal(token: string, accepted: boolean): Promise<RespondResult> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reservations')
    .select(`${SELECT_FOR_PROPOSAL}, availability_slots ( session_date, start_time ), trainers ( slug )`)
    .eq('proposal_token', token)
    .maybeSingle()

  if (error) return { ok: false, status: 500, message: error.message }
  const row = data as unknown as
    | (ProposableReservation & {
        availability_slots: { session_date: string; start_time: string } | null
        trainers: { slug: string } | null
      })
    | null
  if (!row || !isRescheduleProposed(row.status)) {
    return { ok: false, status: 404, message: 'Esta propuesta ya no está disponible' }
  }

  const now = new Date().toISOString()
  const nextStatus = accepted ? RESERVATION_STATUS.PENDING_CONFIRMATION : RESERVATION_STATUS.NEEDS_RESCHEDULE

  // Token a NULL en la misma actualización: un solo uso.
  const { data: updated, error: updateError } = await supabase
    .from('reservations')
    .update({ status: nextStatus, proposal_token: null, updated_at: now })
    .eq('id', row.id)
    .eq('status', RESERVATION_STATUS.RESCHEDULE_PROPOSED)
    .select('id')
  if (updateError) return { ok: false, status: 500, message: updateError.message }
  if (!updated || updated.length === 0) {
    return { ok: false, status: 409, message: 'Esta propuesta ya se respondió' }
  }

  if (!accepted) await refreshWindowStatus(supabase, row.availability_slot_id)

  await notifyProposalResponded(
    { ...row, session_date: row.availability_slots?.session_date, start_time: row.start_time ?? row.availability_slots?.start_time },
    accepted
  )

  return { ok: true, accepted, trainerSlug: row.trainers?.slug ?? '' }
}

export { SELECT_FOR_PROPOSAL }
