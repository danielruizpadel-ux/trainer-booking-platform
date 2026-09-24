import { getSupabaseServerClient } from '@/lib/supabase/client'
import { calculateBookingPrice } from '@/lib/reservations/pricing'
import { RESERVATION_STATUS } from '@/lib/reservations/status'
import { findBookableWindow, loadOpenWindows } from '@/lib/availability/booking'
import { getTrainerDurations } from '@/lib/availability/trainer-durations'
import { isClassDuration } from '@/lib/availability/durations'
import { addMinutes } from '@/lib/availability/windows'
import { OVERLAP_MESSAGE, isOverlapError, refreshWindowStatus } from '@/lib/reservations/slots'

interface Session {
  date: string
  time: string
}

interface ReservationRequest {
  trainer_id: string
  sessions: Session[]
  /** 60 o 90; por defecto la primera que ofrece el entrenador. Misma para todas las sesiones. */
  duration_minutes?: number
  client_name: string
  client_email: string
  client_phone: string
  client_whatsapp_opt_in: boolean
}

/** "17:00", "17:00:00" y "17:00:00+08" son la misma hora. */
function normalizeTime(value: unknown): string {
  return String(value ?? '').trim().slice(0, 5)
}

export async function POST(request: Request) {
  try {
    const body: ReservationRequest = await request.json()

    const { trainer_id, sessions, client_name, client_email, client_phone, client_whatsapp_opt_in } = body

    // Validations
    if (!trainer_id || !sessions || sessions.length === 0) {
      return Response.json({ success: false, error: 'Datos incompletos' }, { status: 400 })
    }

    if (!client_name || !client_email || !client_phone) {
      return Response.json({ success: false, error: 'Información de contacto incompleta' }, { status: 400 })
    }

    // El mismo cliente que usa GET /api/availability. Antes esta ruta usaba la
    // anon key: con RLS activo veía menos filas que el calendario, y por eso
    // rechazaba huecos que el calendario sí mostraba.
    const supabase = getSupabaseServerClient()

    // Convert trainer_id to UUID if it's a slug
    let trainerId = trainer_id
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (!uuidRegex.test(trainer_id)) {
      // It's a slug, fetch the UUID
      const { data: trainerData, error: trainerError } = await supabase
        .from('trainers')
        .select('id')
        .eq('slug', trainer_id)
        .single()

      if (trainerError || !trainerData) {
        return Response.json({ success: false, error: 'Entrenador no encontrado' }, { status: 404 })
      }

      trainerId = trainerData.id
    }

    // Duración: una de las que ofrece el entrenador (migración 007).
    const offered = await getTrainerDurations(supabase, trainerId)
    const duration = body.duration_minutes === undefined ? offered[0] : Number(body.duration_minutes)
    if (!isClassDuration(duration) || !offered.includes(duration)) {
      return Response.json(
        { success: false, error: 'Esa duración no está disponible para este entrenador' },
        { status: 400 }
      )
    }

    // Localizar la ventana de cada sesión: la hora pedida tiene que ser un
    // inicio reservable (rejilla + sin solapar reservas vivas), con EXACTAMENTE
    // el mismo cálculo que GET /api/availability (lib/availability/booking.ts).
    // Las reservas vivas cuentan pending_confirmation y confirmed: dos clientes
    // no pueden coger la misma franja mientras la primera sigue pendiente.
    const dates = [...new Set(sessions.map((s) => s.date))].sort()
    let windows
    try {
      windows = await loadOpenWindows(supabase, trainerId, dates[0], dates[dates.length - 1])
    } catch (error) {
      console.error('Error buscando ventanas:', error)
      return Response.json(
        { success: false, error: 'No se pudo comprobar la disponibilidad' },
        { status: 500 }
      )
    }

    const picked: Array<{ windowId: string; start: string; end: string }> = []
    const seen = new Set<string>()

    for (const session of sessions) {
      const wanted = normalizeTime(session.time)
      const key = `${session.date} ${wanted}`
      if (seen.has(key)) {
        return Response.json(
          { success: false, error: `La sesión ${key} está repetida` },
          { status: 400 }
        )
      }
      seen.add(key)

      const found = findBookableWindow(windows, session.date, wanted, duration, offered)
      if (!found) {
        const anyWindow = windows.some((w) => w.window.session_date === session.date)
        return Response.json(
          {
            success: false,
            error: anyWindow
              ? `Acaban de reservar ${session.date} a las ${wanted}. Elige otra hora.`
              : `Ese horario ya no existe: ${session.date} ${session.time}`,
          },
          { status: anyWindow ? 409 : 404 }
        )
      }

      const end = addMinutes(wanted, duration)
      picked.push({ windowId: found.window.id, start: wanted, end })
      // Dentro de esta misma petición, la sesión ya ocupa su franja.
      found.taken.push({ id: `pending-${key}`, start_time: wanted, end_time: end })
    }

    // Create reservations (one per session)
    //
    // Columnas reales de `reservations` (comprobadas contra el proyecto):
    // id, trainer_id, availability_slot_id, client_name, client_email,
    // client_phone, price, status, notes, created_at, updated_at.
    //
    // NO existe `client_whatsapp_opt_in`: enviarlo hacia que PostgREST
    // rechazase el insert entero. La preferencia de WhatsApp se guarda en
    // `notes`, que si existe, para no perder el dato.
    //
    // El precio se calcula AQUÍ (lib/reservations/pricing.ts), nunca se acepta
    // del navegador: 300 RM/h (×1,5 para 1 h 30) con el descuento por volumen.
    // Cada fila guarda el precio de su sesión ya con descuento.
    //
    // Nace en `pending_confirmation`: el entrenador tiene que conseguir pista
    // antes de confirmar (migrations/003_reservation_confirmation_flow.sql).
    // La reserva ocupa [start_time, end_time) dentro de su ventana (007).
    const price = calculateBookingPrice(sessions.length, duration)
    const reservationIds: string[] = []
    const reservationsToInsert = picked.map((p) => ({
      trainer_id: trainerId,
      availability_slot_id: p.windowId,
      client_name,
      client_email,
      client_phone,
      start_time: p.start,
      end_time: p.end,
      duration_minutes: duration,
      price: price.discountedPricePerSession,
      status: RESERVATION_STATUS.PENDING_CONFIRMATION,
      notes: `WhatsApp: ${client_whatsapp_opt_in ? 'si' : 'no'}`,
      created_at: new Date().toISOString(),
    }))

    const { data: reservations, error: insertError } = await supabase
      .from('reservations')
      .insert(reservationsToInsert)
      .select('id')

    // Otra petición se quedó la franja entre la comprobación de arriba y este
    // insert: lo rechaza la restricción de la 008. El insert es uno solo, así
    // que no se ha creado ninguna de las sesiones.
    if (isOverlapError(insertError)) {
      return Response.json({ success: false, error: OVERLAP_MESSAGE }, { status: 409 })
    }

    if (insertError || !reservations) {
      console.error('❌ Error creating reservations:', insertError)
      return Response.json(
        {
          success: false,
          error: 'Error al crear reservas',
          detail: insertError?.message ?? null,
        },
        { status: 500 }
      )
    }

    reservations.forEach((res) => {
      reservationIds.push(res.id)
    })

    console.log(`✅ Created ${reservationIds.length} reservations:`, reservationIds)

    // Recalcular el estado de cada ventana tocada (contador y `full` si ya no
    // cabe nada). No es crítico: la disponibilidad se calcula por solapamiento.
    for (const windowId of new Set(picked.map((p) => p.windowId))) {
      await refreshWindowStatus(supabase, windowId, offered)
    }

    return Response.json({
      success: true,
      message:
        'Solicitud recibida. Te confirmamos por email en cuanto reservemos la pista.',
      status: RESERVATION_STATUS.PENDING_CONFIRMATION,
      reservationIds,
      count: sessions.length,
      durationMinutes: duration,
      total: price.total,
      discountPercent: price.discountPercent,
    })
  } catch (error) {
    console.error('❌ Reservations API error:', error)
    return Response.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
