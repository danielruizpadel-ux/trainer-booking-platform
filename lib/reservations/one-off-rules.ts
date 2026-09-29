/**
 * Clase puntual (el entrenador reserva un tramo para un cliente aunque esté
 * fuera de su disponibilidad habitual). Reglas puras, sin Supabase: las usan
 * el calendario del Resumen (para avisar antes de guardar),
 * lib/reservations/one-off.ts (servidor, que decide) y
 * scripts/verify-one-off.mjs.
 *
 * Un tramo vale si:
 *   - fecha YYYY-MM-DD real, inicio HH:MM en la rejilla de 30 min;
 *   - la duración es una de las que ofrece el entrenador (60/90);
 *   - termina el mismo día;
 *   - no ha empezado ya en Kuala Lumpur, y no está a más de un año vista;
 *   - no pisa ninguna reserva viva del entrenador ese día.
 */

import { fromMinutes, overlaps, toMinutes, type TimeRange } from '@/lib/availability/windows'
import { durationLabel } from '@/lib/availability/durations'
import { isPastMalaysiaSession, malaysiaNowKey } from '@/lib/dateUtils'

/** Rejilla del tramo arrastrado y de los inicios que acepta el servidor. */
export const ONE_OFF_STEP = 30
export const ONE_OFF_MAX_DAYS_AHEAD = 365

export type OneOffIssue = 'invalid' | 'duration' | 'past' | 'too-far' | 'overlap'

export type OneOffCheck =
  | { ok: true; range: TimeRange }
  | { ok: false; issue: OneOffIssue; message: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

function isRealDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false
  const [y, m, d] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  return utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d
}

function addDaysToKey(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function joinDurations(durations: readonly number[]): string {
  const labels = [...durations].sort((a, b) => a - b).map(durationLabel)
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} o ${labels[labels.length - 1]}` : (labels[0] ?? '')
}

/**
 * ¿Se puede crear una clase puntual en ese tramo? `taken` son las reservas
 * vivas del entrenador ese día (de cualquier ventana); null = no se sabe
 * (no se comprueba aquí: el servidor siempre las pasa, y además la base
 * rechaza el solape con `reservations_no_overlap`).
 */
export function checkOneOffRange(
  input: { session_date: string; start_time: string; duration_minutes: number },
  offered: readonly number[],
  taken: TimeRange[] | null,
  now: Date = new Date()
): OneOffCheck {
  const date = input.session_date
  const start = input.start_time.slice(0, 5)
  const duration = input.duration_minutes
  if (!isRealDate(date) || !TIME_RE.test(start)) {
    return { ok: false, issue: 'invalid', message: 'Fecha u hora no válida' }
  }
  const startMin = toMinutes(start)
  if (startMin >= 24 * 60 || startMin % ONE_OFF_STEP !== 0) {
    return { ok: false, issue: 'invalid', message: 'La hora de inicio tiene que ser en punto o y media' }
  }
  if (!offered.includes(duration)) {
    return { ok: false, issue: 'duration', message: `Una clase dura ${joinDurations(offered)}` }
  }
  const endMin = startMin + duration
  // Termina el mismo día (23:59 como tarde): el rango de la base es fecha + hora.
  if (endMin >= 24 * 60) {
    return { ok: false, issue: 'invalid', message: 'La clase tiene que terminar el mismo día' }
  }
  if (isPastMalaysiaSession(date, start, now)) {
    return { ok: false, issue: 'past', message: 'Ese tramo ya ha empezado' }
  }
  const today = malaysiaNowKey(now).slice(0, 10)
  if (date > addDaysToKey(today, ONE_OFF_MAX_DAYS_AHEAD)) {
    return { ok: false, issue: 'too-far', message: 'Como mucho, a un año vista' }
  }
  const range: TimeRange = { start_time: start, end_time: fromMinutes(endMin) }
  if (taken && taken.some((t) => overlaps(range, t))) {
    return { ok: false, issue: 'overlap', message: 'Ese tramo pisa una reserva que ya existe' }
  }
  return { ok: true, range }
}

/**
 * Tramo arrastrado (o elegido con dos toques) entre dos minutos del día,
 * ajustado a la rejilla de 30 min: desde el inicio de la celda donde empieza
 * hasta el final de la celda donde acaba, en cualquier dirección. Como
 * mínimo una celda; recortado a [minMinute, maxMinute].
 */
export function selectionFromPoints(a: number, b: number, minMinute: number, maxMinute: number, step: number = ONE_OFF_STEP): { start: number; end: number } {
  const clamp = (v: number) => Math.min(Math.max(v, minMinute), maxMinute)
  const lo = clamp(Math.min(a, b))
  const hi = clamp(Math.max(a, b))
  let start = Math.floor(lo / step) * step
  let end = Math.ceil(hi / step) * step
  if (end <= start) end = start + step
  if (end > maxMinute) {
    end = Math.floor(maxMinute / step) * step
    start = Math.min(start, end - step)
  }
  return { start, end }
}

/**
 * Duración con la que se propone crear la clase del tramo elegido: la del
 * propio tramo si el entrenador la ofrece; si no, null (se elige entre las
 * suyas, empezando a la misma hora).
 */
export function durationForSelection(lengthMinutes: number, offered: readonly number[]): number | null {
  return offered.includes(lengthMinutes) ? lengthMinutes : null
}
