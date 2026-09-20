import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { deleteWeeklyRange, updateWeeklyRange } from '@/lib/availability/weekly'
import { generateSlotsForTrainer } from '@/lib/availability/generate'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PUT /api/dashboard/availability/schedule/range/[id]   body: { start_time, end_time }
 * Cambia el horario de un rango existente y regenera los huecos.
 *
 * DELETE /api/dashboard/availability/schedule/range/[id]
 * Borra un rango horario de la plantilla y regenera los huecos (los que ya
 * tengan una reserva viva encima se quedan como están).
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const { id } = await context.params
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })

    const supabase = getSupabaseServerClient()
    const result = await updateWeeklyRange(supabase, trainer.id, id, body)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })

    const summary = await generateSlotsForTrainer(supabase, trainer.id)
    return NextResponse.json({ success: true, summary })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const { id } = await context.params
    const supabase = getSupabaseServerClient()
    const result = await deleteWeeklyRange(supabase, trainer.id, id)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })

    const summary = await generateSlotsForTrainer(supabase, trainer.id)
    return NextResponse.json({ success: true, summary })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
