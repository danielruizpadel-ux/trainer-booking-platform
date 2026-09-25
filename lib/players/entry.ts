/**
 * Reglas puras de la entrada a /cuenta (sin Supabase ni Next), compartidas
 * por proxy.ts, /cuenta/auth/callback y /cuenta/auth/vincular.
 *
 * Sin imports con alias `@/` a propósito: scripts/verify-player-entry.mjs
 * las carga transpilando este fichero tal cual.
 */

/** Slugs de `trainers`: minúsculas, dígitos y guiones. Todo lo demás se descarta sin consultar. */
export function isValidTrainerSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value)
}

/**
 * Identificador del borrador de reserva (lib/booking/draft.ts): un UUID de
 * crypto.randomUUID(). Solo viaja por la URL para que cada pestaña recupere
 * SU borrador al volver del login; no es secreto ni da acceso a nada. Solo
 * se acepta con este formato: nunca puede convertirse en una ruta.
 */
export function isDraftId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
}

/** `&draft=<uuid>` si es válido; si no, nada. */
function draftQuery(draftId: unknown): string {
  return isDraftId(draftId) ? `&draft=${draftId}` : ''
}

/**
 * Adónde manda el proxy a quien YA tiene sesión y abre /cuenta/entrar.
 *
 * Con un `trainer` válido no se puede ir directo a /cuenta: se perdería el
 * entrenador. Se pasa por /cuenta/auth/vincular, que crea la relación en el
 * servidor. Sin trainer (o con uno mal formado), a /cuenta como siempre.
 */
export function loggedInEntryRedirect(trainerParam: string | null, draftParam: string | null = null): string {
  if (!isValidTrainerSlug(trainerParam)) return '/cuenta'
  return `/cuenta/auth/vincular?trainer=${encodeURIComponent(trainerParam)}${draftQuery(draftParam)}`
}

/**
 * ¿Puede una petición GET con sesión crear la relación jugador ↔ entrenador
 * sin más confirmación?
 *
 * Sí si viene de nuestra propia web (el enlace de la página del entrenador:
 * `same-origin`) o el usuario abrió la URL a mano / desde otra app (`none`).
 * Navegadores sin Fetch Metadata no mandan la cabecera: se acepta.
 *
 * No si viene de otra web (`cross-site`, `same-site`): así una página ajena
 * no puede vincular a un jugador con sesión a un entrenador cualquiera con
 * un simple enlace (CSRF). Tampoco en un prefetch del router.
 */
export function allowsImplicitTrainerLink(headers: {
  get(name: string): string | null
}): boolean {
  if (headers.get('next-router-prefetch') !== null) return false
  if ((headers.get('purpose') ?? headers.get('sec-purpose') ?? '').includes('prefetch')) return false

  const site = headers.get('sec-fetch-site')
  return site === null || site === 'same-origin' || site === 'none'
}

/**
 * Vuelta a la reserva del entrenador: su página pública, en la sección de
 * reserva. Es la misma ruta genérica que "Tus entrenadores" (`/<slug>`; para
 * `mauri` la sirve app/mauri). Solo se construye desde un slug válido que el
 * servidor ya ha comprobado que es de un entrenador activo, nunca desde una
 * URL que mande el cliente: no hay redirección abierta posible.
 */
export function trainerReturnPath(trainerSlug: string, draftId: string | null = null): string {
  if (!isValidTrainerSlug(trainerSlug)) return '/cuenta'
  return isDraftId(draftId) ? `/${trainerSlug}?draft=${draftId}#booking-section` : `/${trainerSlug}#booking-section`
}

/**
 * Destino tras entrar.
 *
 *   - Sin onboarding: siempre bienvenida, llevando el entrenador si lo hay.
 *   - Con onboarding y entrenador: de vuelta a su reserva.
 *   - Si no: `next` (por defecto /cuenta).
 *   - `draftId` (borrador de reserva) solo acompaña al entrenador; sin
 *     entrenador válido se descarta.
 *
 * `trainerSlug` tiene que venir ya resuelto contra la base de datos
 * (findActiveTrainerBySlug), no el parámetro crudo de la URL.
 */
export function playerDestination(
  onboardingCompletedAt: string | null,
  {
    next = '/cuenta',
    trainerSlug = null,
    draftId = null,
  }: { next?: string; trainerSlug?: string | null; draftId?: string | null } = {}
): string {
  const trainer = isValidTrainerSlug(trainerSlug) ? trainerSlug : null
  if (onboardingCompletedAt === null) {
    return trainer
      ? `/cuenta/bienvenida?trainer=${encodeURIComponent(trainer)}${draftQuery(draftId)}`
      : '/cuenta/bienvenida'
  }
  return trainer ? trainerReturnPath(trainer, draftId) : next
}
