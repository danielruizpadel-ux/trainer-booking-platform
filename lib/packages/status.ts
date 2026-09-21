import { reservationHoldsSlot } from '@/lib/availability/slot-status'

/**
 * Tipos y reglas puras de paquetes (sin Supabase), compartidas por el
 * servidor (queries, schedule) y la interfaz.
 */
export type PackageStatus = 'active' | 'completed' | 'cancelled'
export type PackageSessionStatus = 'not_scheduled' | 'scheduled' | 'completed' | 'cancelled'

export interface ClientPackage {
  id: string
  trainer_id: string
  client_name: string
  client_email: string
  client_phone: string | null
  sessions_total: number
  price_per_session_normal: number
  discount_percent: number
  price_per_session_discounted: number
  price_total: number
  /** Duración de todas las sesiones del paquete (60/90), migración 007 */
  duration_minutes: number
  status: PackageStatus
  notes: string | null
  created_at: string
  updated_at: string
}

/** Fila del listado: el paquete más cuántas sesiones tienen hueco vivo. */
export interface ClientPackageSummary extends ClientPackage {
  sessions_scheduled: number
}

/** La reserva real enlazada a una sesión agendada. */
export interface PackageSessionReservation {
  id: string
  status: string | null
  price: number | null
  client_name: string
  client_email: string
  client_phone: string | null
  notes: string | null
  created_at: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  slot: { id: string; session_date: string; start_time: string; end_time: string; class_type: string } | null
}

export interface PackageSession {
  id: string
  session_number: number
  status: PackageSessionStatus
  reservation_id: string | null
  reservation: PackageSessionReservation | null
}

export interface PackageDetail extends ClientPackage {
  sessions: PackageSession[]
}

/**
 * Una sesión "consume" crédito si está agendada y su reserva sigue viva. Si la
 * reserva se canceló desde Reservas (o quedó needs_reschedule), la sesión
 * vuelve a poder agendarse: el cliente no pierde la clase.
 */
export function sessionHoldsCredit(session: Pick<PackageSession, 'status' | 'reservation'>): boolean {
  if (session.status === 'completed') return true
  if (session.status !== 'scheduled') return false
  return session.reservation ? reservationHoldsSlot(session.reservation.status) : false
}

export function sessionCanBeScheduled(session: Pick<PackageSession, 'status' | 'reservation'>): boolean {
  if (session.status === 'not_scheduled') return true
  return session.status === 'scheduled' && !sessionHoldsCredit(session)
}
