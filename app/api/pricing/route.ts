import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { getTrainerDurations } from '@/lib/availability/trainer-durations'
import { loadTrainerPrices } from '@/lib/reservations/trainer-prices'
import { SESSION_DISCOUNTS } from '@/lib/reservations/pricing'

/**
 * GET /api/pricing?trainer_id=<uuid|slug>
 *
 * Público, solo lectura: la tabla VIGENTE del entrenador para las duraciones
 * que ofrece, para que el checkout enseñe precios. Es solo una vista previa:
 * lo que se cobra lo recalcula POST /api/reservations en el servidor.
 *
 *   { success, durations: [60, 90], prices: [{ duration_minutes, player_count, price_rm }], discounts }
 *
 * Siempre en vivo (no se cachea): si el entrenador cambia un precio, el
 * checkout lo ve al momento.
 */
export async function GET(request: NextRequest) {
  try {
    const trainerParam = request.nextUrl.searchParams.get('trainer_id') ?? ''
    if (!trainerParam) return NextResponse.json({ success: false, error: 'Missing trainer_id' }, { status: 400 })

    const supabase = getSupabaseServerClient()
    let trainerId = trainerParam
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trainerParam)) {
      if (!/^[a-z0-9-]{1,64}$/.test(trainerParam)) return NextResponse.json({ success: false, error: 'Coach not found' }, { status: 404 })
      const { data } = await supabase.from('trainers').select('id').eq('slug', trainerParam).maybeSingle()
      if (!data) return NextResponse.json({ success: false, error: 'Coach not found' }, { status: 404 })
      trainerId = data.id
    }

    const durations = await getTrainerDurations(supabase, trainerId)
    const loaded = await loadTrainerPrices(supabase, trainerId)
    if (!loaded.ok) return NextResponse.json({ success: false, error: 'Pricing is unavailable right now' }, { status: 500 })

    return NextResponse.json(
      {
        success: true,
        durations,
        prices: loaded.rows.filter((r) => (durations as number[]).includes(r.duration_minutes)),
        discounts: SESSION_DISCOUNTS,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('GET /api/pricing:', error instanceof Error ? error.message : 'error desconocido')
    return NextResponse.json({ success: false, error: 'Pricing is unavailable right now' }, { status: 500 })
  }
}
