import type { SupabaseClient } from '@supabase/supabase-js'
import { isSlotOpen, reservationHoldsSlot } from '@/lib/availability/slot-status'
import { bookableStarts, fitsInWindow, fromMinutes, toMinutes, type TimeRange } from '@/lib/availability/windows'
import { gridStepFor } from '@/lib/availability/durations'
import { getTrainerDurations } from '@/lib/availability/trainer-durations'
import { SLOT_STATUS } from './status'

/**
 * Ventanas (migración 007). Una fila de `availability_slots` es un rango
 * abierto del entrenador; las clases son reservas con [start_time, end_time)
 * dentro. Todo lo que ocupa o libera tiempo pasa por aquí:
 *
 *   loadOwnedOpenWindow   la ventana es del entrenador, está abierta y el
 *                         rango pedido cabe sin solapar reservas vivas
 *   refreshWindowStatus   recalcula `current_bookings` y `status`
 *                         (`full` solo si no queda ningún inicio libre para la
 *                         duración mínima que ofrece el entrenador)
 *
 * "Reserva viva" = reservationHoldsSlot: pending_confirmation (y el `pending`
 * antiguo), reschedule_proposed y confirmed. Así dos clientes no pueden coger
 * la misma franja mientras la primera sigue pendiente.
 */

export interface WindowRow {
  id: string
  trainer_id: string
  session_date: string
  start_time: string
  end_time: string
  class_type: string
  status: string | null
  current_bookings: number | null
  max_capacity: number | null
}

export interface WindowReservation {
  id: string
  status: string | null
  start_time: string | null
  end_time: string | null
}

export interface LoadedWindow {
  window: WindowRow
  /** Rangos de las reservas vivas (ya con el fallback de las anteriores a la 007) */
  taken: Array<TimeRange & { id: string }>
}

export const WINDOW_SELECT =
  'id, trainer_id, session_date, start_time, end_time, class_type, status, current_bookings, max_capacity, ' +
  'reservations ( id, status, start_time, end_time )'

/** Rango real de una reserva. Las anteriores a la 007 no tienen start_time: son la hora de su ventana + 60 min. */
export function reservationRange(reservation: { start_time?: string | null; end_time?: string | null }, window: TimeRange): TimeRange {
  if (reservation.start_time && reservation.end_time) {
    return { start_time: reservation.start_time.slice(0, 5), end_time: reservation.end_time.slice(0, 5) }
  }
  const start = toMinutes(window.start_time)
  return { start_time: fromMinutes(start), end_time: fromMinutes(Math.min(start + 60, toMinutes(window.end_time))) }
}

export function toLoadedWindow(row: WindowRow & { reservations?: WindowReservation[] | null }): LoadedWindow {
  const { reservations, ...window } = row
  const taken = (reservations ?? [])
    .filter((r) => reservationHoldsSlot(r.status))
    .map((r) => ({ id: r.id, ...reservationRange(r, window) }))
  return { window, taken }
}

export async function loadWindow(supabase: SupabaseClient, windowId: string): Promise<LoadedWindow | null> {
  const { data, error } = await supabase.from('availability_slots').select(WINDOW_SELECT).eq('id', windowId).maybeSingle()
  if (error || !data) return null
  return toLoadedWindow(data as unknown as WindowRow & { reservations: WindowReservation[] | null })
}

/**
 * Reservas vivas de CUALQUIER ventana del entrenador ese día, no solo las
 * de una fila. Si hay más de una fila de `availability_slots` solapada en
 * el mismo día (huecos manuales sueltos junto a la ventana generada por el
 * patrón semanal, herencia de antes de la 007), una reserva en una no debe
 * quedar invisible para las demás: eso es lo que dejaba ofrecer la misma
 * hora real dos veces. Solo para comprobar solapamiento (fitsInWindow /
 * bookableStarts) — el conteo `current_bookings` de una fila sigue siendo
 * el suyo propio, ver refreshWindowStatus.
 */
async function loadTakenForDate(supabase: SupabaseClient, trainerId: string, date: string): Promise<Array<TimeRange & { id: string }>> {
  const { data, error } = await supabase.from('availability_slots').select(WINDOW_SELECT).eq('trainer_id', trainerId).eq('session_date', date)
  if (error || !data) return []
  const rows = data as unknown as Array<WindowRow & { reservations: WindowReservation[] | null }>
  return rows.flatMap((row) => toLoadedWindow(row).taken)
}

