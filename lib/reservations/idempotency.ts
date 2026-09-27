import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Idempotencia de POST /api/reservations (migración 021).
 *
 *   clave   cabecera `Idempotency-Key`: un UUID que el navegador genera por
 *           intento de reserva y repite en los reintentos
 *           (lib/reservations/idempotency-client.ts).
 *   scope   de quién es: 'player:<players.id>' (con cuenta; sale de la
 *           sesión) o 'guest:<sha256 del email>' (invitado). Una clave solo
 *           existe dentro de su scope.
 *   huella  sha256 de la petición normalizada: la misma clave con otra
 *           petición se rechaza (422).
 *
 * El registro de la clave, las reservas y la respuesta se escriben juntos en
 * create_booking_request (una transacción). Aquí: leer la clave, calcular
 * scope y huella.
 */
export const IDEMPOTENCY_HEADER = 'idempotency-key'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readIdempotencyKey(request: Request): string | null {
  const value = request.headers.get(IDEMPOTENCY_HEADER)?.trim() ?? ''
  return UUID_RE.test(value) ? value.toLowerCase() : null
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export function bookingScope(identity: { playerId: string } | { guestEmail: string }): string {
  return 'playerId' in identity
    ? `player:${identity.playerId}`
    : `guest:${sha256(identity.guestEmail.trim().toLowerCase())}`
}

/** JSON con las claves ordenadas: el mismo contenido da la misma huella. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export function requestFingerprint(normalized: unknown): string {
  return sha256(canonical(normalized))
}

export type StoredBooking =
  | { found: false }
  | { found: true; sameRequest: boolean; response: Record<string, unknown> }
  | { error: true }

/** La clave ya guardada en ese scope (antes de revalidar la disponibilidad). */
export async function findStoredBooking(supabase: SupabaseClient, scope: string, key: string, hash: string): Promise<StoredBooking> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select('request_hash, response')
    .eq('scope', scope)
    .eq('idempotency_key', key)
    .maybeSingle()
  if (error) {
    console.error('No se pudo leer la clave de idempotencia:', { code: error.code ?? null })
    return { error: true }
  }
  if (!data) return { found: false }
  const row = data as { request_hash: string; response: Record<string, unknown> }
  return { found: true, sameRequest: row.request_hash === hash, response: row.response }
}
