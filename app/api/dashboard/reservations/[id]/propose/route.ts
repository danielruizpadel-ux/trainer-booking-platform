import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { SELECT_FOR_PROPOSAL, proposeReschedule, type ProposableReservation } from '@/lib/reservations/proposal'

/**
 * POST /api/dashboard/reservations/[id]/propose   body: { slot_id, start_time }
 * Propone al cliente la franja `start_time` de la ventana `slot_id` (del propio
 * entrenador), con la misma duración de la reserva original. 401/403/404/409 como el resto del dashboard.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const { id } = await context.params
    const body = (await request.json().catch(() => null)) as { slot_id?: unknown; start_time?: unknown } | null
    const slotId = typeof body?.slot_id === 'string' ? body.slot_id : ''
    const startTime = typeof body?.start_time === 'string' ? body.start_time : ''
    if (!slotId || !startTime) {
      return NextResponse.json({ success: false, error: 'slot_id y start_time son obligatorios' }, { status: 400 })
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

    const result = await proposeReschedule(reservation as ProposableReservation, slotId, startTime, request.nextUrl.origin)
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
