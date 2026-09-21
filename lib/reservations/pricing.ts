import { durationMultiplier } from '@/lib/availability/durations'

/**
 * Precio de una reserva. Es la MISMA regla que pinta el widget
 * (components/booking/*): 300 RM por sesión de 1 h, 10 % de descuento desde 5
 * sesiones, 15 % desde 10. Una clase de 1 h 30 cuesta el precio de 1 h × 1,5
 * (migración 007), y sobre eso se aplican los mismos descuentos.
 *
 * Aquí es donde se calcula lo que se guarda: el servidor nunca se fía del
 * total que mande el navegador. Lo usan el widget (informativo), POST
 * /api/reservations, la reserva manual y los paquetes.
 */

export const PRICE_PER_SESSION_RM = 300

export function discountPercentFor(sessionCount: number): number {
  if (sessionCount >= 10) return 15
  if (sessionCount >= 5) return 10
  return 0
}

export interface BookingPrice {
  durationMinutes: number
  /** Precio de una sesión de esta duración, sin descuento */
  pricePerSession: number
  discountPercent: number
  /** Precio de cada sesión ya con el descuento aplicado (es lo que se guarda en `reservations.price`) */
  discountedPricePerSession: number
  subtotal: number
  total: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateBookingPrice(sessionCount: number, durationMinutes = 60): BookingPrice {
  const count = Math.max(0, Math.floor(sessionCount))
  const pricePerSession = round2(PRICE_PER_SESSION_RM * durationMultiplier(durationMinutes))
  const discountPercent = discountPercentFor(count)
  const subtotal = round2(count * pricePerSession)
  // El descuento por sesión es exacto en céntimos (300/450 × 10/15 %), así que
  // sum(precio por sesión) == total, sin restos de redondeo.
  const discountedPricePerSession = round2(pricePerSession - (pricePerSession * discountPercent) / 100)
  const total = round2(subtotal - (subtotal * discountPercent) / 100)

  return { durationMinutes, pricePerSession, discountPercent, discountedPricePerSession, subtotal, total }
}

/** "RM 300" / "RM 382,50" */
export function formatRM(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  const n = Number(amount)
  return `RM ${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')}`
}
