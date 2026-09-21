import { getSupabaseServerClient } from '@/lib/supabase/client'
import { NextRequest, NextResponse } from 'next/server'
import { bookableSlotsFor, loadOpenWindows } from '@/lib/availability/booking'
import { getTrainerDurations } from '@/lib/availability/trainer-durations'
import { isClassDuration } from '@/lib/availability/durations'

/**
 * GET /api/availability?trainer_id=<uuid|slug>&date=YYYY-MM-DD | start_date&end_date [&duration=60|90]
 *
 * Público: lo usa el widget de reserva. Devuelve un pseudo-hueco por cada
 * INICIO reservable (id = ventana, start_time/end_time = la clase), calculado
 * al vuelo: ventanas abiertas menos reservas vivas, en la rejilla del
 * entrenador (lib/availability/booking.ts). Mismo cálculo que
 * POST /api/reservations, para que nunca diverjan.
 *
 * `duration` tiene que ser una de las que ofrece el entrenador; por defecto,
 * la primera. La respuesta incluye `durations` (las ofrecidas) y `duration`.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    let trainerId = searchParams.get('trainer_id')
    const date = searchParams.get('date')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    if (!trainerId || (!date && (!startDate || !endDate))) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: trainer_id and (date OR start_date+end_date)' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseServerClient()

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trainerId)
    if (!isUUID) {
      const { data: trainerData, error: trainerError } = await supabase
        .from('trainers')
        .select('id')
        .eq('slug', trainerId)
        .single()
      if (trainerError || !trainerData) {
        return NextResponse.json({ success: false, error: 'Trainer not found' }, { status: 404 })
      }
      trainerId = trainerData.id
    }

    const offered = await getTrainerDurations(supabase, trainerId!)
    const requested = searchParams.get('duration')
    const duration = requested === null ? offered[0] : Number(requested)
    if (!isClassDuration(duration) || !offered.includes(duration)) {
      return NextResponse.json(
        { success: false, error: 'Esa duración no está disponible para este entrenador', durations: offered },
        { status: 400 }
      )
    }

    const windows = await loadOpenWindows(supabase, trainerId!, date ?? startDate!, date ?? endDate!)
    const slots = bookableSlotsFor(windows, duration, offered)

    return NextResponse.json({ success: true, data: slots, durations: offered, duration })
  } catch (error) {
    console.error('Availability API error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
