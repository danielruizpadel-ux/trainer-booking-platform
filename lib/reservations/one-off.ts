import { getSupabaseServerClient } from '@/lib/supabase/client'
import { getTrainerDurations } from '@/lib/availability/trainer-durations'
import { isSlotOpen } from '@/lib/availability/slot-status'
import { fitsInWindow, type TimeRange } from '@/lib/availability/windows'
import { RESERVATION_STATUS, SLOT_STATUS } from './status'
import { calculateBookingPrice } from './pricing'
import { requireBasePrice } from './trainer-prices'
import { parseDetails, type ReservationDetailsInput } from './edit'
import { createManualReservation, type ManualResult } from './manual'
import { OVERLAP_MESSAGE, WINDOW_SELECT, isSlotConflictError, toLoadedWindow, type WindowReservation, type WindowRow } from './slots'
import { checkOneOffRange } from './one-off-rules'
import { isDatabaseErrorCode } from '@/lib/supabase/error-codes'

/**
 * Clase puntual: el entrenador reserva un tramo para un cliente aunque esté
 * fuera de su disponibilidad habitual. Es de una sola vez: no abre
 * disponibilidad pública ni cambia el horario semanal.
 *
 * Por qué hace falta una ventana: `reservations.availability_slot_id` es NOT
 * NULL y `reservations.session_date` (la que usa `reservations_no_overlap`,
 * migración 008) la rellena un trigger desde la ventana. Sin ventana no hay
 * fecha ni protección de la base. Sin columnas ni tablas nuevas; solo la
 * función de la migración 012:
 *
 *   1. Si el tramo cabe entero en una ventana ABIERTA del entrenador, es una
 *      reserva manual normal en esa ventana (createManualReservation, que lo
 *      vuelve a validar todo).
 *   2. Si no, la función `create_one_off_reservation` (migrations/012) crea
 *      —o reutiliza, si es manual y `blocked`— una ventana del tamaño EXACTO
 *      de la clase con `status = 'blocked'` y `generated_by_pattern = false`,
 *      y la reserva dentro, en UNA transacción serializada por entrenador y
 *      día. Si algo falla, no queda nada: no hay limpieza que pueda fallar
 *      ni ventana recién creada que otra petición pueda coger a medias.
 *        - `blocked` es cerrada para isSlotOpen: GET /api/availability y
 *          POST /api/reservations nunca ofrecen ni aceptan nada ahí.
 *        - `refreshWindowStatus` no toca ventanas `blocked`.
 *        - El generador del horario semanal nunca toca filas con
 *          `generated_by_pattern = false`.
 *      Sin la 012 aplicada, 503 (no hay camino alternativo no atómico).
 *
 * Validación (servidor, siempre): entrenador de la sesión (lo pasa la ruta,
 * nunca el body), duración ofrecida, rejilla de 30 min, mismo día, no pasado
 * en Kuala Lumpur, a un año vista como mucho, sin pisar reservas vivas de
 * CUALQUIER ventana ese día, y la base como red final (23P01 → 409).
 * Precio, estado y datos del checkout: igual que la reserva manual.
 */

export interface OneOffReservationInput extends ReservationDetailsInput {
  session_date?: unknown
  start_time?: unknown
  duration_minutes?: unknown
  confirmed?: unknown
}

export type OneOffResult =
  | (Extract<ManualResult, { ok: true }> & { placement: 'window' | 'one_off' })
  | Extract<ManualResult, { ok: false }>

type DayRow = WindowRow & { generated_by_pattern: boolean | null; reservations: WindowReservation[] | null }

