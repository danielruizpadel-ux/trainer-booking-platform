import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { SELECT_FOR_PROPOSAL, proposeReschedule, type ProposableReservation } from '@/lib/reservations/proposal'

/**
 * POST /api/dashboard/reservations/[id]/propose   body: { slot_id }
 * Propone al cliente el hueco `slot_id` (del propio entrenador) para una
 * reserva pendiente. 401/403/404/409 como el resto del dashboard.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const { id } = await context.params
    const body = (await request.json().catch(() => null)) as { slot_id?: unknown } | null
    const slotId = typeof body?.slot_id === 'string' ? body.slot_id : ''
    if (!slotId) {
      return NextResponse.json({ success: false, error: 'slot_id es obligatorio' }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select(SELECT_FOR_PROPOSAL)
      .eq('id', id)
      .maybeSingle()
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    if (!reservation) return NextResponse.json({ success: false, error: 'Reserva no encontrada' }, { status: 404 })
    if ((reservation as ProposableReservation).trainer_id !== trainer.id) {
      return NextResponse.json({ success: false, error: 'Esta reserva no es tuya' }, { status: 403 })
    }

    const result = await proposeReschedule(reservation as ProposableReservation, slotId, request.nextUrl.origin)
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    }
    return NextResponse.json({
      success: true,
      proposalId: result.proposalId,
      link: `${request.nextUrl.origin}/propuesta/${result.token}`,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
