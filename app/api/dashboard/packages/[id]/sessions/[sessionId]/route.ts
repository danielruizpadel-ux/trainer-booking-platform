import { NextResponse } from 'next/server'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { schedulePackageSession, unschedulePackageSession } from '@/lib/packages/schedule'

/**
 * PATCH /api/dashboard/packages/[id]/sessions/[sessionId]
 *   { action: 'schedule', slot_id, start_time, confirmed?: boolean }   agenda la sesión en una ventana propia (duración fija del paquete)
 *   { action: 'unschedule' }                               cancela la reserva y devuelve el crédito
 * 401 sin sesión, 403 si el paquete es de otro, 404 si no existe, 409 si el estado no lo permite.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string; sessionId: string }> }) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer
    const { sessionId } = await context.params
    const body = (await request.json().catch(() => null)) as
      | { action?: unknown; slot_id?: unknown; start_time?: unknown; confirmed?: unknown }
      | null

    if (body?.action === 'schedule') {
      const slotId = typeof body.slot_id === 'string' ? body.slot_id : ''
      const startTime = typeof body.start_time === 'string' ? body.start_time : ''
      if (!slotId || !startTime) {
        return NextResponse.json({ success: false, error: 'slot_id y start_time son obligatorios' }, { status: 400 })
      }
      const result = await schedulePackageSession(trainer.id, sessionId, slotId, startTime, body.confirmed === true)
      if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
      return NextResponse.json({ success: true, reservationId: result.reservationId })
    }

    if (body?.action === 'unschedule') {
      const result = await unschedulePackageSession(trainer.id, sessionId)
      if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: false, error: "action debe ser 'schedule' o 'unschedule'" }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
