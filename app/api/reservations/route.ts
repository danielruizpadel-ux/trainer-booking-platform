import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

    // Get availability slots for all sessions
    const availabilitySlots: any[] = []
    const slotIds: string[] = []

    for (const session of sessions) {
      const { data: slots, error: slotsError } = await supabase
        .from('availability_slots')
        .select('id')
        .eq('trainer_id', trainerId)
        .eq('session_date', session.date)
        .eq('start_time', session.time)
        .single()

      if (slotsError || !slots) {
        console.error(`❌ Slot not found for ${session.date} at ${session.time}`)
        return Response.json(
          { success: false, error: `Slot no disponible para ${session.date} ${session.time}` },
          { status: 404 }
        )
      }

      slotIds.push(slots.id)
    }

    // Create reservations (one per session)
    const reservationIds: string[] = []
    const reservationsToInsert = sessions.map((session, index) => ({
      trainer_id: trainerId,
      availability_slot_id: slotIds[index],
      client_name,
      client_email,
      client_phone,
      client_whatsapp_opt_in,
      status: 'pending',
      created_at: new Date().toISOString(),
    }))

    const { data: reservations, error: insertError } = await supabase
      .from('reservations')
      .insert(reservationsToInsert)
      .select('id')

    if (insertError || !reservations) {
      console.error('❌ Error creating reservations:', insertError)
      return Response.json(
        { success: false, error: 'Error al crear reservas' },
        { status: 500 }
      )
    }

    reservations.forEach((res) => {
      reservationIds.push(res.id)
    })

    console.log(`✅ Created ${reservationIds.length} reservations:`, reservationIds)

    return Response.json({
      success: true,
      message: `Reserva confirmada con ${sessions.length} sesión${sessions.length !== 1 ? 'es' : ''}`,
      reservationIds,
      count: sessions.length,
    })
  } catch (error) {
    console.error('❌ Reservations API error:', error)
    return Response.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
