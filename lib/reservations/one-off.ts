import { getSupabaseServerClient } from '@/lib/supabase/client'
import { getTrainerDurations } from '@/lib/availability/trainer-durations'
import { isSlotOpen } from '@/lib/availability/slot-status'
import { fitsInWindow, type TimeRange } from '@/lib/availability/windows'
import { RESERVATION_STATUS, SLOT_STATUS } from './status'
import { calculateBookingPrice } from './pricing'
import { requireBasePrice } from './trainer-prices'
import { parseDetails, type ReservationDetailsInput } from './edit'
import { createManualReservation, type ManualResult } from './manual'
import { OVERLAP_MESSAGE, WINDOW_SELECT, isOverlapError, toLoadedWindow, type WindowReservation, type WindowRow } from './slots'
import { checkOneOffRange } from './one-off-rules'

/**
 * Clase puntual: el entrenador reserva un tramo para un cliente aunque esté
 * fuera de su disponibilidad habitual. Es de una sola vez: no abre
 * disponibilidad pública ni cambia el horario semanal.
 *
 * Por qué hace falta una ventana: `reservations.availability_slot_id` es NOT
 * NULL y `reservations.session_date` (la que usa `reservations_no_overlap`,
 * migración 008) la rellena un trigger desde la ventana. Sin ventana no hay
 * fecha ni protección de la base. No se ha tocado el esquema:
 *
 *   1. Si el tramo cabe entero en una ventana ABIERTA del entrenador, es una
 *      reserva manual normal en esa ventana (createManualReservation, que lo
 *      vuelve a validar todo).
 *   2. Si no, se crea una ventana propia del tamaño EXACTO de la clase con
 *      `status = 'blocked'` y `generated_by_pattern = false`, y la reserva
 *      dentro:
 *        - `blocked` es cerrada para isSlotOpen: GET /api/availability y
 *          POST /api/reservations nunca ofrecen ni aceptan nada ahí.
 *        - `refreshWindowStatus` no toca ventanas `blocked` (no la reabre al
 *          cancelar la reserva).
 *        - El generador del horario semanal nunca toca filas con
 *          `generated_by_pattern = false` (ni las borra ni las reabre).
 *      Aunque se reabriera, su rango es exactamente el de la clase: no le
 *      sobraría tiempo libre mientras la reserva siga viva.
 *      Si la reserva no se puede insertar (solape en la base, error), la
 *      ventana recién creada se borra.
 *   Si ya hay una fila con ese rango exacto ese día (restricción única
 *   trainer + fecha + inicio + fin), solo se reutiliza si es una ventana
 *   manual `blocked` (p. ej. la de una clase puntual cancelada); si no, 409.
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

  // 2. Fuera de la disponibilidad: ventana propia, exacta y cerrada.
  const exact = loaded.find((l) => l.window.start_time.slice(0, 5) === range.start_time && l.window.end_time.slice(0, 5) === range.end_time)
  let windowId: string
  let createdWindow = false
  if (exact) {
    if (exact.row.generated_by_pattern !== false || (exact.window.status ?? '').toLowerCase() !== SLOT_STATUS.BLOCKED) {
      return { ok: false, status: 409, message: 'Ya hay una ventana con ese mismo horario ese día. Elige otro tramo.' }
    }
    windowId = exact.window.id
  } else {
    const { data: created, error: windowError } = await supabase
      .from('availability_slots')
      .insert({
        trainer_id: trainerId,
        session_date: date,
        start_time: range.start_time,
        end_time: range.end_time,
        class_type: 'private',
        status: SLOT_STATUS.BLOCKED,
        current_bookings: 1,
        max_capacity: 1,
        generated_by_pattern: false,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    // 23505: otra petición acaba de crear esa misma fila (restricción única).
    if (windowError?.code === '23505') return { ok: false, status: 409, message: OVERLAP_MESSAGE }
    if (windowError || !created) return { ok: false, status: 500, message: windowError?.message ?? 'No se pudo crear la clase' }
    windowId = created.id
    createdWindow = true
  }

  const confirmed = input.confirmed === true
  const status = confirmed ? RESERVATION_STATUS.CONFIRMED : RESERVATION_STATUS.PENDING_CONFIRMATION
  const { data: reservation, error: insertError } = await supabase
    .from('reservations')
    .insert({
      trainer_id: trainerId,
      availability_slot_id: windowId,
      ...parsed.updates,
      start_time: range.start_time,
      end_time: range.end_time,
      duration_minutes: duration,
      price: calculateBookingPrice(1, base.price, { durationMinutes: duration }).discountedPricePerSession,
      player_count: 1,
      whatsapp_opt_in: false,
      status,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !reservation) {
    // Sin reserva, la ventana creada para ella sobra (y está cerrada: no se
    // ofrecía a nadie). Solo se borra la que se creó en esta petición.
    if (createdWindow) {
      const { error: cleanupError } = await supabase.from('availability_slots').delete().eq('id', windowId).eq('trainer_id', trainerId)
      if (cleanupError) console.warn('No se pudo borrar la ventana de una clase puntual fallida:', cleanupError.message)
    }
    if (isOverlapError(insertError)) return { ok: false, status: 409, message: OVERLAP_MESSAGE }
    return { ok: false, status: 500, message: insertError?.message ?? 'No se pudo crear la reserva' }
  }

  if (!createdWindow) {
    const { error: countError } = await supabase
      .from('availability_slots')
      .update({ current_bookings: 1, updated_at: new Date().toISOString() })
      .eq('id', windowId)
    if (countError) console.warn('No se pudo actualizar el contador de la clase puntual:', countError.message)
  }

  return { ok: true, id: reservation.id, status, placement: 'one_off' }
}
