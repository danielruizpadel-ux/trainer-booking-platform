import type { SupabaseClient } from '@supabase/supabase-js'
import { isValidTrainerSlug } from './entry'

export { isValidTrainerSlug }

/**
 * Relación jugador ↔ entrenador (`player_trainers`, migración 009).
 *
 * Una fila por pareja. Nunca se borra: se archiva. Se crea siempre desde el
 * servidor con la service role key, con el `playerId` sacado de la sesión.
 */

export type PlayerTrainerSource = 'self_signup' | 'booking' | 'trainer_added'
export type PlayerTrainerStatus = 'active' | 'archived'

export interface PlayerTrainerLink {
  trainer: { id: string; slug: string; name: string; image_url: string | null }
  status: PlayerTrainerStatus
  source: PlayerTrainerSource
  created_at: string
}

/**
 * Crea la relación si no existe. Si ya existe (activa o archivada) no la
 * toca: ON CONFLICT DO NOTHING, así que ni se duplica, ni cambia el `source`
 * original, ni se reactiva una archivada. Reactivar será una acción
 * explícita, no un efecto secundario de volver a entrar. Por eso el insert
 * no manda `status` (lo pone el default de la tabla, `active`, solo en filas nuevas).
 */
export async function linkPlayerToTrainer(
  supabase: SupabaseClient,
  playerId: string,
  trainerId: string,
  source: PlayerTrainerSource
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase
    .from('player_trainers')
    .upsert(
      { player_id: playerId, trainer_id: trainerId, source },
      { onConflict: 'player_id,trainer_id', ignoreDuplicates: true }
    )
  return error ? { ok: false, message: error.message } : { ok: true }
}

/**
 * Entrenador activo (`status` `active` o NULL en filas antiguas) por su slug
 * público, o null. Es lo que decide si un `?trainer=` es válido: sirve para
 * vincular y para construir la vuelta a su página (nunca una URL del cliente).
 */
export async function findActiveTrainerBySlug(
  supabase: SupabaseClient,
  slug: unknown
): Promise<{ ok: true; trainer: { id: string; slug: string; name: string } | null } | { ok: false; message: string }> {
  if (!isValidTrainerSlug(slug)) return { ok: true, trainer: null }

  const { data: trainer, error } = await supabase
    .from('trainers')
    .select('id, slug, name, status')
    .eq('slug', slug)
    .maybeSingle()
  if (error) return { ok: false, message: error.message }
  if (!trainer || (trainer.status && trainer.status !== 'active')) return { ok: true, trainer: null }
  return { ok: true, trainer: { id: trainer.id, slug: trainer.slug, name: trainer.name } }
}

/** Igual que linkPlayerToTrainer, a partir del slug público. Solo entrenadores activos. */
export async function linkPlayerToTrainerBySlug(
  supabase: SupabaseClient,
  playerId: string,
  slug: string,
  source: PlayerTrainerSource
): Promise<{ ok: true; trainerId: string } | { ok: false; message: string }> {
  if (!isValidTrainerSlug(slug)) return { ok: false, message: 'Entrenador no válido' }

  const found = await findActiveTrainerBySlug(supabase, slug)
  if (!found.ok) return found
  if (!found.trainer) return { ok: false, message: 'Entrenador no encontrado' }

  const linked = await linkPlayerToTrainer(supabase, playerId, found.trainer.id, source)
  return linked.ok ? { ok: true, trainerId: found.trainer.id } : linked
}

/** Entrenadores del jugador, del más reciente al más antiguo. */
export async function listPlayerTrainers(supabase: SupabaseClient, playerId: string): Promise<PlayerTrainerLink[]> {
  const { data, error } = await supabase
    .from('player_trainers')
    .select('status, source, created_at, trainer:trainers(id, slug, name, image_url)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('No se pudieron leer los entrenadores del jugador:', error.message)
    return []
  }

  return ((data ?? []) as unknown as PlayerTrainerLink[]).filter((row) => row.trainer !== null)
}
