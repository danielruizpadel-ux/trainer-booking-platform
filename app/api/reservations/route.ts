import { getSupabaseServerClient } from '@/lib/supabase/client'
import { findBookingPlayer } from '@/lib/auth/current-player'
import { bookingContactFromPlayer } from '@/lib/players/booking-contact'
import { linkPlayerToTrainer } from '@/lib/players/trainers'
import { calculateBookingPrice, isPlayerCount } from '@/lib/reservations/pricing'
import { requireBasePrice } from '@/lib/reservations/trainer-prices'
import { parseClientMessage } from '@/lib/reservations/client-message'
import { RESERVATION_STATUS } from '@/lib/reservations/status'
import { findBookableWindow, loadOpenWindows } from '@/lib/availability/booking'
import { getTrainerDurations } from '@/lib/availability/trainer-durations'
import { isClassDuration } from '@/lib/availability/durations'
import { addMinutes, findSelectionOverlap } from '@/lib/availability/windows'
import { isOverlapError, refreshWindowStatus } from '@/lib/reservations/slots'
import { isPastMalaysiaSession } from '@/lib/dateUtils'

/**
 * POST /api/reservations — checkout público (widget de reserva).
 *
 * El SERVIDOR decide todo lo que importa; del navegador solo se aceptan la
 * selección y, para invitados, sus datos de contacto:
 *
 *   identidad      as_player → sesión (Auth → players); invitado → NULL.
 *                  Un player_id en el body se ignora siempre.
 *   entrenador     trainer_id (uuid o slug) resuelto aquí.
 *   duración       una de las que ofrece el entrenador.
 *   disponibilidad mismo cálculo que GET /api/availability + restricción 008.
 *   jugadores      player_count 1..4 (por defecto 1), igual en todas las filas.
 *   precio         trainer_session_prices × descuento por nº de sesiones
 *                  (lib/reservations/pricing.ts). Un `price`/`total` del body
 *                  se ignora. Sin precio configurado → 409, nunca un RM300 fijo.
 *   WhatsApp       con cuenta, el del perfil; invitado, su casilla.
 *   mensaje        client_message validado (≤ 500); nunca en logs.
 *
 * Los mensajes de error van en inglés: los enseña el checkout público.
 */

interface Session {
  date: string
  time: string
}

interface ReservationRequest {
  trainer_id?: unknown
  sessions?: unknown
  /** 60 o 90; por defecto la primera que ofrece el entrenador. Misma para todas las sesiones. */
  duration_minutes?: unknown
  /** 1..4, misma para todas las sesiones. Por defecto 1. */
  player_count?: unknown
  client_message?: unknown
  client_name?: unknown
  client_email?: unknown
  client_phone?: unknown
  client_whatsapp_opt_in?: unknown
  /**
   * Reserva con la cuenta de jugador: el contacto sale de la SESIÓN (perfil +
   * email de Auth) y los client_* del body se ignoran. Nunca se acepta un
   * player_id del navegador.
   */
  as_player?: unknown
}

/** Tope de sesiones por checkout (abuso básico; el widget no llega). */
const MAX_SESSIONS = 20

const OVERLAP_MESSAGE_EN = 'That time was just booked by someone else. Please choose another time.'

/** "17:00", "17:00:00" y "17:00:00+08" son la misma hora. */
function normalizeTime(value: unknown): string {
  return String(value ?? '').trim().slice(0, 5)
}

function bad(error: string, status = 400) {
  return Response.json({ success: false, error }, { status })
}

