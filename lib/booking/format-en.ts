/** Formato en inglés del checkout público. Puro (sin zona horaria: son fechas locales del entrenador). */

/** "2026-09-28" → "Monday, September 28" */
export function formatSessionDateEn(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const value = new Date(y, (m || 1) - 1, d || 1)
  return value.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

/** "2026-09-19" → "Sat, Sep 19" (tablas del dashboard) */
export function formatDayShortEn(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const value = new Date(y, (m || 1) - 1, d || 1)
  return value.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "15:30" / "15:30:00" → "3:30 PM" */
export function formatSessionTimeEn(time: string): string {
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

/** 60 → "60 min", 90 → "90 min" */
export function formatDurationEn(minutes: number): string {
  return `${minutes} min`
}
