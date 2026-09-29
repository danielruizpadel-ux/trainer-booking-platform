import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { addWeeklyRange } from '@/lib/availability/weekly'
import { syncWindows } from '@/lib/availability/sync-response'

/**
 * POST /api/dashboard/availability/schedule/range
 *   body: { day_of_week, start_time, end_time, class_type }
 * Añade un rango horario a un día de la plantilla y regenera los huecos.
 */
export async function POST(request: Request) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })

    const supabase = getSupabaseServerClient()
    const result = await addWeeklyRange(supabase, trainer.id, body)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })

    const sync = await syncWindows(supabase, trainer.id, true)
    if (!sync.ok) return sync.response
    const summary = sync.summary
    return NextResponse.json({ success: true, id: result.id, summary })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
