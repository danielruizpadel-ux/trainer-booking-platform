import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { isSlotOpen, reservationHoldsSlot } from '@/lib/availability/slot-status'
import { isAwaitingConfirmation, isRescheduleProposed } from '@/lib/reservations/status'
import { freeRanges, type TimeRange } from '@/lib/availability/windows'
import { gridStepFor } from '@/lib/availability/durations'
import { WINDOW_SELECT, reservationRange, type WindowRow } from '@/lib/reservations/slots'
import type { CalendarData, CalendarReservation, CalendarWindow } from '@/lib/reservations/calendar'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Ventanas del entrenador de la sesión en ese rango (con sus tramos libres,
 * ya descontadas las reservas vivas) y sus reservas con el rango real de la
 * clase (60 o 90 min). Solo lectura.
 *
 * "Sin abrir" es la ausencia de ventana; lo pinta el calendario como fondo.
 * Una ventana cerrada (full/blocked) no tiene tramos libres.
 */
interface SlotRow extends WindowRow {
  reservations: Array<{ id: string; client_name: string; status: string | null; start_time: string | null; end_time: string | null; duration_minutes: number | null; player_count: number | null }> | null
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
      .select(WINDOW_SELECT.replace('reservations ( id, status, start_time, end_time )', 'reservations ( id, client_name, status, start_time, end_time, duration_minutes, player_count )'))
      .eq('trainer_id', trainer.id)
      .gte('session_date', start)
      .lte('session_date', end)
      .order('session_date')
      .order('start_time')

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const rows = (data ?? []) as unknown as SlotRow[]

    // Primera pasada: reservas vivas de cada fila y, agrupado por día, las de
    // CUALQUIER fila ese día. Si hay más de una fila de disponibilidad
    // solapada en el mismo día (huecos legacy sueltos junto a la ventana del
    // patrón semanal), una reserva en una no debe quedar invisible para el
    // "free" de las demás.
    const parsedRows: Array<{ window: Omit<SlotRow, 'reservations'>; live: NonNullable<SlotRow['reservations']> }> = []
    const takenByDate = new Map<string, TimeRange[]>()
    for (const row of rows) {
      const { reservations: rowReservations, ...window } = row
      const live = (rowReservations ?? []).filter((r) => reservationHoldsSlot(r.status))
      parsedRows.push({ window, live })
      const list = takenByDate.get(window.session_date) ?? []
      for (const r of live) list.push(reservationRange(r, window))
      takenByDate.set(window.session_date, list)
    }

    const windows: CalendarWindow[] = []
    const reservations: CalendarReservation[] = []

    for (const { window, live } of parsedRows) {
      const dateTaken = takenByDate.get(window.session_date) ?? []

      windows.push({
        id: window.id,
        session_date: window.session_date,
        start_time: window.start_time.slice(0, 5),
        end_time: window.end_time.slice(0, 5),
        class_type: window.class_type,
        status: window.status,
        free: isSlotOpen(window) ? freeRanges(window, dateTaken) : [],
      })

      for (const r of live) {
        const range = reservationRange(r, window)
        reservations.push({
          id: r.id,
          window_id: window.id,
          session_date: window.session_date,
          start_time: range.start_time,
          end_time: range.end_time,
          duration_minutes: r.duration_minutes ?? 60,
          client_name: r.client_name,
          status: r.status,
          player_count: r.player_count ?? null,
          kind: isRescheduleProposed(r.status) ? 'proposed' : isAwaitingConfirmation(r.status) ? 'pending' : 'confirmed',
        })
      }
    }

    const durations = trainer.class_durations
    const payload: CalendarData = { windows, reservations, durations, step: gridStepFor(durations) }
    return NextResponse.json({ success: true, ...payload })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
