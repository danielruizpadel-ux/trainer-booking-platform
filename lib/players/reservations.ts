import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Reservas de UN jugador para su cuenta (/cuenta).
 *
 * SEGURIDAD: el `playerId` tiene que salir de la sesión en servidor
 * (getPlayerSession() de lib/auth/current-player.ts), nunca de una prop, de la
 * URL ni del body. Se consulta con la service role (se salta RLS), así que
 * este filtro por `player_id` es lo único que impide leer filas de otra
 * cuenta. Por eso quien lo llama (components/player/PlayerReservationsCard)
 * no acepta el id como argumento ni es una Server Action.
 *
 * Solo columnas que la cuenta pinta: nada de datos de contacto, notas
 * internas ni token de propuesta.
 *
 * `price` es el valor ACTUAL de reservations.price de esa fila (el entrenador
 * lo puede editar o dejar en NULL desde el dashboard). Se enseña tal cual:
 * nunca se reconstruye con el precio vigente del entrenador, y no dice nada
 * de descuento, total del checkout ni pago (no están guardados).
 */

export const PLAYER_RESERVATION_COLUMNS =
  'id, status, start_time, end_time, duration_minutes, price, availability_slots ( session_date, start_time, end_time ), trainers ( name, slug )'

type Slot = { session_date: string; start_time: string; end_time: string }
type Trainer = { name: string; slug: string }

export interface PlayerReservationRow {
  id: string
  status: string | null
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  /** numeric de Postgres: PostgREST puede devolverlo como número o como texto. */
  price: number | string | null
  availability_slots: Slot | Slot[] | null
  trainers: Trainer | Trainer[] | null
}

export type PlayerReservationsResult =
  | { ok: true; rows: PlayerReservationRow[] }
  | { ok: false }

export async function listPlayerReservations(
  supabase: SupabaseClient,
  playerId: string
): Promise<PlayerReservationsResult> {
  const { data, error } = await supabase
    .from('reservations')
    .select(PLAYER_RESERVATION_COLUMNS)
    .eq('player_id', playerId)
    .order('start_time', { ascending: true })

  if (error) return { ok: false }
  return { ok: true, rows: (data ?? []) as unknown as PlayerReservationRow[] }
}
