import { calculateBookingPrice, type BookingPrice } from '@/lib/reservations/pricing'

/**
 * Cotización LEGADA de paquetes internos. Usa `calculateBookingPrice` del
 * widget público, sobre el precio de 1 jugador
 * de esa duración en la tabla del entrenador (trainer_session_prices), con el
 * descuento por volumen de siempre (10 % desde 5, 15 % desde 10). Aquí solo se
 * fija qué tamaños se vendían. El precio queda como foto fija al vender.
 * No usar esta cotización para reactivar ventas: el precio comercial del
 * paquete debe definirse de forma independiente del descuento multihora.
 */
export const PACKAGE_SIZES = [5, 10] as const
export type PackageSize = (typeof PACKAGE_SIZES)[number]

export function isPackageSize(value: unknown): value is PackageSize {
  return (PACKAGE_SIZES as readonly number[]).includes(Number(value))
}

export function packagePriceQuote(size: PackageSize, basePricePerSession: number, durationMinutes = 60): BookingPrice {
  return calculateBookingPrice(size, basePricePerSession, { durationMinutes, playerCount: 1 })
}
