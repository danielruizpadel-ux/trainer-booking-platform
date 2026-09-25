/**
 * Datos de contacto de una reserva hecha con la cuenta de jugador.
 *
 * Puro y sin imports: lo usan el servidor (POST /api/reservations), el
 * widget (resumen "Reservas como…") y scripts/verify-player-entry.mjs.
 */

/** Lo que el widget necesita para enseñar el resumen. Solo el propio jugador lo recibe. */
export interface BookingPlayer {
  full_name: string
  email: string
  phone: string
  whatsapp_opt_in: boolean
}

export interface BookingContact {
  client_name: string
  client_email: string
  client_phone: string
  client_whatsapp_opt_in: boolean
}

/**
 * Perfil del jugador → contacto de la reserva. null si el perfil no está
 * completo (sin onboarding, o sin nombre / teléfono / email): entonces la
 * reserva con cuenta no es posible y el widget usa el formulario de siempre.
 *
 * El email sale de la identidad autenticada (Supabase Auth), no del perfil.
 */
export function bookingPlayerFromProfile(
  player: {
    full_name: string | null
    phone: string | null
    whatsapp_opt_in: boolean
    onboarding_completed_at: string | null
  },
  authEmail: string | null | undefined
): BookingPlayer | null {
  const email = (authEmail ?? '').trim().toLowerCase()
  if (!player.onboarding_completed_at || !player.full_name || !player.phone || !email) return null
  return {
    full_name: player.full_name,
    email,
    phone: player.phone,
    whatsapp_opt_in: player.whatsapp_opt_in,
  }
}

export function bookingContactFromPlayer(player: BookingPlayer): BookingContact {
  return {
    client_name: player.full_name,
    client_email: player.email,
    client_phone: player.phone,
    client_whatsapp_opt_in: player.whatsapp_opt_in,
  }
}

/**
 * ¿El error de `auth.getUser()` es un fallo de infraestructura (Supabase Auth
 * caído, red) y no "no hay sesión válida"?
 *
 *   - Sin sesión (AuthSessionMissingError, 400), token caducado o inválido
 *     (AuthApiError 401/403, AuthInvalidJwtError 400) → false: es anónimo.
 *   - Red / Auth caído (AuthRetryableFetchError, AuthUnknownError, 5xx) → true:
 *     no se puede decir que el usuario no esté autenticado.
 */
export function isAuthInfraError(error: { name?: string; status?: number } | null | undefined): boolean {
  if (!error) return false
  if (error.name === 'AuthRetryableFetchError' || error.name === 'AuthUnknownError') return true
  return typeof error.status !== 'number' || error.status === 0 || error.status >= 500
}

/**
 * Qué hace el widget de reserva con la cuenta de jugador:
 *
 *   - anonymous: sin sesión → formulario de siempre (reservar sin cuenta).
 *   - player: sesión + perfil completo → sus datos, sin formulario.
 *   - incomplete: sesión SIN perfil completo → antes de reservar con la
 *     sesión abierta hay que completar el perfil. No se cae en silencio al
 *     formulario anónimo.
 *   - loading: aún comprobándolo; no se deja confirmar todavía.
 *
 * (Si la comprobación FALLA, la página lo dice y deja reservar sin cuenta:
 * eso lo decide components/mauri/BookingSection, que es quien lo sabe.)
 */
export type BookingAccount =
  | { kind: 'anonymous' }
  | { kind: 'loading' }
  | { kind: 'player'; player: BookingPlayer }
  | { kind: 'incomplete'; completeProfileHref: string }