export type WindowLookup =
  | { ok: true; window: WindowRow; range: TimeRange }
  | { ok: false; code: 'not_found' | 'forbidden' | 'taken' | 'closed' | 'db_error'; message: string }

export function lookupStatus(code: Exclude<WindowLookup, { ok: true }>['code']): number {
  return code === 'forbidden' ? 403 : code === 'not_found' ? 404 : code === 'db_error' ? 500 : 409
}

/**
 * Ventana del entrenador, abierta, y en la que [startTime, startTime + duración)
 * cabe sin solapar ninguna reserva viva. `ignoreReservationId` excluye la propia
 * reserva al moverla dentro de la misma ventana.
 */
export async function loadOwnedOpenWindow(
  supabase: SupabaseClient,
  windowId: string,
  trainerId: string,
  startTime: string,
  durationMinutes: number,
  options: { ignoreReservationId?: string } = {}
): Promise<WindowLookup> {
  const { data, error } = await supabase.from('availability_slots').select(WINDOW_SELECT).eq('id', windowId).maybeSingle()
  if (error) return { ok: false, code: 'db_error', message: error.message }
  if (!data) return { ok: false, code: 'not_found', message: 'Ese hueco no existe' }

  const loaded = toLoadedWindow(data as unknown as WindowRow & { reservations: WindowReservation[] | null })
  if (loaded.window.trainer_id !== trainerId) {
    return { ok: false, code: 'forbidden', message: 'Ese hueco no es tuyo' }
  }
  if (!isSlotOpen(loaded.window)) {
    return { ok: false, code: 'closed', message: 'Esa ventana está cerrada' }
  }

  const start = startTime.slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(start)) return { ok: false, code: 'taken', message: 'Hora no válida' }
  const range: TimeRange = { start_time: start, end_time: fromMinutes(toMinutes(start) + durationMinutes) }
  const dateTaken = await loadTakenForDate(supabase, loaded.window.trainer_id, loaded.window.session_date)
  const taken = dateTaken.filter((t) => t.id !== options.ignoreReservationId)
  if (!fitsInWindow(loaded.window, taken, range)) {
    return { ok: false, code: 'taken', message: 'Esa franja ya no está libre' }
  }
  return { ok: true, window: loaded.window, range }
}

/**
 * Recalcula el estado de una ventana a partir de sus reservas vivas.
 * No toca ventanas `cancelled`/`blocked` (cerradas a mano).
 */
export async function refreshWindowStatus(supabase: SupabaseClient, windowId: string, durations?: number[]): Promise<void> {
  const loaded = await loadWindow(supabase, windowId)
  if (!loaded) return
  const { window, taken } = loaded
  const current = (window.status ?? '').toLowerCase()
  if (current === 'cancelled' || current === 'canceled' || current === 'blocked') return

  const offered = durations ?? (await getTrainerDurations(supabase, window.trainer_id))
  const minDuration = Math.min(...offered)
  // hasRoom mira las reservas de TODO el día (loadTakenForDate), no solo las
  // de esta fila, para no marcar "available" un hueco que en realidad se
  // solapa con una reserva de otra ventana ese mismo día. current_bookings
  // sigue siendo el conteo de esta fila (taken, de loadWindow): isSlotOpen
  // lo compara contra max_capacity, y contar ahí reservas de otras filas
  // cerraría de golpe ventanas que no tienen nada que ver.
  const dateTaken = await loadTakenForDate(supabase, window.trainer_id, window.session_date)
  const hasRoom = bookableStarts(window, dateTaken, minDuration, gridStepFor(offered)).length > 0

  const { error } = await supabase
    .from('availability_slots')
    .update({
      status: hasRoom ? SLOT_STATUS.AVAILABLE : SLOT_STATUS.FULL,
      current_bookings: taken.length,
      updated_at: new Date().toISOString(),
    })
    .eq('id', window.id)
  if (error) console.warn('No se pudo recalcular la ventana:', error.message)
}

/** Todas las ventanas del entrenador desde `fromDate` (tras cambiar duraciones o aplicar la 007). */
export async function refreshAllWindows(supabase: SupabaseClient, trainerId: string, fromDate: string): Promise<number> {
  const { data, error } = await supabase
    .from('availability_slots')
    .select('id')
    .eq('trainer_id', trainerId)
    .gte('session_date', fromDate)
  if (error || !data) return 0
  const durations = await getTrainerDurations(supabase, trainerId)
  for (const row of data) await refreshWindowStatus(supabase, row.id, durations)
  return data.length
}
