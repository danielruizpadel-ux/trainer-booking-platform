/**
 * Disponibilidad al vuelo (migración 007). Módulo puro.
 *
 * Una VENTANA (`availability_slots`) es un rango abierto del entrenador; una
 * clase es un rango [start, end) dentro de ella. Un inicio es reservable para
 * una duración D si [inicio, inicio + D) cabe en la ventana y no se solapa con
 * ninguna reserva viva de esa ventana.
 */

export interface TimeRange {
  /** HH:MM o HH:MM:SS */
  start_time: string
  end_time: string
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function addMinutes(time: string, minutes: number): string {
  return fromMinutes(toMinutes(time) + minutes)
}

/** Dos rangos [a) y [b) se solapan si comparten algún minuto. */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return toMinutes(a.start_time) < toMinutes(b.end_time) && toMinutes(b.start_time) < toMinutes(a.end_time)
}

/** Inicios (HH:MM) reservables en una ventana para una duración, en la rejilla dada. */
export function bookableStarts(window: TimeRange, taken: TimeRange[], durationMinutes: number, step: number): string[] {
  const windowStart = toMinutes(window.start_time)
  const windowEnd = toMinutes(window.end_time)
  const starts: string[] = []
  for (let start = windowStart; start + durationMinutes <= windowEnd; start += step) {
    const candidate = { start_time: fromMinutes(start), end_time: fromMinutes(start + durationMinutes) }
    if (!taken.some((t) => overlaps(candidate, t))) starts.push(candidate.start_time)
  }
  return starts
}

/** ¿Cabe exactamente este rango en la ventana sin solapar nada? */
export function fitsInWindow(window: TimeRange, taken: TimeRange[], range: TimeRange): boolean {
  if (toMinutes(range.start_time) < toMinutes(window.start_time)) return false
  if (toMinutes(range.end_time) > toMinutes(window.end_time)) return false
  return !taken.some((t) => overlaps(range, t))
}

/** Tramos libres de la ventana (para pintar el calendario). */
export function freeRanges(window: TimeRange, taken: TimeRange[]): TimeRange[] {
  const sorted = [...taken]
    .map((t) => ({ start: toMinutes(t.start_time), end: toMinutes(t.end_time) }))
    .sort((a, b) => a.start - b.start)
  const result: TimeRange[] = []
  let cursor = toMinutes(window.start_time)
  const end = toMinutes(window.end_time)
  for (const t of sorted) {
    if (t.start > cursor) result.push({ start_time: fromMinutes(cursor), end_time: fromMinutes(Math.min(t.start, end)) })
    cursor = Math.max(cursor, t.end)
  }
  if (cursor < end) result.push({ start_time: fromMinutes(cursor), end_time: fromMinutes(end) })
  return result
}
