import { getSupabaseServerClient } from '@/lib/supabase/client'
import { isSlotOpen, reservationHoldsSlot } from '@/lib/availability/slot-status'
import { calculateBookingPrice } from '@/lib/reservations/pricing'
import { RESERVATION_STATUS, SLOT_STATUS } from '@/lib/reservations/status'

interface Session {
  date: string
  time: string
}

interface ReservationRequest {
  trainer_id: string
  sessions: Session[]
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

    // Localizar el hueco de cada sesión
    const slotIds: string[] = []

    for (const session of sessions) {
      // Sin .single(): la tabla permite varios huecos a la misma hora con
      // distinto class_type, y .single() reventaba en ese caso dando un
      // "no disponible" que en realidad era "hay más de uno".
      const { data: candidates, error: slotsError } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('trainer_id', trainerId)
        .eq('session_date', session.date)

      if (slotsError) {
        console.error('Error buscando huecos:', slotsError)
        return Response.json(
          { success: false, error: 'No se pudo comprobar la disponibilidad' },
          { status: 500 }
        )
      }

      const wanted = normalizeTime(session.time)
      const sameTime = (candidates || []).filter((slot) => normalizeTime(slot.start_time) === wanted)

      if (sameTime.length === 0) {
        return Response.json(
          { success: false, error: `Ese horario ya no existe: ${session.date} ${session.time}` },
          { status: 404 }
        )
      }

      const openSlot = sameTime.find(isSlotOpen)

      if (!openSlot) {
        return Response.json(
          {
            success: false,
            error: `Acaban de reservar ${session.date} a las ${wanted}. Elige otra hora.`,
          },
          { status: 409 }
        )
      }

      // ¿Alguien tiene ya una reserva viva sobre este hueco?
      const { data: existing, error: existingError } = await supabase
        .from('reservations')
        .select('id, status')
        .eq('availability_slot_id', openSlot.id)

      if (existingError) {
        console.warn('No se pudieron comprobar las reservas existentes:', existingError.message)
      } else if ((existing || []).some((reservation) => reservationHoldsSlot(reservation.status))) {
        return Response.json(
          {
            success: false,
            error: `Acaban de reservar ${session.date} a las ${wanted}. Elige otra hora.`,
          },
          { status: 409 }
        )
      }

      slotIds.push(openSlot.id)
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
    // del navegador. Cada fila guarda el precio de su sesión ya con descuento.
    //
    // Nace en `pending_confirmation`: el entrenador tiene que conseguir pista
    // antes de confirmar (migrations/003_reservation_confirmation_flow.sql).
    const price = calculateBookingPrice(sessions.length)
    const reservationIds: string[] = []
    const reservationsToInsert = sessions.map((_session, index) => ({
      trainer_id: trainerId,
      availability_slot_id: slotIds[index],
      client_name,
      client_email,
      client_phone,
      price: price.discountedPricePerSession,
      status: RESERVATION_STATUS.PENDING_CONFIRMATION,
      notes: `WhatsApp: ${client_whatsapp_opt_in ? 'si' : 'no'}`,
      created_at: new Date().toISOString(),
    }))

    const { data: reservations, error: insertError } = await supabase
      .from('reservations')
      .insert(reservationsToInsert)
      .select('id')

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

    // Marcar los huecos como `pending`: hay una reserva sin confirmar encima y
    // isSlotOpen() los deja de ofrecer. Pasan a `full` cuando el entrenador
    // confirma, o vuelven a `available` si no consigue pista
    // (lib/reservations/confirmation.ts). No es critico (GET /api/availability
    // tambien cruza con `reservations`), por eso un fallo aqui se registra pero
    // no tumba la reserva, que ya esta creada.
    try {
      const { data: bookedSlots, error: readError } = await supabase
        .from('availability_slots')
        .select('id, current_bookings')
        .in('id', slotIds)

      if (readError) throw readError

      for (const slot of bookedSlots || []) {
        const { error: updateError } = await supabase
          .from('availability_slots')
          .update({ current_bookings: (slot.current_bookings ?? 0) + 1, status: SLOT_STATUS.PENDING })
          .eq('id', slot.id)

        if (updateError) throw updateError
      }
    } catch (slotUpdateError) {
      console.warn('No se pudo marcar el hueco como pendiente:', slotUpdateError)
    }

    return Response.json({
      success: true,
      message:
        'Solicitud recibida. Te confirmamos por email en cuanto reservemos la pista.',
      status: RESERVATION_STATUS.PENDING_CONFIRMATION,
      reservationIds,
      count: sessions.length,
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