export async function createOneOffReservation(trainerId: string, input: OneOffReservationInput, now: Date = new Date()): Promise<OneOffResult> {
  const date = typeof input.session_date === 'string' ? input.session_date : ''
  const startTime = typeof input.start_time === 'string' ? input.start_time : ''
  const duration = Number(input.duration_minutes)
  if (!date || !startTime || !Number.isFinite(duration)) {
    return { ok: false, status: 400, message: 'session_date, start_time y duration_minutes son obligatorios' }
  }

  const parsed = parseDetails({
    client_name: input.client_name ?? '',
    client_email: input.client_email ?? '',
    client_phone: input.client_phone,
    notes: input.notes,
  })
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message }

  const supabase = getSupabaseServerClient()
  const offered = await getTrainerDurations(supabase, trainerId)
  const basic = checkOneOffRange({ session_date: date, start_time: startTime, duration_minutes: duration }, offered, null, now)
  if (!basic.ok) return { ok: false, status: 400, message: basic.message }

  // Todas las filas del entrenador ese día. Falla cerrado: sin saber qué hay
  // ocupado no se crea nada.
  const { data, error } = await supabase
    .from('availability_slots')
    .select(`generated_by_pattern, ${WINDOW_SELECT}`)
    .eq('trainer_id', trainerId)
    .eq('session_date', date)
  if (error || !data) return { ok: false, status: 500, message: 'No se pudo comprobar la disponibilidad' }
  const rows = data as unknown as DayRow[]
  const loaded = rows.map((row) => ({ row, ...toLoadedWindow(row) }))
  const taken: TimeRange[] = loaded.flatMap((l) => l.taken)

  const check = checkOneOffRange({ session_date: date, start_time: startTime, duration_minutes: duration }, offered, taken, now)
  if (!check.ok) return { ok: false, status: check.issue === 'overlap' ? 409 : 400, message: check.message }
  const range = check.range

  const base = await requireBasePrice(supabase, trainerId, duration, 1)
  if (!base.ok) {
    return {
      ok: false,
      status: base.status,
      message: base.status === 409 ? `No tienes precio para una clase de ${duration} min (1 jugador). Configúralo en Perfil → Public pricing.` : base.message,
    }
  }

  // 1. Dentro de una ventana abierta: reserva manual normal.
  const host = loaded.find((l) => l.window.trainer_id === trainerId && isSlotOpen(l.window) && fitsInWindow(l.window, taken, range))
  if (host) {
    const manual = await createManualReservation(trainerId, {
      slot_id: host.window.id,
      start_time: range.start_time,
      duration_minutes: duration,
      client_name: input.client_name,
      client_email: input.client_email,
      client_phone: input.client_phone,
      notes: input.notes,
      confirmed: input.confirmed,
    })
    return manual.ok ? { ...manual, placement: 'window' } : manual
  }

  // 2. Fuera de la disponibilidad: ventana propia, exacta y cerrada, y la
  //    reserva dentro, en UNA transacción (migrations/012). Aviso rápido si
  //    ya hay otra ventana con ese rango; la función lo vuelve a decidir con
  //    la fila bloqueada.
  const exact = loaded.find((l) => l.window.start_time.slice(0, 5) === range.start_time && l.window.end_time.slice(0, 5) === range.end_time)
  if (exact && (exact.row.generated_by_pattern !== false || (exact.window.status ?? '').toLowerCase() !== SLOT_STATUS.BLOCKED)) {
    return { ok: false, status: 409, message: WINDOW_CONFLICT_MESSAGE }
  }

  const confirmed = input.confirmed === true
  const status = confirmed ? RESERVATION_STATUS.CONFIRMED : RESERVATION_STATUS.PENDING_CONFIRMATION
  let rpcResult: { data: unknown; error: DbError | null }
  try {
    rpcResult = await supabase.rpc(ONE_OFF_FUNCTION, {
      p_trainer_id: trainerId,
      p_session_date: date,
      p_start_time: range.start_time,
      p_end_time: range.end_time,
      p_duration_minutes: duration,
      p_client_name: parsed.updates.client_name,
      p_client_email: parsed.updates.client_email,
      p_client_phone: parsed.updates.client_phone ?? null,
      p_notes: parsed.updates.notes ?? null,
      p_price: calculateBookingPrice(1, base.price, { durationMinutes: duration }).discountedPricePerSession,
      p_status: status,
    })
  } catch {
    // La llamada salió y no hubo respuesta: la clase pudo crearse o no.
    return oneOffError({ message: 'rpc_threw' })
  }
  const { data: created, error: rpcError } = rpcResult
  if (rpcError) return oneOffError(rpcError)
  const row = (Array.isArray(created) ? created[0] : created) as { reservation_id?: string } | null
  if (!row?.reservation_id) {
    console.error('create_one_off_reservation no devolvió la reserva')
    return { ok: false, status: 500, message: 'No se pudo crear la reserva' }
  }
  return { ok: true, id: row.reservation_id, status, placement: 'one_off' }
}

export const ONE_OFF_FUNCTION = 'create_one_off_reservation'
export const ONE_OFF_UNKNOWN_MESSAGE =
  'No hemos podido confirmar si la clase se ha creado (se perdió la respuesta). Revisa el calendario antes de volver a intentarlo.'
const WINDOW_CONFLICT_MESSAGE = 'Ya hay una ventana con ese mismo horario ese día. Elige otro tramo.'

type DbError = { code?: string; message?: string; details?: string | null }

/**
 * Errores de la función (ver cabecera de migrations/012). La transacción ya
 * se ha deshecho entera: no hay ventana ni reserva que limpiar.
 */
export function oneOffError(error: DbError): Extract<OneOffResult, { ok: false }> {
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  if (isSlotConflictError(error)) return { ok: false, status: 409, message: OVERLAP_MESSAGE }
  if (text.includes('one_off_window_conflict')) return { ok: false, status: 409, message: WINDOW_CONFLICT_MESSAGE }
  if (error.code === '22023' && text.includes('one_off_invalid')) return { ok: false, status: 400, message: 'Tramo no válido' }
  // PGRST202: PostgREST no conoce la función (012 sin aplicar o caché sin
  // recargar); 42883: Postgres no la encuentra. Falla cerrado, sin atajos no
  // atómicos.
  if (error.code === 'PGRST202' || error.code === '42883') {
    console.error('Falta la migración 012 (create_one_off_reservation)')
    return { ok: false, status: 503, message: 'Las clases puntuales aún no están activadas (falta la migración 012).' }
  }
  // Sin código de la base: se perdió la respuesta después de mandar la
  // escritura. No se dice que no se creó: puede que sí.
  if (!isDatabaseErrorCode(error.code)) {
    console.error('create_one_off_reservation sin respuesta de la base:', { message: error.message ?? null })
    return { ok: false, status: 500, message: ONE_OFF_UNKNOWN_MESSAGE }
  }
  console.error('create_one_off_reservation falló:', { code: error.code ?? null })
  return { ok: false, status: 500, message: 'No se pudo crear la reserva' }
}
