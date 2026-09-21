import { calculateBookingPrice, type BookingPrice } from '@/lib/reservations/pricing'

/**
 * Paquetes de 5 y 10 clases. No hay regla de precio nueva: es la MISMA
 * `calculateBookingPrice` del widget público y de la reserva manual
 * (300 RM/sesión, 10 % desde 5, 15 % desde 10). Aquí solo se fija qué
 * tamaños se venden.
 */
export const PACKAGE_SIZES = [5, 10] as const
export type PackageSize = (typeof PACKAGE_SIZES)[number]

export function isPackageSize(value: unknown): value is PackageSize {
  return (PACKAGE_SIZES as readonly number[]).includes(Number(value))
}

export function packagePriceQuote(size: PackageSize, durationMinutes = 60): BookingPrice {
  return calculateBookingPrice(size, durationMinutes)
}
