/**
 * Utilidades de fecha para el calendario de reservas.
 *
 * IMPORTANTE: nunca usar date.toISOString() para obtener el "YYYY-MM-DD" de un
 * día del calendario. toISOString() convierte a UTC y en Malasia (UTC+8) devuelve
 * el día ANTERIOR, lo que rompe la selección de fechas.
 */

/** Devuelve "YYYY-MM-DD" en hora LOCAL (no UTC). */
export function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parsea "YYYY-MM-DD" como fecha local (evita el desfase de new Date(str)). */
export function parseDateStr(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Lunes de la semana a la que pertenece `date`. */
export function getMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

/** Índice de columna en una semana que empieza en lunes (lunes = 0 ... domingo = 6). */
export function mondayFirstIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateStr(a) === toDateStr(b)
}

/** "HH:MM" a partir de "HH:MM:SS" o "HH:MM". */
export function shortTime(time: string): string {
  return time.slice(0, 5)
}

/** Clave comparable de fecha/hora actual en Asia/Kuala_Lumpur. */
export function malaysiaNowKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

/** Evita seleccionar una clase que ya empezó en la zona del producto. */
export function isPastMalaysiaSession(date: string, time: string, now = new Date()): boolean {
  return `${date} ${shortTime(time)}` < malaysiaNowKey(now)
}

/** "Miércoles 2 sept, 10:00" */
export function formatSessionLabel(date: string, time: string): string {
  const d = parseDateStr(date)
  const dayName = d.toLocaleDateString('es-ES', { weekday: 'long' })
  const dayNum = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum}, ${shortTime(time)}`
}

/** "mié 2 sept, 10:00" (compacto) */
export function formatSessionLabelShort(date: string, time: string): string {
  const d = parseDateStr(date)
  const dayName = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')
  const dayNum = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return `${dayName} ${dayNum}, ${shortTime(time)}`
}
