/**
 * Precio de una reserva — cálculo PURO, sin base de datos. Lo usan el
 * servidor (que es quien fija lo que se cobra) y el navegador (solo como
 * vista previa). Ningún importe vive aquí: el precio base sale de la
 * configuración del entrenador (`trainer_session_prices`, migración 010;
 * lectura en lib/reservations/trainer-prices.ts).
 *
 * Orden del cálculo:
 *
 *   1. precio base = tabla del entrenador (duración × nº de jugadores)
 *   2. % de descuento por nº de sesiones del checkout (5+ → 10 %, 10+ → 15 %)
 *   3. precio por sesión = round2(base − base × % / 100)
 *        → es lo que se guarda en cada fila de reservations.price (snapshot)
 *   4. total = nº de sesiones × precio por sesión
 *
 * El total se deriva del precio por sesión ya redondeado, así que
 * sum(reservations.price) == total para CUALQUIER precio que ponga el
 * entrenador, no solo para los actuales. Con los importes de antes de la 010
 * (300 / 450) el resultado es idéntico al de siempre.
 *
 * Los descuentos por volumen siguen siendo fijos (no son configuración del
 * entrenador todavía): cambiarlos afecta también a los paquetes vendidos.
 */

/** Descuento por nº de sesiones de un mismo checkout. De mayor a menor. */
export const SESSION_DISCOUNTS = [
  { minSessions: 10, percent: 15 },
  { minSessions: 5, percent: 10 },
] as const

export function discountPercentFor(sessionCount: number): number {
  return SESSION_DISCOUNTS.find((d) => sessionCount >= d.minSessions)?.percent ?? 0
}

/** Personas en una clase privada (reservations.player_count). No es capacidad de grupo. */
export const PLAYER_COUNTS = [1, 2, 3, 4] as const
export type PlayerCount = (typeof PLAYER_COUNTS)[number]

export function isPlayerCount(value: unknown): value is PlayerCount {
  return typeof value === 'number' && (PLAYER_COUNTS as readonly number[]).includes(value)
}

/** Una fila de trainer_session_prices. */
export interface SessionPriceRow {
  duration_minutes: number
  player_count: number
  price_rm: number
}

/** Precio base de la tabla, o null si esa combinación no está configurada. */
export function basePriceFor(rows: readonly SessionPriceRow[], durationMinutes: number, playerCount: number): number | null {
  const row = rows.find((r) => Number(r.duration_minutes) === durationMinutes && Number(r.player_count) === playerCount)
  const price = row ? Number(row.price_rm) : NaN
  return Number.isFinite(price) && price > 0 ? price : null
}

export interface BookingPrice {
  durationMinutes: number
  playerCount: number
  /** Precio base de una sesión (tabla del entrenador), sin descuento */
  pricePerSession: number
  discountPercent: number
  /** Precio de cada sesión ya con el descuento (lo que se guarda en `reservations.price`) */
  discountedPricePerSession: number
  subtotal: number
  total: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateBookingPrice(
  sessionCount: number,
  basePricePerSession: number,
  { durationMinutes = 60, playerCount = 1 }: { durationMinutes?: number; playerCount?: number } = {}
): BookingPrice {
  const count = Math.max(0, Math.floor(sessionCount))
  const pricePerSession = round2(basePricePerSession)
  const discountPercent = discountPercentFor(count)
  const discountedPricePerSession = round2(pricePerSession - (pricePerSession * discountPercent) / 100)
  return {
    durationMinutes,
    playerCount,
    pricePerSession,
    discountPercent,
    discountedPricePerSession,
    subtotal: round2(count * pricePerSession),
    total: round2(count * discountedPricePerSession),
  }
}

/** Tabla + selección → precio, o null si el entrenador no tiene ese precio configurado. */
export function quoteBooking(
  rows: readonly SessionPriceRow[],
  sessionCount: number,
  durationMinutes: number,
  playerCount: number
): BookingPrice | null {
  const base = basePriceFor(rows, durationMinutes, playerCount)
  return base === null ? null : calculateBookingPrice(sessionCount, base, { durationMinutes, playerCount })
}

/** "RM 300" / "RM 382,50" */
export function formatRM(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  const n = Number(amount)
  return `RM ${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')}`
}

/** "RM300" / "RM382.50" — formato del checkout público (en inglés) */
export function formatRMEn(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  const n = Number(amount)
  return `RM${Number.isInteger(n) ? n : n.toFixed(2)}`
}
