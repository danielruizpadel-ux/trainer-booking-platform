import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { setDayEnabled } from '@/lib/availability/weekly'
import { syncWindows } from '@/lib/availability/sync-response'

type RouteContext = { params: Promise<{ day: string }> }

/**
 * PATCH /api/dashboard/availability/schedule/day/[day]   body: { enabled: boolean }
 * Enciende/apaga un día entero de la plantilla y regenera los huecos.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const { day } = await context.params
    const dayOfWeek = Number(day)
    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null
    if (typeof body?.enabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'enabled (boolean) es obligatorio' }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()
    const result = await setDayEnabled(supabase, trainer.id, dayOfWeek, body.enabled)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })

    const sync = await syncWindows(supabase, trainer.id, true)
    if (!sync.ok) return sync.response
    const summary = sync.summary
    return NextResponse.json({ success: true, summary })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
