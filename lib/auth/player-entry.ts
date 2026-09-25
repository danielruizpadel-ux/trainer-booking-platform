import type { User } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { ensurePlayerForUser } from '@/lib/auth/current-player'
import { playerDestination } from '@/lib/players/entry'
import { findActiveTrainerBySlug, linkPlayerToTrainer } from '@/lib/players/trainers'

/**
 * Último paso de toda entrada a /cuenta con un usuario ya autenticado
 * (callback del login y /cuenta/auth/vincular). Devuelve la ruta interna a
 * la que redirigir.
 *
 *   1. Crea la fila de `players` si falta (ensurePlayerForUser).
 *   2. Resuelve `trainerSlug` contra la base de datos (solo entrenadores
 *      activos). Si `linkTrainer`, crea la relación con source `self_signup`
 *      (idempotente, no reactiva archivadas). El player_id sale de la
 *      sesión, nunca de la petición. Un fallo aquí no impide entrar.
 *   3. Destino (playerDestination): sin onboarding → bienvenida conservando
 *      el entrenador; con entrenador → de vuelta a su reserva; si no, `next`.
 */
export async function finishPlayerEntry(
  user: User,
  {
    trainerSlug,
    draftId = null,
    next = '/cuenta',
    linkTrainer,
  }: { trainerSlug: string | null; draftId?: string | null; next?: string; linkTrainer: boolean }
): Promise<string> {
  const ensured = await ensurePlayerForUser(user)
  if (!ensured.ok) {
    // La sesión ya está abierta; /cuenta enseñará el error con más contexto.
    console.error('No se pudo crear el jugador tras entrar:', ensured.message)
    return '/cuenta'
  }

  const supabase = getSupabaseServerClient()
  const found = await findActiveTrainerBySlug(supabase, trainerSlug)
  if (!found.ok) console.warn(`No se pudo comprobar el entrenador "${trainerSlug}":`, found.message)
  const trainer = found.ok ? found.trainer : null

  if (trainer && linkTrainer) {
    const linked = await linkPlayerToTrainer(supabase, ensured.player.id, trainer.id, 'self_signup')
    if (!linked.ok) console.warn(`No se pudo vincular al entrenador "${trainer.slug}":`, linked.message)
  }

  return playerDestination(ensured.player.onboarding_completed_at, { next, trainerSlug: trainer?.slug ?? null, draftId })
}
