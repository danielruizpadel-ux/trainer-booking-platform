import { NextResponse } from 'next/server'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { createManualReservation, type ManualReservationInput } from '@/lib/reservations/manual'

/**
 * POST /api/dashboard/reservations
 *   body: { slot_id, start_time, duration_minutes?, client_name, client_email, client_phone?, notes?, confirmed?: boolean }
 * Reserva manual del entrenador en una franja libre de una ventana propia (Parte 4).
 */
export async function POST(request: Request) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const body = (await request.json().catch(() => null)) as ManualReservationInput | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })
    }

    const result = await createManualReservation(trainer.id, body)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    return NextResponse.json({ success: true, id: result.id, status: result.status })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
