import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { getTrainerDurations, setTrainerDurations } from '@/lib/availability/trainer-durations'
import { refreshAllWindows } from '@/lib/reservations/slots'
import { toDateStr } from '@/lib/dateUtils'

/**
 * GET   /api/dashboard/availability/durations            { durations: [60, 90] }
 * PATCH /api/dashboard/availability/durations { durations } guarda qué duraciones ofrece
 *       el entrenador (configuración global, migración 007) y recalcula el
 *       estado de todas sus ventanas futuras (la duración mínima cambia qué
 *       ventana cuenta como llena).
 */
export async function GET() {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer
    const durations = await getTrainerDurations(getSupabaseServerClient(), trainer.id)
    return NextResponse.json({ success: true, durations })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer
    const body = (await request.json().catch(() => null)) as { durations?: unknown } | null
    const supabase = getSupabaseServerClient()
    const result = await setTrainerDurations(supabase, trainer.id, body?.durations)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    const refreshed = await refreshAllWindows(supabase, trainer.id, toDateStr(new Date()))
    return NextResponse.json({ success: true, durations: result.durations, refreshedWindows: refreshed })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
