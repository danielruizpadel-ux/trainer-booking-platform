import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { isSlotOpen, reservationHoldsSlot } from '@/lib/availability/slot-status'
import { isAwaitingConfirmation, isRescheduleProposed } from '@/lib/reservations/status'
import type { CalendarSlot, CalendarSlotKind } from '@/lib/reservations/calendar'

/**
 * GET /api/dashboard/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Huecos del entrenador de la sesión en ese rango, cada uno con la reserva
 * que lo ocupa (si la hay) y su estado visual. Solo lectura.
 *
 * El estado se deduce de la reserva, no de `slot.status`: hay reservas
 * antiguas (anteriores a la Fase C) sobre huecos que siguen en `available`.
 *
 *   pending     reserva pending_confirmation encima
 *   proposed    propuesta de nueva fecha esperando al cliente
 *   confirmed   reserva confirmada
 *   available   hueco abierto sin reserva viva
 *   closed      hueco cerrado (full/blocked...) sin reserva viva: raro, pero existe
 *
 * Lo que no devuelve es "sin abrir": eso es la ausencia de hueco, y lo pinta
 * el calendario como fondo.
 */
interface SlotRow {
  id: string
  session_date: string
  start_time: string
  end_time: string
  class_type: string
  status: string | null
  current_bookings: number | null
  max_capacity: number | null
  reservations: Array<{ id: string; client_name: string; status: string | null }> | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 62

export async function GET(request: NextRequest) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const start = request.nextUrl.searchParams.get('start') ?? ''
    const end = request.nextUrl.searchParams.get('end') ?? ''
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
      return NextResponse.json({ success: false, error: 'start y end (YYYY-MM-DD) son obligatorios' }, { status: 400 })
    }
    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000
    if (days > MAX_RANGE_DAYS) {
      return NextResponse.json({ success: false, error: `Rango máximo: ${MAX_RANGE_DAYS} días` }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('availability_slots')
      .select(
        'id, session_date, start_time, end_time, class_type, status, current_bookings, max_capacity, ' +
          'reservations ( id, client_name, status )'
      )
      .eq('trainer_id', trainer.id)
      .gte('session_date', start)
      .lte('session_date', end)
      .order('session_date')
      .order('start_time')

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // El select con embed no lo tipa supabase-js sin tipos generados.
    const rows = (data ?? []) as unknown as SlotRow[]

    const slots: CalendarSlot[] = rows.map((row) => {
      const holder = (row.reservations ?? []).find((r) => reservationHoldsSlot(r.status)) ?? null

      let kind: CalendarSlotKind
      if (holder) {
        kind = isRescheduleProposed(holder.status)
          ? 'proposed'
          : isAwaitingConfirmation(holder.status)
            ? 'pending'
            : 'confirmed'
      } else {
        kind = isSlotOpen(row) ? 'available' : 'closed'
      }

      return {
        id: row.id,
        session_date: row.session_date,
        start_time: row.start_time,
        end_time: row.end_time,
        class_type: row.class_type,
        kind,
        reservation: holder,
      }
    })

    return NextResponse.json({ success: true, slots })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
