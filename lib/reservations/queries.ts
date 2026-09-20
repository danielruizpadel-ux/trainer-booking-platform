import { getSupabaseServerClient } from '@/lib/supabase/client'

/** Una reserva con su hueco, tal y como la pinta el dashboard. */
export interface TrainerReservation {
  id: string
  status: string | null
  client_name: string
  client_email: string
  client_phone: string | null
  notes: string | null
  price: number | null
  created_at: string
  /** Solo en reschedule_proposed: token del enlace público (migración 004) */
  proposal_token: string | null
  /** Reserva original si esta es una propuesta de nueva fecha */
  rescheduled_from_id: string | null
  slot: {
    id: string
    session_date: string
    start_time: string
    end_time: string
    class_type: string
  } | null
}

/**
 * Reservas de UN entrenador. El `trainerId` viene siempre de la sesión
 * (lib/auth/current-trainer.ts), nunca del cliente.
 *
 * Con la service role key porque `reservations` tiene RLS y la clave anon no
 * devuelve filas (docs/DATABASE.md). El embed `availability_slots(...)`
 * funciona por la FK `reservations.availability_slot_id`.
 */
const BASE_COLUMNS =
  'id, status, client_name, client_email, client_phone, notes, price, created_at, ' +
  'availability_slots ( id, session_date, start_time, end_time, class_type )'

/** Columnas de la migración 004. Si aún no está aplicada se piden sin ellas. */
const PROPOSAL_COLUMNS = 'proposal_token, rescheduled_from_id, '

export async function listTrainerReservations(trainerId: string): Promise<TrainerReservation[]> {
  const supabase = getSupabaseServerClient()

  const fetchWith = (columns: string) =>
    supabase
      .from('reservations')
      .select(columns)
      .eq('trainer_id', trainerId)
      .order('created_at', { ascending: false })

  let { data, error } = await fetchWith(PROPOSAL_COLUMNS + BASE_COLUMNS)

  if (error?.code === '42703') {
    // migrations/004_reschedule_proposals.sql sin aplicar: la página sigue
    // funcionando, pero sin propuestas de nueva fecha.
    console.warn('reservations: faltan las columnas de la migración 004; se cargan sin ellas')
    ;({ data, error } = await fetchWith(BASE_COLUMNS))
  }

  if (error) {
    throw new Error(`No se pudieron cargar las reservas: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as Array<
    Omit<TrainerReservation, 'slot' | 'proposal_token' | 'rescheduled_from_id'> & {
      proposal_token?: string | null
      rescheduled_from_id?: string | null
      availability_slots: TrainerReservation['slot'] | TrainerReservation['slot'][]
    }
  >

  return rows
    .map(({ availability_slots, proposal_token, rescheduled_from_id, ...row }) => ({
      ...row,
      proposal_token: proposal_token ?? null,
      rescheduled_from_id: rescheduled_from_id ?? null,
      // PostgREST devuelve objeto para una FK a-uno; el array es por si acaso.
      slot: Array.isArray(availability_slots) ? (availability_slots[0] ?? null) : availability_slots,
    }))
    .sort(bySessionAsc)
}

function bySessionAsc(a: TrainerReservation, b: TrainerReservation): number {
  const ka = `${a.slot?.session_date ?? '9999'} ${a.slot?.start_time ?? ''}`
  const kb = `${b.slot?.session_date ?? '9999'} ${b.slot?.start_time ?? ''}`
  return ka.localeCompare(kb)
}
