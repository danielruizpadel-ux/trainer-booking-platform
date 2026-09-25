import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { createSessionClient } from '@/lib/supabase/server'
import { PLAYER_COLUMNS, type Player } from '@/lib/players/profile'
import { bookingPlayerFromProfile, isAuthInfraError, type BookingPlayer } from '@/lib/players/booking-contact'

export type PlayerSession =
  | { user: null; player: null; error: null }
  | { user: User; player: Player; error: null }
  /** Hay sesión pero no se pudo leer/crear la fila (p. ej. migración 009 sin aplicar). */
  | { user: User; player: null; error: string }

const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01'])

function describeError(error: { code?: string; message: string }): string {
  if (error.code && MISSING_TABLE_CODES.has(error.code)) {
    return 'Falta aplicar migrations/009_players.sql en Supabase'
  }
  return error.message
}

/**
 * Única forma legítima de saber qué jugador está detrás de una petición
 * (el equivalente a getCurrentSession() de current-trainer.ts).
 *
 * Deriva el jugador de la sesión autenticada (cookie → auth.users.id →
 * players.auth_user_id). Ninguna ruta de /cuenta ni de /api/player acepta un
 * `player_id` del cliente.
 *
 * Si el usuario aún no tiene fila en `players` (primera entrada), la crea:
 * toda sesión de Supabase Auth puede ser jugador. Es idempotente
 * (auth_user_id es unique) y solo escribe cuando falta la fila o cuando el
 * email de Auth ha cambiado.
 *
 * Va con la service role key: `players` tiene RLS y solo lectura propia.
 * Envuelta en cache() para que layout + página no la repitan en la misma petición.
 */
export const getPlayerSession = cache(async (): Promise<PlayerSession> => {
  const session = await createSessionClient()
  const {
    data: { user },
  } = await session.auth.getUser()

  if (!user) {
    return { user: null, player: null, error: null }
  }

  const result = await ensurePlayerForUser(user)
  if (!result.ok) {
    console.error('No se pudo resolver el jugador de la sesión:', result.message)
    return { user, player: null, error: result.message }
  }
  return { user, player: result.player, error: null }
})

export async function ensurePlayerForUser(
  user: User
): Promise<{ ok: true; player: Player } | { ok: false; message: string }> {
  const admin = getSupabaseServerClient()
  const email = (user.email ?? '').trim().toLowerCase()

  const { data: existing, error: readError } = await admin
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (readError) return { ok: false, message: describeError(readError) }

  if (existing) {
    const player = existing as Player
    if (email && player.email !== email) {
      const { data: updated, error } = await admin
        .from('players')
        .update({ email, updated_at: new Date().toISOString() })
        .eq('id', player.id)
        .select(PLAYER_COLUMNS)
        .single()
      if (error) return { ok: false, message: describeError(error) }
      return { ok: true, player: updated as Player }
    }
    return { ok: true, player }
  }

  if (!email) {
    // Todos los métodos de entrada (enlace mágico, Google) traen email.
    return { ok: false, message: 'Tu cuenta no tiene email; no se puede crear el perfil de jugador' }
  }

  // Dos pestañas pueden llegar aquí a la vez: ignoreDuplicates convierte el
  // choque en un no-op y se vuelve a leer la fila que ganó.
  const { error: insertError } = await admin
    .from('players')
    .upsert({ auth_user_id: user.id, email }, { onConflict: 'auth_user_id', ignoreDuplicates: true })
  if (insertError) return { ok: false, message: describeError(insertError) }

  const { data: created, error: reread } = await admin
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('auth_user_id', user.id)
    .single()
  if (reread || !created) return { ok: false, message: reread ? describeError(reread) : 'No se pudo crear el jugador' }
  return { ok: true, player: created as Player }
}

/**
 * Para route handlers de /api/player: devuelve el jugador o una Response
 * 401/500 lista para devolver.
 *
 *   const player = await requirePlayer()
 *   if (player instanceof Response) return player
 */
export async function requirePlayer(): Promise<Player | Response> {
  const { user, player, error } = await getPlayerSession()

  if (!user) {
    return Response.json({ success: false, error: 'No autenticado' }, { status: 401 })
  }
  if (!player) {
    return Response.json({ success: false, error }, { status: 500 })
  }
  return player
}

export type BookingPlayerLookup =
  | { status: 'anonymous' }
  /** Fallo real de Supabase (Auth o `players`): ni "anónimo" ni "sin perfil". */
  | { status: 'error'; message: string }
  /** `player` null = aún sin fila; `bookingPlayer` null = perfil incompleto. */
  | { status: 'authenticated'; user: User; player: Player | null; bookingPlayer: BookingPlayer | null }

/**
 * Jugador listo para reservar con su cuenta, SOLO LECTURA: a diferencia de
 * getPlayerSession no crea la fila de `players` (lo usa la página pública del
 * entrenador, que visita cualquiera, también un entrenador con sesión).
 *
 * Distingue tres casos, que las rutas traducen a 401 / 409 / 5xx:
 *   - anonymous: no hay sesión válida (o ha caducado);
 *   - authenticated sin `bookingPlayer`: hay sesión pero falta el perfil;
 *   - error: Supabase ha fallado. No se hace pasar por "no autenticado".
 */
export async function findBookingPlayer(): Promise<BookingPlayerLookup> {
  const session = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser()

  if (!user) {
    if (isAuthInfraError(authError)) {
      console.error('No se pudo comprobar la sesión (Supabase Auth):', authError?.message)
      return { status: 'error', message: 'No se pudo comprobar tu sesión' }
    }
    return { status: 'anonymous' }
  }

  const { data, error } = await getSupabaseServerClient()
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (error) {
    console.error('No se pudo leer el jugador de la sesión:', describeError(error))
    return { status: 'error', message: 'No se pudo cargar tu cuenta de jugador' }
  }

  const player = (data as Player | null) ?? null
  return {
    status: 'authenticated',
    user,
    player,
    bookingPlayer: player ? bookingPlayerFromProfile(player, user.email) : null,
  }
}
