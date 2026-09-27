import type { SupabaseClient } from '@supabase/supabase-js'
import { sha256 } from './idempotency'

/**
 * Límite de peticiones de POST /api/reservations (migración 021).
 *
 * Contadores en Postgres (rate_limit_consume): compartidos entre todas las
 * instancias del servidor; nada en memoria. Ventana fija de 10 minutos.
 *
 * A quién se cuenta (cubos; se bloquea si CUALQUIERA pasa de su límite):
 *
 *   player:<players.id>     con cuenta: sale de la sesión, no se falsifica.
 *   email:<sha256>          invitado: su email normalizado.
 *   phone:<sha256>          invitado: su teléfono (solo dígitos).
 *   trainer:<id>            por entrenador, para todos: un techo que ningún
 *                           cambio de email/teléfono/IP permite saltarse.
 *   ip:<sha256>             SOLO si TRUSTED_CLIENT_IP_HEADER nombra una
 *                           cabecera que pone la propia plataforma (p. ej. en
 *                           Vercel `x-real-ip`, que Vercel sobrescribe). Sin
 *                           esa variable no se usa ninguna IP: X-Forwarded-For
 *                           lo puede escribir el cliente.
 *
 * Se cuentan en ese orden y se para en el primero agotado (el del
 * entrenador va último).
 *
 * Los valores personales van con hash: la tabla no guarda emails, teléfonos
 * ni IPs en claro.
 */
export const RATE_WINDOW_SECONDS = 600

export const RATE_LIMITS = {
  player: 6,
  email: 6,
  phone: 6,
  trainer: 60,
  ip: 12,
} as const

export interface RateIdentity {
  playerId?: string | null
  guestEmail?: string | null
  guestPhone?: string | null
  trainerId: string
  clientIp?: string | null
}

export function rateLimitBuckets(identity: RateIdentity): { buckets: string[]; limits: number[] } {
  const buckets: string[] = []
  const limits: number[] = []
  const add = (bucket: string, limit: number) => {
    buckets.push(bucket)
    limits.push(limit)
  }
  if (identity.playerId) add(`player:${identity.playerId}`, RATE_LIMITS.player)
  if (identity.guestEmail) add(`email:${sha256(identity.guestEmail.trim().toLowerCase())}`, RATE_LIMITS.email)
  if (identity.guestPhone) {
    const digits = identity.guestPhone.replace(/\D/g, '')
    if (digits) add(`phone:${sha256(digits)}`, RATE_LIMITS.phone)
  }
  if (identity.clientIp) add(`ip:${sha256(identity.clientIp)}`, RATE_LIMITS.ip)
  // El del entrenador, el ÚLTIMO: rate_limit_consume para en el primer cubo
  // agotado, así quien ya está bloqueado por su email/teléfono/IP no gasta el
  // cupo compartido del entrenador (no puede agotárselo a los demás).
  add(`trainer:${identity.trainerId}`, RATE_LIMITS.trainer)
  return { buckets, limits }
}

/**
 * IP del cliente SOLO desde una cabecera de confianza configurada por el
 * despliegue. Si la cabecera trae una lista, se toma el primer valor (el que
 * pone la plataforma). Sin configurar → null (no se adivina).
 */
export function trustedClientIp(request: Request, headerName = process.env.TRUSTED_CLIENT_IP_HEADER): string | null {
  const name = headerName?.trim().toLowerCase()
  if (!name) return null
  const raw = request.headers.get(name)
  const first = raw?.split(',')[0]?.trim()
  return first ? first : null
}

export type RateResult = { allowed: true } | { allowed: false; retryAfter: number } | { error: true }

export async function consumeRateLimit(supabase: SupabaseClient, identity: RateIdentity): Promise<RateResult> {
  const { buckets, limits } = rateLimitBuckets(identity)
  const { data, error } = await supabase.rpc('rate_limit_consume', {
    p_buckets: buckets,
    p_limits: limits,
    p_window_seconds: RATE_WINDOW_SECONDS,
  })
  if (error) {
    console.error('No se pudo comprobar el límite de peticiones:', { code: error.code ?? null })
    return { error: true }
  }
  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; retry_after?: number } | null
  if (!row) return { error: true }
  if (row.allowed) return { allowed: true }
  return { allowed: false, retryAfter: Math.max(1, Number(row.retry_after) || RATE_WINDOW_SECONDS) }
}
