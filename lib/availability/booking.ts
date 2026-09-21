import type { SupabaseClient } from '@supabase/supabase-js'
import { isSlotOpen } from './slot-status'
import { bookableStarts } from './windows'
import { gridStepFor, type ClassDuration } from './durations'
import { WINDOW_SELECT, toLoadedWindow, type LoadedWindow, type WindowReservation, type WindowRow } from '@/lib/reservations/slots'

/**
 * Lo que ve el cliente: inicios reservables por fecha y duración, calculados
 * al vuelo sobre las ventanas abiertas del entrenador menos sus reservas
 * vivas. Lo usan GET /api/availability (pintar) y POST /api/reservations
 * (validar): el mismo cálculo, para que el calendario nunca ofrezca una hora
 * que la reserva luego rechace.
 */

export interface BookableSlot {
  /** id de la VENTANA (es lo que se envía al reservar) */
  id: string
  session_date: string
  /** HH:MM:SS, como siempre devolvió esta API */
  start_time: string
  end_time: string
  class_type: string
  duration_minutes: number
  max_capacity: number
  current_bookings: number
}

export async function loadOpenWindows(
  supabase: SupabaseClient,
  trainerId: string,
  startDate: string,
  endDate: string
): Promise<LoadedWindow[]> {
  const { data, error } = await supabase
    .from('availability_slots')
    .select(WINDOW_SELECT)
    .eq('trainer_id', trainerId)
    .gte('session_date', startDate)
    .lte('session_date', endDate)
    .order('session_date')
    .order('start_time')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Array<WindowRow & { reservations: WindowReservation[] | null }>
  return rows.map(toLoadedWindow)
}

export function bookableSlotsFor(windows: LoadedWindow[], duration: ClassDuration, offered: readonly number[]): BookableSlot[] {
  const step = gridStepFor(offered)
  const result: BookableSlot[] = []
  for (const { window, taken } of windows) {
    if (!isSlotOpen(window)) continue
    for (const start of bookableStarts(window, taken, duration, step)) {
      const [h, m] = start.split(':').map(Number)
      const endMinutes = h * 60 + m + duration
      result.push({
        id: window.id,
        session_date: window.session_date,
        start_time: `${start}:00`,
        end_time: `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}:00`,
        class_type: window.class_type,
        duration_minutes: duration,
        max_capacity: 1,
        current_bookings: 0,
      })
    }
  }
  return result
}

/** La ventana en la que `time` (HH:MM) es un inicio reservable ese día para esa duración, o null. */
export function findBookableWindow(
  windows: LoadedWindow[],
  date: string,
  time: string,
  duration: ClassDuration,
  offered: readonly number[]
): LoadedWindow | null {
  const step = gridStepFor(offered)
  const wanted = time.slice(0, 5)
  for (const loaded of windows) {
    if (loaded.window.session_date !== date || !isSlotOpen(loaded.window)) continue
    if (bookableStarts(loaded.window, loaded.taken, duration, step).includes(wanted)) return loaded
  }
  return null
}
