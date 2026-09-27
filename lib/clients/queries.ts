import { getSupabaseServerClient } from '@/lib/supabase/client'

export type ClientKind = 'player' | 'guest'

export interface TrainerClient {
  /** Stable identity: player id for accounts, reservation id for guests. */
  id: string
  kind: ClientKind
  name: string
  email: string | null
  phone: string | null
  reservationsCount: number
  lastReservationDate: string | null
  lastReservationStatus: string | null
}

type ReservationRow = {
  id: string
  player_id: string | null
  client_name: string
  client_email: string
  client_phone: string | null
  status: string | null
  start_time: string | null
  created_at: string
  availability_slots: { session_date: string; start_time: string } | { session_date: string; start_time: string }[] | null
}

type PlayerRow = {
  id: string
  full_name: string | null
  email: string
  phone: string | null
}

function slotOf(row: ReservationRow) {
  return Array.isArray(row.availability_slots) ? row.availability_slots[0] ?? null : row.availability_slots
}

function reservationDate(row: ReservationRow): string {
  return slotOf(row)?.session_date ?? row.created_at.slice(0, 10)
}

/**
 * Builds the trainer's client list from that trainer's reservations only.
 *
 * Account-backed bookings are grouped exclusively by player_id. Guest
 * bookings have no durable identity, so each reservation remains its own
 * guest contact; names and emails are deliberately never used as a join key.
 */
export async function listTrainerClients(trainerId: string): Promise<TrainerClient[]> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reservations')
    .select(
      'id, player_id, client_name, client_email, client_phone, status, start_time, created_at, availability_slots ( session_date, start_time )'
    )
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`No se pudieron cargar los clientes: ${error.message}`)

  const reservations = (data ?? []) as unknown as ReservationRow[]
  const playerIds = [...new Set(reservations.flatMap((row) => (row.player_id ? [row.player_id] : [])))]
  const playersById = new Map<string, PlayerRow>()

  if (playerIds.length > 0) {
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, full_name, email, phone')
      .in('id', playerIds)

    if (playersError) throw new Error(`No se pudieron cargar los perfiles de jugadores: ${playersError.message}`)
    for (const player of (players ?? []) as unknown as PlayerRow[]) playersById.set(player.id, player)
  }

  const clients = new Map<string, TrainerClient>()

  for (const row of reservations) {
    const date = reservationDate(row)

    if (!row.player_id) {
      clients.set(`guest:${row.id}`, {
        id: row.id,
        kind: 'guest',
        name: row.client_name,
        email: row.client_email || null,
        phone: row.client_phone,
        reservationsCount: 1,
        lastReservationDate: date,
        lastReservationStatus: row.status,
      })
      continue
    }

    const player = playersById.get(row.player_id)
    const existing = clients.get(`player:${row.player_id}`)
    if (existing) {
      existing.reservationsCount += 1
      continue
    }

    clients.set(`player:${row.player_id}`, {
      id: row.player_id,
      kind: 'player',
      name: player?.full_name || row.client_name,
      email: player?.email || row.client_email || null,
      phone: player?.phone || row.client_phone,
      reservationsCount: 1,
      lastReservationDate: date,
      lastReservationStatus: row.status,
    })
  }

  return [...clients.values()].sort((a, b) => {
    const dateOrder = (b.lastReservationDate ?? '').localeCompare(a.lastReservationDate ?? '')
    return dateOrder || a.name.localeCompare(b.name, 'es')
  })
}
