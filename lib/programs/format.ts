import { PROGRAM_TIME_ZONE } from './catalog'

/**
 * Fechas del programa, siempre en hora de Malasia. La zona va explícita en
 * cada formato para que servidor y navegador pinten lo mismo (sin desajustes
 * de hidratación) aunque el navegador esté en otra zona.
 */

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: PROGRAM_TIME_ZONE, ...options })

const longDateTime = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
const shortDate = fmt({ weekday: 'short', day: 'numeric', month: 'short' })
const time = fmt({ hour: '2-digit', minute: '2-digit', hour12: false })
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: PROGRAM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const weekdayShort = fmt({ weekday: 'short' })
const dayNumber = fmt({ day: 'numeric' })

/** "viernes, 25 de septiembre de 2026, 19:30" */
export const formatLongDateTime = (d: Date) => longDateTime.format(d)
/** "viernes, 25 de septiembre" */
export const formatLongDate = (d: Date) => longDate.format(d)
/** "vie, 25 sept" */
export const formatShortDate = (d: Date) => shortDate.format(d)
/** "19:30" */
export const formatTime = (d: Date) => time.format(d)
/** "2026-09-25" (día en Malasia) */
export const toProgramDateKey = (d: Date) => ymd.format(d)
export const formatWeekdayShort = (d: Date) => weekdayShort.format(d).replace('.', '')
export const formatDayNumber = (d: Date) => dayNumber.format(d)

/** "22 h 15 min" / "45 min" — tiempo que queda hasta `until`. */
export function formatRemaining(until: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((until.getTime() - now.getTime()) / 60000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return `${h} h ${String(m).padStart(2, '0')} min`
}

/** Fecha a una hora concreta de Malasia: día `dateKey` (YYYY-MM-DD) a las HH:MM. */
export function atProgramTime(dateKey: string, hhmm: string): Date {
  return new Date(`${dateKey}T${hhmm}:00+08:00`)
}

/** "sábado, 26 de septiembre" → "Sábado, 26 de septiembre" (el `capitalize` de CSS pondría "De Septiembre"). */
export const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
