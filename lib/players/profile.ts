import type { SupabaseClient } from '@supabase/supabase-js'

/** Fila de `players` (migración 009). */
export interface Player {
  id: string
  auth_user_id: string
  email: string
  full_name: string | null
  phone: string | null
  whatsapp_opt_in: boolean
  onboarding_completed_at: string | null
  created_at: string
  updated_at: string
}

export const PLAYER_COLUMNS =
  'id, auth_user_id, email, full_name, phone, whatsapp_opt_in, onboarding_completed_at, created_at, updated_at'

/** Lo único que el jugador puede escribir de su perfil. El email sale de Auth. */
export interface PlayerProfileInput {
  full_name: string
  phone: string
  whatsapp_opt_in: boolean
}

const EDITABLE_FIELDS = ['full_name', 'phone', 'whatsapp_opt_in'] as const

export type ParseProfileResult =
  | { ok: true; profile: PlayerProfileInput }
  | { ok: false; status: number; message: string; field?: string }

export function isOnboarded(player: Pick<Player, 'onboarding_completed_at'>): boolean {
  return player.onboarding_completed_at !== null
}

/** Misma regla que el formulario de reserva (el checkout, components/booking/checkout): 10+ caracteres de dígitos, +, -, (, ). */
export function isValidPhone(value: string): boolean {
  const compact = value.replace(/\s/g, '')
  return /^[\d\-+()]{10,}$/.test(compact) && value.length <= 30
}

/**
 * Valida el cuerpo de onboarding / edición de perfil.
 *
 * Lista blanca estricta: cualquier otro campo (`email`, `auth_user_id`,
 * `onboarding_completed_at`…) es un 400 con su nombre, no se ignora en
 * silencio. Mismo criterio que PUT /api/trainers/[id].
 */
export function parsePlayerProfileInput(body: unknown): ParseProfileResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, message: 'Cuerpo de la petición no válido' }
  }

  const record = body as Record<string, unknown>
  const unknownField = Object.keys(record).find((key) => !(EDITABLE_FIELDS as readonly string[]).includes(key))
  if (unknownField) {
    return { ok: false, status: 400, message: `Campo no permitido: ${unknownField}`, field: unknownField }
  }

  const fullName = typeof record.full_name === 'string' ? record.full_name.trim().replace(/\s+/g, ' ') : ''
  if (fullName.length < 2 || fullName.length > 80) {
    return { ok: false, status: 400, message: 'Escribe tu nombre (entre 2 y 80 caracteres)', field: 'full_name' }
  }

  const phone = typeof record.phone === 'string' ? record.phone.trim() : ''
  if (!isValidPhone(phone)) {
    return { ok: false, status: 400, message: 'Teléfono no válido (mínimo 10 dígitos)', field: 'phone' }
  }

  if (record.whatsapp_opt_in !== undefined && typeof record.whatsapp_opt_in !== 'boolean') {
    return { ok: false, status: 400, message: 'whatsapp_opt_in tiene que ser true o false', field: 'whatsapp_opt_in' }
  }

  return {
    ok: true,
    profile: { full_name: fullName, phone, whatsapp_opt_in: record.whatsapp_opt_in === true },
  }
}

export type SaveProfileResult = { ok: true; player: Player } | { ok: false; status: number; message: string }

/**
 * Guarda el perfil del jugador. Con `completeOnboarding` marca además
 * `onboarding_completed_at` (solo la primera vez: si ya estaba, se respeta).
 *
 * `playerId` tiene que venir de la sesión (requirePlayer), nunca del cliente.
 */
export async function savePlayerProfile(
  supabase: SupabaseClient,
  player: Player,
  profile: PlayerProfileInput,
  { completeOnboarding }: { completeOnboarding: boolean }
): Promise<SaveProfileResult> {
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { ...profile, updated_at: now }
  if (completeOnboarding && !player.onboarding_completed_at) {
    update.onboarding_completed_at = now
  }

  const { data, error } = await supabase
    .from('players')
    .update(update)
    .eq('id', player.id)
    .select(PLAYER_COLUMNS)
    .single()

  if (error || !data) {
    // Detalle de Supabase solo en el log (código), nunca en la respuesta.
    console.error('No se pudo guardar el perfil del jugador:', { code: error?.code ?? null })
    return { ok: false, status: 500, message: 'No se pudo guardar el perfil. Inténtalo de nuevo.' }
  }
  return { ok: true, player: data as Player }
}
