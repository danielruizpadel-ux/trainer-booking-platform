import { NextResponse } from 'next/server'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { createOneOffReservation, type OneOffReservationInput } from '@/lib/reservations/one-off'

/**
 * POST /api/dashboard/reservations/one-off
 *   body: { session_date, start_time, duration_minutes, client_name, client_email, client_phone?, notes?, confirmed?: boolean }
 * Clase puntual del entrenador en un tramo que puede estar fuera de su
 * disponibilidad. No abre disponibilidad pública. El entrenador sale de la
 * sesión: un `trainer_id` en el body se ignora. Ver lib/reservations/one-off.ts.
 */
export async function POST(request: Request) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const body = (await request.json().catch(() => null)) as OneOffReservationInput | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })
    }

    const result = await createOneOffReservation(trainer.id, body)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    return NextResponse.json({ success: true, id: result.id, status: result.status, placement: result.placement })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
