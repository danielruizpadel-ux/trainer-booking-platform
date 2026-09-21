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
  /** Rango real de la clase dentro de su ventana (migración 007); null en reservas anteriores */
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
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

/** Columnas de las migraciones 004 y 007. Si aún no están aplicadas se piden sin ellas. */
const PROPOSAL_COLUMNS = 'proposal_token, rescheduled_from_id, start_time, end_time, duration_minutes, '

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
    // migrations/004 o 007 sin aplicar: la página sigue funcionando, sin
    // propuestas de nueva fecha ni rangos propios (se usa la hora de la ventana).
    console.warn('reservations: faltan columnas de las migraciones 004/007; se cargan sin ellas')
    ;({ data, error } = await fetchWith(BASE_COLUMNS))
  }

  if (error) {
    throw new Error(`No se pudieron cargar las reservas: ${error.message}`)
  }

  const rows = (data ?? []) as unknown as Array<
    Omit<TrainerReservation, 'slot' | 'proposal_token' | 'rescheduled_from_id' | 'start_time' | 'end_time' | 'duration_minutes'> & {
      proposal_token?: string | null
      rescheduled_from_id?: string | null
      start_time?: string | null
      end_time?: string | null
      duration_minutes?: number | null
      availability_slots: TrainerReservation['slot'] | TrainerReservation['slot'][]
    }
  >

  return rows
    .map(({ availability_slots, proposal_token, rescheduled_from_id, start_time, end_time, duration_minutes, ...row }) => ({
      ...row,
      start_time: start_time ?? null,
      end_time: end_time ?? null,
      duration_minutes: duration_minutes ?? null,
      proposal_token: proposal_token ?? null,
      rescheduled_from_id: rescheduled_from_id ?? null,
      // PostgREST devuelve objeto para una FK a-uno; el array es por si acaso.
      slot: Array.isArray(availability_slots) ? (availability_slots[0] ?? null) : availability_slots,
    }))
    .sort(bySessionAsc)
}

function bySessionAsc(a: TrainerReservation, b: TrainerReservation): number {
  const ka = `${a.slot?.session_date ?? '9999'} ${a.start_time ?? a.slot?.start_time ?? ''}`
  const kb = `${b.slot?.session_date ?? '9999'} ${b.start_time ?? b.slot?.start_time ?? ''}`
  return ka.localeCompare(kb)
}