function parseSessions(value: unknown): Session[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SESSIONS) return null
  const sessions: Session[] = []
  for (const s of value) {
    if (!s || typeof s !== 'object') return null
    const { date, time } = s as { date?: unknown; time?: unknown }
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof time !== 'string') return null
    sessions.push({ date, time })
  }
  return sessions
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as ReservationRequest | null
    if (!body || typeof body !== 'object') return bad('Invalid request')

    const trainerParam = typeof body.trainer_id === 'string' ? body.trainer_id : ''
    const sessions = parseSessions(body.sessions)
    if (!trainerParam || !sessions) return bad('Choose at least one session (up to 20).')

    const playerCount = body.player_count === undefined ? 1 : body.player_count
    if (!isPlayerCount(playerCount)) return bad('Number of players must be between 1 and 4.')

    const message = parseClientMessage(body.client_message)
    if (!message.ok) return bad(message.message)

    // Identidad y contacto. Con cuenta, TODO sale de la sesión.
    let client_name = typeof body.client_name === 'string' ? body.client_name.trim() : ''
    let client_email = typeof body.client_email === 'string' ? body.client_email.trim() : ''
    let client_phone = typeof body.client_phone === 'string' ? body.client_phone.trim() : ''
    let whatsappOptIn = body.client_whatsapp_opt_in === true
    let playerId: string | null = null

    if (body.as_player === true) {
      const lookup = await findBookingPlayer()
      if (lookup.status === 'error') {
        // Supabase ha fallado: ni "no autenticado" ni "sin perfil".
        return bad("We couldn't load your player account. Please try again.", 503)
      }
      if (lookup.status === 'anonymous') {
        return bad('Your session has expired. Sign in again or book as a guest.', 401)
      }
      if (!lookup.player || !lookup.bookingPlayer) {
        return bad('Complete your player profile before booking with your account.', 409)
      }
      const contact = bookingContactFromPlayer(lookup.bookingPlayer)
      client_name = contact.client_name
      client_email = contact.client_email
      client_phone = contact.client_phone
      whatsappOptIn = contact.client_whatsapp_opt_in
      playerId = lookup.player.id
    }

    if (!client_name || !client_email || !client_phone) {
      return bad('Name, email and phone are required.')
    }

    const supabase = getSupabaseServerClient()

    // trainer_id puede venir como uuid o como slug.
    let trainerId = trainerParam
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trainerParam)) {
      const { data: trainerData, error: trainerError } = await supabase
        .from('trainers')
        .select('id')
        .eq('slug', trainerParam)
        .single()
      if (trainerError || !trainerData) return bad('Coach not found.', 404)
      trainerId = trainerData.id
    }

    // Duración: una de las que ofrece el entrenador (migración 007).
    const offered = await getTrainerDurations(supabase, trainerId)
    const duration = body.duration_minutes === undefined ? offered[0] : Number(body.duration_minutes)
    if (!isClassDuration(duration) || !offered.includes(duration)) {
      return bad('That session length is not available with this coach.')
    }

    // Las sesiones de la MISMA petición no pueden pisarse entre sí (12:00 y
    // 12:30 de 60 min). Se rechaza antes de tocar la base: nada de reservas
    // parciales. Luego siguen el cálculo de ventanas y la restricción 008.
    const clash = findSelectionOverlap(
      sessions.map((s) => ({ date: s.date, time: normalizeTime(s.time) })),
      duration
    )
    if (clash) {
      const [a, b] = clash
      if (normalizeTime(a.time) === normalizeTime(b.time)) {
        return bad(`The session on ${a.date} ${normalizeTime(a.time)} is selected twice.`)
      }
      return bad(
        `The sessions on ${a.date} at ${normalizeTime(a.time)} and ${normalizeTime(b.time)} overlap. Choose times at least ${duration} minutes apart.`
      )
    }

    // Precio vigente del entrenador para esta duración y nº de jugadores.
    const base = await requireBasePrice(supabase, trainerId, duration, playerCount)
    if (!base.ok) {
      return bad(base.status === 409 ? "This coach hasn't set a price for this session yet." : 'Pricing is unavailable right now.', base.status)
    }
    const price = calculateBookingPrice(sessions.length, base.price, { durationMinutes: duration, playerCount })

    // Localizar la ventana de cada sesión: la hora pedida tiene que ser un
    // inicio reservable (rejilla + sin solapar reservas vivas), con EXACTAMENTE
    // el mismo cálculo que GET /api/availability (lib/availability/booking.ts).
    const dates = [...new Set(sessions.map((s) => s.date))].sort()
    let windows
    try {
      windows = await loadOpenWindows(supabase, trainerId, dates[0], dates[dates.length - 1])
    } catch (error) {
      console.error('Error buscando ventanas:', error instanceof Error ? error.message : 'error desconocido')
      return bad("We couldn't check availability. Please try again.", 500)
    }

    const picked: Array<{ windowId: string; start: string; end: string }> = []
    const seen = new Set<string>()

    for (const session of sessions) {
      const wanted = normalizeTime(session.time)
      const key = `${session.date} ${wanted}`
      if (isPastMalaysiaSession(session.date, wanted)) return bad('Choose a future date and time.')
      if (seen.has(key)) return bad(`The session on ${key} is selected twice.`)
      seen.add(key)

      const found = findBookableWindow(windows, session.date, wanted, duration, offered)
      if (!found) {
        const anyWindow = windows.some((w) => w.window.session_date === session.date)
        return bad(
          anyWindow
            ? `${session.date} at ${wanted} was just booked. Please choose another time.`
            : `${session.date} at ${wanted} is no longer available.`,
          anyWindow ? 409 : 404
        )
      }

      const end = addMinutes(wanted, duration)
      picked.push({ windowId: found.window.id, start: wanted, end })
      // Dentro de esta misma petición, la sesión ya ocupa su franja.
      found.taken.push({ id: `pending-${key}`, start_time: wanted, end_time: end })
    }

    // Una fila por sesión. Cada una lleva su snapshot de precio (ya con el
    // descuento del checkout) y los mismos datos del checkout: jugadores,
    // mensaje, WhatsApp e identidad. `notes` queda para las notas internas
    // del entrenador: ya no se escribe "WhatsApp: si/no" ahí (migración 010).
    // Nace en `pending_confirmation` (migración 003).
    const createdAt = new Date().toISOString()
    const reservationsToInsert = picked.map((p) => ({
      trainer_id: trainerId,
      availability_slot_id: p.windowId,
      player_id: playerId,
      client_name,
      client_email,
      client_phone,
      whatsapp_opt_in: whatsappOptIn,
      client_message: message.value,
      player_count: playerCount,
      start_time: p.start,
      end_time: p.end,
      duration_minutes: duration,
      price: price.discountedPricePerSession,
      status: RESERVATION_STATUS.PENDING_CONFIRMATION,
      created_at: createdAt,
    }))

    const { data: reservations, error: insertError } = await supabase
      .from('reservations')
      .insert(reservationsToInsert)
      .select('id')

    // Otra petición se quedó la franja entre la comprobación de arriba y este
    // insert: lo rechaza la restricción de la 008. El insert es uno solo, así
    // que no se ha creado ninguna de las sesiones.
    if (isOverlapError(insertError)) {
      console.warn('Reserva rechazada por solapamiento (23P01 reservations_no_overlap):', {
        trainerId,
        sessions: picked.map((p) => `${p.windowId} ${p.start}-${p.end}`),
      })
      return bad(OVERLAP_MESSAGE_EN, 409)
    }

    if (insertError || !reservations) {
      // Solo code + message: `details` puede traer la fila entera ("Failing
      // row contains …") con el contacto y el mensaje del cliente.
      console.error('Error creando reservas:', { code: insertError?.code ?? null, message: insertError?.message ?? 'sin filas' })
      return bad("We couldn't create your booking. Please try again.", 500)
    }

    const reservationIds = reservations.map((res) => res.id as string)

    // Reserva con cuenta: queda la relación jugador ↔ entrenador (source
    // `booking`). Idempotente y sin reactivar archivadas; si falla, la
    // reserva ya está hecha y no se deshace.
    if (playerId) {
      const linked = await linkPlayerToTrainer(supabase, playerId, trainerId, 'booking')
      if (!linked.ok) console.warn('No se pudo vincular jugador y entrenador tras reservar:', linked.message)
    }

    console.log(`Reservas creadas: ${reservationIds.length}`)

    // Recalcular el estado de cada ventana tocada (contador y `full` si ya no
    // cabe nada). No es crítico: la disponibilidad se calcula por solapamiento.
    for (const windowId of new Set(picked.map((p) => p.windowId))) {
      await refreshWindowStatus(supabase, windowId, offered)
    }

    return Response.json({
      success: true,
      message: "Booking request received. Your coach will review it and confirm once the court is booked.",
      status: RESERVATION_STATUS.PENDING_CONFIRMATION,
      reservationIds,
      count: sessions.length,
      durationMinutes: duration,
      playerCount,
      pricePerSession: price.pricePerSession,
      discountedPricePerSession: price.discountedPricePerSession,
      total: price.total,
      discountPercent: price.discountPercent,
    })
  } catch (error) {
    console.error('Reservations API error:', error instanceof Error ? error.message : 'error desconocido')
    return bad('Something went wrong. Please try again.', 500)
  }
}
