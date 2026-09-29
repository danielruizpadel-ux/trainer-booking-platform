import type { SupabaseClient } from '@supabase/supabase-js'
import { CLASS_DURATIONS } from '@/lib/availability/durations'
import { PLAYER_COUNTS, basePriceFor, type SessionPriceRow } from './pricing'

/**
 * Precios VIGENTES de un entrenador (`trainer_session_prices`, migración 010):
 * duración × nº de jugadores → RM. Solo servidor, con la service role (la
 * tabla no tiene permisos de escritura para anon/authenticated).
 *
 * Lo cobrado NO se lee de aquí después: cada reserva guarda su snapshot en
 * reservations.price. Cambiar un precio no toca reservas ya hechas.
 *
 * Sin configuración, se falla claro: nunca se vuelve a un RM300 fijo.
 */

export const MAX_PRICE_RM = 100000

export type TrainerPricesResult = { ok: true; rows: SessionPriceRow[] } | { ok: false; message: string }

export async function loadTrainerPrices(supabase: SupabaseClient, trainerId: string): Promise<TrainerPricesResult> {
  const { data, error } = await supabase
    .from('trainer_session_prices')
    .select('duration_minutes, player_count, price_rm')
    .eq('trainer_id', trainerId)
  if (error) {
    // El detalle (p. ej. 42P01: falta la migración 010) solo va al log del
    // servidor; al cliente, un mensaje genérico.
    console.error('No se pudieron leer los precios del entrenador:', { code: error.code ?? null })
    return { ok: false, message: 'Could not load pricing.' }
  }
  return {
    ok: true,
    rows: (data ?? []).map((r) => ({
      duration_minutes: Number(r.duration_minutes),
      player_count: Number(r.player_count),
      price_rm: Number(r.price_rm),
    })),
  }
}

export type BasePriceResult =
  | { ok: true; price: number; rows: SessionPriceRow[] }
  | { ok: false; status: 409 | 500; message: string }

/**
 * Precio base de UNA combinación para cobrar. 409 si el entrenador no lo tiene
 * configurado (se arregla desde Perfil → Public pricing), 500 si falla la BD.
 */
export async function requireBasePrice(
  supabase: SupabaseClient,
  trainerId: string,
  durationMinutes: number,
  playerCount: number
): Promise<BasePriceResult> {
  const loaded = await loadTrainerPrices(supabase, trainerId)
  if (!loaded.ok) return { ok: false, status: 500, message: loaded.message }
  const price = basePriceFor(loaded.rows, durationMinutes, playerCount)
  if (price === null) {
    return {
      ok: false,
      status: 409,
      message: `Pricing is not configured for a ${durationMinutes}-minute class with ${playerCount} player${playerCount === 1 ? '' : 's'}.`,
    }
  }
  return { ok: true, price, rows: loaded.rows }
}

export type ParsePricesResult = { ok: true; rows: SessionPriceRow[] } | { ok: false; message: string }

/**
 * Valida la rejilla que manda el dashboard: todas las combinaciones de las
 * duraciones soportadas (60/90) × 1..4 jugadores, sin repetidas, con importes
 * > 0, ≤ 100 000 y como mucho 2 decimales. Todo o nada.
 */
export function parseTrainerPrices(input: unknown): ParsePricesResult {
  if (!Array.isArray(input)) return { ok: false, message: 'Faltan los precios' }

  const expected = CLASS_DURATIONS.flatMap((d) => PLAYER_COUNTS.map((p) => `${d}:${p}`))
  const seen = new Map<string, SessionPriceRow>()

  for (const item of input) {
    if (!item || typeof item !== 'object') return { ok: false, message: 'Precio no válido' }
    const record = item as Record<string, unknown>
    const unknownField = Object.keys(record).find((k) => !['duration_minutes', 'player_count', 'price_rm'].includes(k))
    if (unknownField) return { ok: false, message: `Campo no permitido: ${unknownField}` }

    const duration = Number(record.duration_minutes)
    const players = Number(record.player_count)
    const key = `${duration}:${players}`
    if (!expected.includes(key)) return { ok: false, message: `Combinación no válida: ${duration} min, ${players} jugadores` }
    if (seen.has(key)) return { ok: false, message: `Precio repetido: ${duration} min, ${players} jugadores` }

    const raw = typeof record.price_rm === 'string' ? record.price_rm.trim().replace(',', '.') : record.price_rm
    const price = typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN
    if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE_RM) {
      return { ok: false, message: `Precio no válido para ${duration} min, ${players} jugadores (entre RM 1 y RM ${MAX_PRICE_RM})` }
    }
    if (Math.round(price * 100) !== price * 100) {
      return { ok: false, message: `Como mucho 2 decimales (${duration} min, ${players} jugadores)` }
    }
    seen.set(key, { duration_minutes: duration, player_count: players, price_rm: price })
  }

  const missing = expected.find((k) => !seen.has(k))
  if (missing) {
    const [d, p] = missing.split(':')
    return { ok: false, message: `Falta el precio de ${d} min, ${p} jugadores` }
  }
  return { ok: true, rows: expected.map((k) => seen.get(k)!) }
}

/** Guarda la rejilla completa del entrenador de la sesión (trainerId de requireTrainer). */
export async function saveTrainerPrices(
  supabase: SupabaseClient,
  trainerId: string,
  rows: SessionPriceRow[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('trainer_session_prices')
    .upsert(
      rows.map((r) => ({ trainer_id: trainerId, ...r, updated_at: now })),
      { onConflict: 'trainer_id,duration_minutes,player_count' }
    )
  if (error) {
    console.error('No se pudieron guardar los precios:', { code: error.code ?? null })
    return { ok: false, message: 'Could not save pricing.' }
  }
  return { ok: true }
}
