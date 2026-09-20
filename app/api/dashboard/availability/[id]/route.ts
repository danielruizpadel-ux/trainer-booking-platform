import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { deleteSlot } from '@/lib/availability/manage'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * DELETE /api/dashboard/availability/[id]
 *
 * Cierra un hueco propio y libre. 401 sin sesión, 403 si es de otro
 * entrenador, 404 si no existe, 409 si tiene una reserva viva encima
 * (`pending`/`full`): hay que decidirla desde Reservas antes de borrar.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const { id } = await context.params
    const supabase = getSupabaseServerClient()
    const result = await deleteSlot(supabase, trainer.id, id)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
