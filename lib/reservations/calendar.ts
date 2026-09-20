/** Lo que devuelve GET /api/dashboard/calendar y pinta ReservationsCalendar. */

export type CalendarSlotKind = 'pending' | 'proposed' | 'confirmed' | 'available' | 'closed'

export interface CalendarSlot {
  id: string
  session_date: string
  start_time: string
  end_time: string
  class_type: string
  kind: CalendarSlotKind
  reservation: { id: string; client_name: string; status: string | null } | null
}
