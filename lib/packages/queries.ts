import { getSupabaseServerClient } from '@/lib/supabase/client'
import {
  sessionHoldsCredit,
  type ClientPackage,
  type ClientPackageSummary,
  type PackageDetail,
  type PackageSessionReservation,
  type PackageSessionStatus,
} from './status'

export * from './status'

/**
 * Lecturas de paquetes. `trainerId` viene siempre de la sesión
 * (lib/auth/current-trainer.ts). Service role: las tablas tienen RLS sin
 * políticas propias (migración 006), igual que trainer_weekly_hours.
 */

const PACKAGE_COLUMNS =
  'id, trainer_id, client_name, client_email, client_phone, sessions_total, price_per_session_normal, ' +
  'discount_percent, price_per_session_discounted, price_total, duration_minutes, status, notes, created_at, updated_at'

// `reservations!reservation_id`: desde la 019 hay dos relaciones entre
// package_sessions y reservations (package_sessions.reservation_id y
// reservations.package_session_id). La pista elige la primera, la reserva
// enlazada al crédito; sin ella PostgREST responde PGRST201. Funciona igual
// antes y después de la migración (scripts/verify-package-credit-postgrest.sh).
export async function listTrainerPackages(trainerId: string): Promise<ClientPackageSummary[]> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('client_packages')
    .select(`${PACKAGE_COLUMNS}, package_sessions ( status, reservations!reservation_id ( status ) )`)
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar los paquetes: ${error.message}`)

  const rows = (data ?? []) as unknown as Array<
    ClientPackage & { package_sessions: Array<{ status: PackageSessionStatus; reservations: { status: string | null } | null }> | null }
  >
  return rows.map(({ package_sessions, ...pkg }) => ({
    ...pkg,
    sessions_scheduled: (package_sessions ?? []).filter((s) =>
      sessionHoldsCredit({ status: s.status, reservation: s.reservations ? ({ status: s.reservations.status } as PackageSessionReservation) : null })
    ).length,
  }))
}

export async function getPackageDetail(trainerId: string, packageId: string): Promise<PackageDetail | null> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('client_packages')
    .select(
      `${PACKAGE_COLUMNS}, package_sessions ( id, session_number, status, reservation_id, ` +
        'reservations!reservation_id ( id, status, price, client_name, client_email, client_phone, notes, created_at, start_time, end_time, duration_minutes, player_count, client_message, whatsapp_opt_in, ' +
        'availability_slots ( id, session_date, start_time, end_time, class_type ) ) )'
    )
    .eq('id', packageId)
    .eq('trainer_id', trainerId)
    .order('session_number', { referencedTable: 'package_sessions', ascending: true })
    .maybeSingle()
  if (error) throw new Error(`No se pudo cargar el paquete: ${error.message}`)
  if (!data) return null

  const row = data as unknown as ClientPackage & {
    package_sessions: Array<{
      id: string
      session_number: number
      status: PackageSessionStatus
      reservation_id: string | null
      reservations:
        | (Omit<PackageSessionReservation, 'slot'> & { availability_slots: PackageSessionReservation['slot'] })
        | null
    }> | null
  }
  const { package_sessions, ...pkg } = row
  return {
    ...pkg,
    sessions: (package_sessions ?? [])
      .map((s) => ({
        id: s.id,
        session_number: s.session_number,
        status: s.status,
        reservation_id: s.reservation_id,
        reservation: s.reservations
          ? (({ availability_slots, ...rest }) => ({ ...rest, slot: availability_slots ?? null }))(s.reservations)
          : null,
      }))
      .sort((a, b) => a.session_number - b.session_number),
  }
}
