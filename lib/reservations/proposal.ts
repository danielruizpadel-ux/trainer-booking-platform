import { randomBytes } from 'node:crypto'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { notifyProposalResponded, notifyRescheduleProposed } from '@/lib/notifications/notify'
import { RESERVATION_STATUS, SLOT_STATUS, isAwaitingConfirmation, isRescheduleProposed } from './status'
import { loadOwnedOpenSlot, occupySlot, releaseSlot } from './slots'

/**
 * Propuesta de nueva fecha (migración 004).
 *
 *   proposeReschedule   entrenador: reserva ORIGINAL pending_confirmation → needs_reschedule
 *                       (hueco liberado) + reserva NUEVA reschedule_proposed sobre el hueco
 *                       elegido (hueco → pending), con token de un solo uso.
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
}

export type ProposeResult =
  | { ok: true; proposalId: string; token: string }
  | { ok: false; status: number; message: string }

const SELECT_FOR_PROPOSAL =
  'id, trainer_id, availability_slot_id, status, client_name, client_email, client_phone, notes, price'

export async function proposeReschedule(
  original: ProposableReservation,
  slotId: string,
  origin: string
): Promise<ProposeResult> {
  if (!isAwaitingConfirmation(original.status)) {
    return { ok: false, status: 409, message: 'Solo se puede proponer otra fecha sobre una reserva pendiente' }
  }
  if (slotId === original.availability_slot_id) {
    return { ok: false, status: 400, message: 'Elige un hueco distinto del actual' }
  }

  const supabase = getSupabaseServerClient()
  const lookup = await loadOwnedOpenSlot(supabase, slotId, original.trainer_id)
  if (!lookup.ok) {
    const status = lookup.code === 'forbidden' ? 403 : lookup.code === 'not_found' ? 404 : lookup.code === 'taken' ? 409 : 500
    return { ok: false, status, message: lookup.message }
  }

  const token = randomBytes(24).toString('base64url')
  const now = new Date().toISOString()

  const { data: proposal, error: insertError } = await supabase
    .from('reservations')
    .insert({
      trainer_id: original.trainer_id,
      availability_slot_id: slotId,
      client_name: original.client_name,
      client_email: original.client_email,
      client_phone: original.client_phone,
      notes: original.notes,
      price: original.price,
      status: RESERVATION_STATUS.RESCHEDULE_PROPOSED,
      rescheduled_from_id: original.id,
      proposal_token: token,
      created_at: now,
    })
    .select('id')
    .single()

  if (insertError || !proposal) {
    const missing = insertError?.code === '42703' || /rescheduled_from_id|proposal_token/.test(insertError?.message ?? '')
    return {
      ok: false,
      status: 500,
      message: missing
        ? 'Falta aplicar migrations/004_reschedule_proposals.sql en Supabase'
        : `No se pudo crear la propuesta: ${insertError?.message}`,
    }
  }

  // La original deja de esperar pista y libera su hueco.
  const { error: originalError } = await supabase
    .from('reservations')
    .update({ status: RESERVATION_STATUS.NEEDS_RESCHEDULE, updated_at: now })
    .eq('id', original.id)
    .in('status', [RESERVATION_STATUS.PENDING_CONFIRMATION, 'pending'])
  if (originalError) console.warn('No se pudo actualizar la reserva original:', originalError.message)

  await occupySlot(supabase, slotId, SLOT_STATUS.PENDING)
  await releaseSlot(supabase, original.availability_slot_id)

  await notifyRescheduleProposed(
    {
      ...original,
      id: proposal.id,
      session_date: lookup.slot.session_date,
      start_time: lookup.slot.start_time,
    },
    `${origin}/propuesta/${token}`
  )

  return { ok: true, proposalId: proposal.id, token }
}

export interface PublicProposal {
  id: string
  client_name: string
  price: number | null
  slot: { session_date: string; start_time: string; end_time: string }
  trainer: { name: string; slug: string }
}

/** Lo que ve el cliente en /propuesta/[token]. null si no existe o ya se respondió. */
export async function getProposalByToken(token: string): Promise<PublicProposal | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reservations')
    .select('id, client_name, price, status, availability_slots ( session_date, start_time, end_time ), trainers ( name, slug )')
    .eq('proposal_token', token)
    .maybeSingle()
  if (error || !data) return null
  const row = data as unknown as {
    id: string
    client_name: string
    price: number | null
    status: string | null
    availability_slots: PublicProposal['slot'] | null
    trainers: PublicProposal['trainer'] | null
  }
  if (!isRescheduleProposed(row.status) || !row.availability_slots || !row.trainers) return null
  return { id: row.id, client_name: row.client_name, price: row.price, slot: row.availability_slots, trainer: row.trainers }
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

  if (!accepted) await releaseSlot(supabase, row.availability_slot_id)

  await notifyProposalResponded(
    { ...row, session_date: row.availability_slots?.session_date, start_time: row.availability_slots?.start_time },
    accepted
  )

  return { ok: true, accepted, trainerSlug: row.trainers?.slug ?? '' }
}

export { SELECT_FOR_PROPOSAL }
