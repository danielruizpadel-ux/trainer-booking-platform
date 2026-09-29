/**
 * Reglas del calendario del entrenador (dashboard) para crear una clase desde
 * un tramo libre, y el resumen de una reserva que se enseña al pasar por
 * encima. Sin React: lo usan ReservationsCalendar y
 * scripts/verify-calendar-interaction.mjs.
 *
 * Los inicios salen de `bookableStarts` (el mismo cálculo que el widget
 * público: rejilla desde el inicio de la ventana, sin pisar reservas vivas) y
 * además se quitan los que ya empezaron en Kuala Lumpur. El servidor
 * (lib/reservations/manual.ts) vuelve a comprobarlo todo al crear.
 */

import { bookableStarts, toMinutes, type TimeRange } from '@/lib/availability/windows'
import { durationLabel } from '@/lib/availability/durations'
import { isPastMalaysiaSession } from '@/lib/dateUtils'
import type { CalendarReservation } from './calendar'

/** Inicios reservables de una ventana para `duration`, sin horas pasadas. */
export function futureBookableStarts(
  window: TimeRange & { session_date: string },
  taken: TimeRange[],
  duration: number,
  step: number,
  now: Date = new Date()
): string[] {
  return bookableStarts(window, taken, duration, step).filter((start) => !isPastMalaysiaSession(window.session_date, start, now))
}

/**
 * Duración con la que el calendario del Resumen decide qué parece reservable
 * (ya no hay selector global): la más corta que ofrece el entrenador. Un
 * inicio sale como reservable si cabe al menos esa clase; las más largas se
 * eligen después en "Nueva reserva", solo entre las que caben
 * (`durationsFittingAt`).
 */
export function shortestDuration(durations: number[]): number {
  const valid = durations.filter((d) => Number.isFinite(d) && d > 0)
  return valid.length > 0 ? Math.min(...valid) : 60
}

/**
 * Duraciones del entrenador que caben empezando en `start` en esa ventana
 * (sin pisar reservas, sin salirse, sin ser pasado), de menor a mayor.
 */
export function durationsFittingAt(
  window: TimeRange & { session_date: string },
  taken: TimeRange[],
  durations: number[],
  step: number,
  start: string,
  now: Date = new Date()
): number[] {
  return [...durations]
    .sort((a, b) => a - b)
    .filter((d) => futureBookableStarts(window, taken, d, step, now).includes(start))
}

/** Los inicios cuya clase entera cabe dentro del tramo libre `range`. */
export function startsInRange(starts: string[], range: TimeRange, duration: number): string[] {
  const from = toMinutes(range.start_time)
  const to = toMinutes(range.end_time)
  return starts.filter((s) => toMinutes(s) >= from && toMinutes(s) + duration <= to)
}

export type RangeState = 'bookable' | 'too-short' | 'past'

/**
 * Cómo pintar un tramo libre: reservable si tiene al menos un inicio; si no,
 * "pasado" cuando ya no queda tiempo futuro en él, y "no cabe" en el resto
 * (tramo más corto que la clase, o que no encaja en la rejilla).
 */
export function rangeState(date: string, range: TimeRange, rangeStarts: string[], duration: number, now: Date = new Date()): RangeState {
  if (rangeStarts.length > 0) return 'bookable'
  const length = toMinutes(range.end_time) - toMinutes(range.start_time)
  if (length >= duration) {
    const lastStart = toMinutes(range.end_time) - duration
    const hhmm = `${String(Math.floor(lastStart / 60)).padStart(2, '0')}:${String(lastStart % 60).padStart(2, '0')}`
    if (isPastMalaysiaSession(date, hhmm, now)) return 'past'
  }
  return 'too-short'
}

/**
 * Hora de inicio para un clic en el minuto `minute` del día (dentro de un
 * tramo). Primero, el inicio de la celda de la rejilla donde cae el clic; si
 * esa no es reservable (p. ej. el final del tramo, donde la clase ya no
 * cabe), la última clase reservable que cubre ese punto. Si ninguna lo cubre,
 * null: ese punto no se presenta como reservable.
 */
export function startAtMinute(rangeStarts: string[], minute: number, duration: number, step: number): string | null {
  const cell = rangeStarts.find((s) => toMinutes(s) <= minute && minute < toMinutes(s) + step)
  if (cell) return cell
  const covering = rangeStarts.filter((s) => toMinutes(s) <= minute && minute < toMinutes(s) + duration)
  return covering.length > 0 ? covering[covering.length - 1] : null
}

export interface ReservationSummary {
  client: string
  when: string
  duration: string
  status: string
  /** "2 jugadores"; null si la reserva no lo trae */
  players: string | null
}

const KIND_LABEL: Record<CalendarReservation['kind'], string> = {
  pending: 'Pendiente de confirmar',
  proposed: 'Nueva hora propuesta',
  confirmed: 'Confirmada',
}

/**
 * Lo que enseña el resumen al pasar por encima / enfocar / tocar: cliente,
 * horario, duración, estado y jugadores. Nada de email, teléfono, notas ni
 * precio (eso está en el detalle, un clic más allá).
 */
export function reservationSummary(r: CalendarReservation, dayLabel: string): ReservationSummary {
  const count = typeof r.player_count === 'number' && r.player_count > 0 ? r.player_count : null
  return {
    client: r.client_name,
    when: `${dayLabel} · ${r.start_time.slice(0, 5)} – ${r.end_time.slice(0, 5)}`,
    duration: durationLabel(r.duration_minutes),
    status: KIND_LABEL[r.kind],
    players: count === null ? null : `${count} ${count === 1 ? 'jugador' : 'jugadores'}`,
  }
}

export const reservationKindLabel = (kind: CalendarReservation['kind']) => KIND_LABEL[kind]
