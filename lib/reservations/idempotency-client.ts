/**
 * Lado del navegador de la idempotencia de POST /api/reservations (migración
 * 021; el servidor está en lib/reservations/idempotency.ts).
 *
 * Una clave por INTENTO de reserva: la misma mientras la petición no cambie
 * (reintentos tras un error de red o un 500 no confirmado), una nueva si
 * cambia algo (sesiones, jugadores, contacto, mensaje). Así repetir es seguro:
 * si la primera se guardó, el servidor devuelve esa misma respuesta.
 */
export interface AttemptKey {
  fingerprint: string
  key: string
}

export function newIdempotencyKey(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Navegadores sin randomUUID: UUID v4 con getRandomValues.
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** La clave para esta petición: la misma si no ha cambiado, una nueva si sí. */
export function attemptKeyFor(current: AttemptKey | null, fingerprint: string, generate: () => string = newIdempotencyKey): AttemptKey {
  return current && current.fingerprint === fingerprint ? current : { fingerprint, key: generate() }
}

export const UNCONFIRMED_BOOKING_MESSAGE =
  "We couldn't confirm your booking because the connection was interrupted. Tap Confirm booking again: it won't book twice."

export type CheckoutOutcome =
  | { kind: 'ok'; data: Record<string, unknown> }
  | { kind: 'failed'; status: number; message: string; code?: string }
  | { kind: 'unconfirmed' }

/**
 * Qué pasó con la petición. Solo es "falló" si es NUESTRA respuesta de error
 * ({ success: false, error }) y no dice que el resultado sea desconocido. Sin
 * respuesta (red), una respuesta ilegible o el `outcome_unknown` del servidor
 * → no confirmado: nunca se afirma que la reserva no se creó.
 */
export async function readCheckoutOutcome(send: () => Promise<Response>): Promise<CheckoutOutcome> {
  let response: Response
  try {
    response = await send()
  } catch {
    return { kind: 'unconfirmed' }
  }
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return { kind: 'unconfirmed' }
  if (response.ok && data.success === true) return { kind: 'ok', data }
  if (data.success === false && typeof data.error === 'string') {
    if (data.code === 'outcome_unknown') return { kind: 'unconfirmed' }
    return { kind: 'failed', status: response.status, message: data.error, code: typeof data.code === 'string' ? data.code : undefined }
  }
  return { kind: 'unconfirmed' }
}
