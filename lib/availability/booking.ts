import type { SupabaseClient } from '@supabase/supabase-js'
import { isSlotOpen } from './slot-status'
import { bookableStarts, type TimeRange } from './windows'
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
  const windows = rows.map(toLoadedWindow)

  // Reservas vivas de CUALQUIER ventana del entrenador ese día, no solo las
  // de su propia fila: si hay más de una fila de disponibilidad para el
  // mismo día (huecos legacy sueltos junto a la ventana generada por el
  // patrón semanal), una reserva en una no debe quedar invisible para las
  // demás y dejar reservar la misma hora real dos veces. Solo lectura, así
  // que agrupar en memoria (ya se pidió todo el rango en una sola consulta)
  // en vez de repetir la consulta como hace loadTakenForDate en slots.ts.
  const takenByDate = new Map<string, Array<TimeRange & { id: string }>>()
  for (const w of windows) {
    const list = takenByDate.get(w.window.session_date) ?? []
    list.push(...w.taken)
    takenByDate.set(w.window.session_date, list)
  }
  for (const w of windows) {
    w.taken = takenByDate.get(w.window.session_date) ?? []
  }
  return windows
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
