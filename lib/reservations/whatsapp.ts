/**
 * Preferencia de avisos operativos por WhatsApp de una reserva (confirmación,
 * cambios, cancelación; nunca marketing). Puro: lo usan las notificaciones y
 * el dashboard.
 *
 *   1. `whatsapp_opt_in` si no es NULL (toda reserva desde la migración 010);
 *   2. solo si es NULL (reserva antigua), el "WhatsApp: si/no" que el widget
 *      escribía en `notes`.
 */
export function whatsappPreference(reservation: { whatsapp_opt_in?: boolean | null; notes?: string | null }): boolean {
  if (reservation.whatsapp_opt_in === true || reservation.whatsapp_opt_in === false) return reservation.whatsapp_opt_in
  return /whatsapp:\s*si/i.test(reservation.notes ?? '')
}
