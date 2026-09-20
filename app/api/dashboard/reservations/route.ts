import { NextResponse } from 'next/server'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { createManualReservation } from '@/lib/reservations/manual'

/**
 * POST /api/dashboard/reservations
 *   body: { slot_id, client_name, client_email, client_phone?, notes?, confirmed?: boolean }
 * Reserva manual del entrenador sobre un hueco propio libre (Parte 4).
 */
export async function POST(request: Request) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const slotId = typeof body?.slot_id === 'string' ? body.slot_id : ''
    if (!slotId) return NextResponse.json({ success: false, error: 'slot_id es obligatorio' }, { status: 400 })

    const result = await createManualReservation(trainer.id, slotId, body ?? {}, body?.confirmed === true)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    return NextResponse.json({ success: true, id: result.id, status: result.status })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
