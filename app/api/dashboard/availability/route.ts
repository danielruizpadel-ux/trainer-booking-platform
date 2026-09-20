import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { createSlot } from '@/lib/availability/manage'

/**
 * POST /api/dashboard/availability
 *   body: { session_date: 'YYYY-MM-DD', start_time: 'HH:MM', end_time: 'HH:MM', class_type }
 *
 * Abre un hueco nuevo para el entrenador de la sesión (Fase D). La lectura
 * del calendario del dashboard sigue siendo GET /api/dashboard/calendar.
 */
export async function POST(request: Request) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })

    const supabase = getSupabaseServerClient()
    const result = await createSlot(supabase, trainer.id, body)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    return NextResponse.json({ success: true, id: result.id })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
