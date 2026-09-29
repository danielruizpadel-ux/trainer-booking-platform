import { getSupabaseServerClient } from '@/lib/supabase/client'
import { parseDetails, type ReservationDetailsInput } from '@/lib/reservations/edit'
import { isPackageSize, packagePriceQuote } from './pricing'
import { getTrainerDurations } from '@/lib/availability/trainer-durations'
import { requireBasePrice } from '@/lib/reservations/trainer-prices'

/**
 * Venta de un paquete: fila en client_packages con el precio como foto fija
 * del momento (misma regla que el widget) + N filas not_scheduled en
 * package_sessions. Si las sesiones fallan, se borra el paquete para no
 * dejarlo a medias.
 */
export interface CreatePackageInput extends ReservationDetailsInput {
  sessions_total?: unknown
  /** 60 o 90; por defecto la primera duración que ofrece el entrenador */
  duration_minutes?: unknown
}

export type CreatePackageResult = { ok: true; id: string } | { ok: false; status: number; message: string }

export async function createClientPackage(trainerId: string, input: CreatePackageInput): Promise<CreatePackageResult> {
  if (!isPackageSize(input.sessions_total)) {
    return { ok: false, status: 400, message: 'El paquete es de 5 o de 10 clases' }
  }
  const size = Number(input.sessions_total) as 5 | 10

  const parsed = parseDetails({
    client_name: input.client_name ?? '',
    client_email: input.client_email ?? '',
    client_phone: input.client_phone,
    notes: input.notes,
  })
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message }

  const supabase = getSupabaseServerClient()
  const offered = await getTrainerDurations(supabase, trainerId)
  const duration = input.duration_minutes === undefined ? offered[0] : Number(input.duration_minutes)
  if (!offered.includes(duration as 60 | 90)) {
    return { ok: false, status: 400, message: 'Esa duración no está entre las que ofreces' }
  }
  // Precio de 1 jugador de esa duración en la tabla del entrenador.
  const base = await requireBasePrice(supabase, trainerId, duration, 1)
  if (!base.ok) {
    return {
      ok: false,
      status: base.status,
      message: base.status === 409 ? `No tienes precio para una clase de ${duration} min (1 jugador). Configúralo en Perfil → Public pricing.` : base.message,
    }
  }
  const quote = packagePriceQuote(size, base.price, duration)

  const { data: pkg, error: pkgError } = await supabase
    .from('client_packages')
    .insert({
      trainer_id: trainerId,
      ...parsed.updates,
      sessions_total: size,
      price_per_session_normal: quote.pricePerSession,
      discount_percent: quote.discountPercent,
      price_per_session_discounted: quote.discountedPricePerSession,
      price_total: quote.total,
      duration_minutes: duration,
      status: 'active',
    })
    .select('id')
    .single()
  if (pkgError || !pkg) {
    const missing = pkgError?.code === 'PGRST205' || /client_packages/.test(pkgError?.message ?? '')
    return {
      ok: false,
      status: 500,
      message: missing ? 'Falta aplicar migrations/006_class_packages.sql en Supabase' : pkgError?.message ?? 'No se pudo crear el paquete',
    }
  }

  const sessions = Array.from({ length: size }, (_, i) => ({
    client_package_id: pkg.id,
    session_number: i + 1,
    status: 'not_scheduled',
  }))
  const { error: sessionsError } = await supabase.from('package_sessions').insert(sessions)
  if (sessionsError) {
    await supabase.from('client_packages').delete().eq('id', pkg.id)
    return { ok: false, status: 500, message: `No se pudieron crear las sesiones: ${sessionsError.message}` }
  }

  return { ok: true, id: pkg.id }
}
