import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { applyReservationDecision, type ReservationDecision } from '@/lib/reservations/confirmation'
import {
  SELECT_FOR_EDIT,
  cancelReservation,
  moveReservation,
  parseDetails,
  updateReservationDetails,
  type EditableReservation,
  type ReservationDetailsInput,
} from '@/lib/reservations/edit'

/**
 * PATCH /api/dashboard/reservations/[id]   body: { action }
 *   confirm | needs_reschedule   decisión sobre una pendiente (lib/reservations/confirmation.ts)
 *   cancel                       cancelación directa desde el panel (lib/reservations/edit.ts)
 *
 * PUT /api/dashboard/reservations/[id]     body: { client_name?, client_email?, client_phone?, notes?, price?, slot_id? }
 *   edición de datos/precio y, si viene slot_id, cambio de horario.
 *
 * El entrenador sale de la sesión (requireTrainer): 401 sin sesión, 403 si la
 * reserva es de otro, 404 si no existe, 409 si el estado no lo permite.
 */
type RouteContext = { params: Promise<{ id: string }> }

async function loadOwnReservation(context: RouteContext) {
  const trainer = await requireTrainer()
  if (trainer instanceof Response) return trainer

  const { id } = await context.params
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.from('reservations').select(SELECT_FOR_EDIT).eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ success: false, error: 'Reserva no encontrada' }, { status: 404 })
  const reservation = data as unknown as EditableReservation
  if (reservation.trainer_id !== trainer.id) {
    return NextResponse.json({ success: false, error: 'Esta reserva no es tuya' }, { status: 403 })
  }
  return reservation
}

const DECISIONS: ReadonlySet<string> = new Set(['confirm', 'needs_reschedule'])

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const reservation = await loadOwnReservation(context)
    if (reservation instanceof Response) return reservation

    const body = (await request.json().catch(() => null)) as { action?: unknown } | null
    const action = body?.action

    if (action === 'cancel') {
      const result = await cancelReservation(reservation)
      if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
      return NextResponse.json({ success: true, status: 'cancelled' })
    }

    if (typeof action !== 'string' || !DECISIONS.has(action)) {
      return NextResponse.json(
        { success: false, error: "action debe ser 'confirm', 'needs_reschedule' o 'cancel'" },
        { status: 400 }
      )
    }

    const result = await applyReservationDecision(reservation, action as ReservationDecision)
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: result.code === 'invalid_state' ? 409 : 500 }
      )
    }
    return NextResponse.json({ success: true, status: result.status })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const reservation = await loadOwnReservation(context)
    if (reservation instanceof Response) return reservation

    const body = (await request.json().catch(() => null)) as (ReservationDetailsInput & { slot_id?: unknown }) | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })
    }

    const parsed = parseDetails(body)
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.message }, { status: 400 })

    const details = await updateReservationDetails(reservation, parsed.updates)
    if (!details.ok) return NextResponse.json({ success: false, error: details.message }, { status: details.status })

    if (typeof body.slot_id === 'string' && body.slot_id) {
      const moved = await moveReservation({ ...reservation, ...parsed.updates } as EditableReservation, body.slot_id)
      if (!moved.ok) return NextResponse.json({ success: false, error: moved.message, detailsSaved: true }, { status: moved.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
