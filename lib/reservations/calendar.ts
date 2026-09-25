/** Lo que devuelve GET /api/dashboard/calendar y pinta ReservationsCalendar (modelo 007: ventanas + reservas con rango). */

import type { TimeRange } from '@/lib/availability/windows'

export type CalendarReservationKind = 'pending' | 'proposed' | 'confirmed'

export interface CalendarWindow {
  id: string
  session_date: string
  start_time: string
  end_time: string
  class_type: string
  status: string | null
  /** Tramos sin reserva viva (ya descontadas las reservas) */
  free: TimeRange[]
}

export interface CalendarReservation {
  id: string
  window_id: string
  session_date: string
  start_time: string
  end_time: string
  duration_minutes: number
  client_name: string
  status: string | null
  kind: CalendarReservationKind
  /** Personas en la clase (1..4); null si la fila no lo trae */
  player_count?: number | null
}

export interface CalendarData {
  windows: CalendarWindow[]
  reservations: CalendarReservation[]
  /** Duraciones que ofrece el entrenador y rejilla de inicios */
  durations: number[]
  step: 30 | 60
}

/** Lo que devuelve el calendario en modo selector: ventana + hora elegida. */
export interface SlotPick {
  window_id: string
  session_date: string
  start_time: string
  end_time: string
  duration_minutes: number
}

/** @deprecated Forma anterior a la 007; la conservan solo los tipos de importaciones antiguas. */
export type CalendarSlot = SlotPick & { id: string }
