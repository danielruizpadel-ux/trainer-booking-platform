/** Mensajes vigentes de POST /api/reservations. No hay `code` para estos rechazos. */
export type BookingErrorKind = 'slot' | 'profile' | 'price' | 'other'

export function classifyBookingError(status: number, message: string): BookingErrorKind {
  if (status === 409 && message === 'Complete your player profile before booking with your account.') return 'profile'
  if (status === 409 && message === "This coach hasn't set a price for this session yet.") return 'price'
  if (status === 409 && (
    message === 'That time was just booked by someone else. Please choose another time.' ||
    /^\d{4}-\d{2}-\d{2} at \d{2}:\d{2} was just booked\. Please choose another time\.$/.test(message)
  )) return 'slot'
  if (status === 404 && /^\d{4}-\d{2}-\d{2} at \d{2}:\d{2} is no longer available\.$/.test(message)) return 'slot'
  return 'other'
}
