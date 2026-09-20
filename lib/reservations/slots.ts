import type { SupabaseClient } from '@supabase/supabase-js'
import { isSlotOpen, reservationHoldsSlot } from '@/lib/availability/slot-status'
import { SLOT_STATUS } from './status'

/**
 * Operaciones sobre huecos que comparten propuesta (Parte 2), edición
 * (Parte 3) y reserva manual (Parte 4). Todas con el cliente service role
 * que les pasa quien llama, y siempre comprobando que el hueco es del
 * entrenador de la sesión.
 */

export interface OwnedSlot {
  id: string
  trainer_id: string
  session_date: string
  start_time: string
  end_time: string
  status: string | null
  current_bookings: number | null
  max_capacity: number | null
}

export type SlotLookup =
  | { ok: true; slot: OwnedSlot }
  | { ok: false; code: 'not_found' | 'forbidden' | 'taken' | 'db_error'; message: string }

/** Hueco del entrenador, abierto y sin reserva viva encima. */
export async function loadOwnedOpenSlot(
  supabase: SupabaseClient,
  slotId: string,
  trainerId: string
): Promise<SlotLookup> {
  const { data, error } = await supabase
    .from('availability_slots')
    .select('id, trainer_id, session_date, start_time, end_time, status, current_bookings, max_capacity, reservations ( id, status )')
    .eq('id', slotId)
    .maybeSingle()

  if (error) return { ok: false, code: 'db_error', message: error.message }
  if (!data) return { ok: false, code: 'not_found', message: 'Ese hueco no existe' }

  const { reservations, ...slot } = data as unknown as OwnedSlot & {
    reservations: Array<{ id: string; status: string | null }> | null
  }
  if (slot.trainer_id !== trainerId) {
    return { ok: false, code: 'forbidden', message: 'Ese hueco no es tuyo' }
  }
  const holder = (reservations ?? []).find((r) => reservationHoldsSlot(r.status))
  if (holder || !isSlotOpen(slot)) {
    return { ok: false, code: 'taken', message: 'Ese hueco ya no está libre' }
  }
  return { ok: true, slot }
}

/** Marca un hueco como ocupado por una reserva: `pending` o `full`. */
export async function occupySlot(
  supabase: SupabaseClient,
  slotId: string,
  status: typeof SLOT_STATUS.PENDING | typeof SLOT_STATUS.FULL
) {
  const { data } = await supabase
    .from('availability_slots')
    .select('current_bookings')
    .eq('id', slotId)
    .maybeSingle()
  const { error } = await supabase
    .from('availability_slots')
    .update({
      status,
      current_bookings: (data?.current_bookings ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', slotId)
  if (error) console.warn('No se pudo ocupar el hueco:', error.message)
}

/** Devuelve un hueco a `available` y resta la reserva del contador. */
export async function releaseSlot(supabase: SupabaseClient, slotId: string) {
  const { data } = await supabase
    .from('availability_slots')
    .select('current_bookings')
    .eq('id', slotId)
    .maybeSingle()
  const { error } = await supabase
    .from('availability_slots')
    .update({
      status: SLOT_STATUS.AVAILABLE,
      current_bookings: Math.max(0, (data?.current_bookings ?? 0) - 1),
      updated_at: new Date().toISOString(),
    })
    .eq('id', slotId)
  if (error) console.warn('No se pudo liberar el hueco:', error.message)
}

/** Estado de hueco que corresponde a una reserva que lo ocupa. */
export function slotStatusFor(reservationStatus: string | null | undefined) {
  return (reservationStatus ?? '').trim().toLowerCase() === 'confirmed' ? SLOT_STATUS.FULL : SLOT_STATUS.PENDING
}
