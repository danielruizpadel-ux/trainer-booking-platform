import { parseDateStr, shortTime } from '@/lib/dateUtils'
import { RESERVATION_STATUS, isAwaitingConfirmation, isRescheduleProposed } from './status'

/** Pestañas de la página de Reservas. */
export type ReservationTab = 'pending' | 'confirmed' | 'cancelled'

/**
 * A qué pestaña va cada estado.
 *   pending    pending_confirmation (y el `pending` antiguo), reschedule_proposed
 *   confirmed  confirmed, completed
 *   cancelled  needs_reschedule, cancelled y cualquier otro estado
 */
export function reservationTab(status: string | null | undefined): ReservationTab {
  const value = (status ?? '').trim().toLowerCase()
  if (isAwaitingConfirmation(value) || isRescheduleProposed(value)) return 'pending'
  if (value === RESERVATION_STATUS.CONFIRMED || value === RESERVATION_STATUS.COMPLETED) {
    return 'confirmed'
  }
  return 'cancelled'
}

/** "Mié 30 sept" */
export function formatDayShort(date: string): string {
  const d = parseDateStr(date)
  const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')
  const dayNum = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
  return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum}`
}

/** "09:00" */
export function formatTime(time: string): string {
  return shortTime(time)
}

/** "1 h", "1 h 30 min", "45 min". Vacío si falta alguna hora. */
export function formatDuration(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return ''
  const minutes = toMinutes(end) - toMinutes(start)
  if (!Number.isFinite(minutes) || minutes <= 0) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Para el buscador: minúsculas y sin tildes. */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Rango real de una reserva: sus propias horas (migración 007) o, en las
 * anteriores, la hora de su ventana + 60 min. null si no tiene ventana.
 */
export function reservationRangeOf(r: {
  start_time?: string | null
  end_time?: string | null
  slot: { start_time: string; end_time: string } | null
}): { start_time: string; end_time: string } | null {
  if (r.start_time && r.end_time) return { start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5) }
  if (!r.slot) return null
  const [h, m] = r.slot.start_time.split(':').map(Number)
  const end = Math.min(h * 60 + (m || 0) + 60, (() => { const [eh, em] = r.slot!.end_time.split(':').map(Number); return eh * 60 + (em || 0) })())
  return {
    start_time: r.slot.start_time.slice(0, 5),
    end_time: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
  }
}
