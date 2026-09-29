import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Borrado de ventanas (`availability_slots`) SIN llevarse reservas.
 *
 * La base real tenía `reservations_availability_slot_id_fkey` con ON DELETE
 * CASCADE: borrar una ventana borraba sus reservas (también las canceladas,
 * que son historial, y una reserva que hubiera entrado entre la lectura y el
 * borrado). La migración 013 la cambia a ON DELETE RESTRICT: la base rechaza
 * (23503) borrar una ventana que tenga cualquier reserva.
 *
 * Aquí:
 *   - Los llamadores solo pasan ventanas SIN ninguna fila en reservations
 *     (de cualquier estado) según lo que leyeron.
 *   - Se intenta en un lote; si la base lo rechaza por la FK de reservations
 *     (23503 de `reservations_availability_slot_id_fkey`: alguna ganó una
 *     reserva mientras tanto), se reintenta de una en una y las que tienen
 *     reserva se quedan (`kept`). Nunca se borran reservas desde aquí.
 *   - Cualquier otro error, incluido un 23503 de otra restricción, se lanza.
 *
 * Mientras la 013 no esté aplicada, lo único que protege es no pedir el
 * borrado de ventanas con reservas: una reserva que entre justo entre la
 * lectura y el borrado se la seguiría llevando el CASCADE.
 */

export interface DeleteWindowsResult {
  deleted: number
  /** Ventanas que la base no dejó borrar porque tienen reservas (23503) */
  kept: string[]
}

export const FK_VIOLATION = '23503'
/** La FK de reservations → availability_slots (migración 013: RESTRICT) */
export const RESERVATIONS_WINDOW_FK = 'reservations_availability_slot_id_fkey'

/**
 * Solo el 23503 de ESA restricción significa "la ventana tiene reservas": se
 * conserva la ventana. Un 23503 de otra FK (una tabla nueva que apunte a
 * availability_slots, por ejemplo) no se reconoce y se propaga como error.
 */
export function isWindowHasReservationsError(error: { code?: string; message?: string; details?: string | null } | null | undefined): boolean {
  if (error?.code !== FK_VIOLATION) return false
  return `${error.message ?? ''} ${error.details ?? ''}`.includes(RESERVATIONS_WINDOW_FK)
}

export async function deleteEmptyWindows(supabase: SupabaseClient, ids: string[]): Promise<DeleteWindowsResult> {
  if (ids.length === 0) return { deleted: 0, kept: [] }

  const batch = await supabase.from('availability_slots').delete({ count: 'exact' }).in('id', ids)
  if (!batch.error) return { deleted: batch.count ?? ids.length, kept: [] }
  if (!isWindowHasReservationsError(batch.error)) throw new Error(`DELETE failed (${ids.length} rows): ${batch.error.message}`)

  // El lote entero se ha deshecho: una a una, conservando las que tienen reserva.
  let deleted = 0
  const kept: string[] = []
  for (const id of ids) {
    const one = await supabase.from('availability_slots').delete({ count: 'exact' }).eq('id', id)
    if (!one.error) {
      deleted += one.count ?? 1
    } else if (isWindowHasReservationsError(one.error)) {
      kept.push(id)
    } else {
      throw new Error(`DELETE failed id=${id}: ${one.error.message}`)
    }
  }
  if (kept.length > 0) console.warn(`Ventanas no borradas porque tienen reservas: ${kept.length}`)
  return { deleted, kept }
}
