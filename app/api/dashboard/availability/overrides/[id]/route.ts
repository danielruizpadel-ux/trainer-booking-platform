import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { deleteOverride } from '@/lib/availability/overrides'
import { generateSlotsForTrainer } from '@/lib/availability/generate'

type RouteContext = { params: Promise<{ id: string }> }

/** DELETE /api/dashboard/availability/overrides/[id] */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const { id } = await context.params
    const supabase = getSupabaseServerClient()
    const result = await deleteOverride(supabase, trainer.id, id)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })

    const summary = await generateSlotsForTrainer(supabase, trainer.id)
    return NextResponse.json({ success: true, summary })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
