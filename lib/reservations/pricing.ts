/**
 * Precio de una reserva. Es la MISMA regla que pinta el widget
 * (components/booking/BookingFlow.tsx y BookingStep1_SelectSessions.tsx):
 * 300 RM por sesión, 10 % de descuento desde 5 sesiones, 15 % desde 10.
 *
 * Aquí es donde se calcula lo que se guarda: el servidor nunca se fía del
 * total que mande el navegador.
 */

export const PRICE_PER_SESSION_RM = 300

export function discountPercentFor(sessionCount: number): number {
  if (sessionCount >= 10) return 15
  if (sessionCount >= 5) return 10
  return 0
}

export interface BookingPrice {
  pricePerSession: number
  discountPercent: number
  /** Precio de cada sesión ya con el descuento aplicado (es lo que se guarda en `reservations.price`) */
  discountedPricePerSession: number
  subtotal: number
  total: number
}

export function calculateBookingPrice(sessionCount: number): BookingPrice {
  const count = Math.max(0, Math.floor(sessionCount))
  const discountPercent = discountPercentFor(count)
  const subtotal = count * PRICE_PER_SESSION_RM
  // Con 300 RM y 10/15 % el descuento por sesión es entero (30 / 45), así que
  // sum(precio por sesión) == total, sin restos de redondeo.
  const discountedPricePerSession =
    PRICE_PER_SESSION_RM - Math.round((PRICE_PER_SESSION_RM * discountPercent) / 100)
  const total = subtotal - Math.round((subtotal * discountPercent) / 100)

  return {
    pricePerSession: PRICE_PER_SESSION_RM,
    discountPercent,
    discountedPricePerSession,
    subtotal,
    total,
  }
}
