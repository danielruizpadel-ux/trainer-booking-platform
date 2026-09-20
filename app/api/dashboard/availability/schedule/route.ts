import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { listWeeklyHours } from '@/lib/availability/weekly'
import { listOverrides } from '@/lib/availability/overrides'
import { toDateStr } from '@/lib/dateUtils'

// Siempre fresco: el cliente lo pide justo despues de guardar un cambio.
export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/availability/schedule
 * Plantilla semanal + excepciones futuras del entrenador de la sesión.
 */
export async function GET() {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const supabase = getSupabaseServerClient()
    const [weekly, overrides] = await Promise.all([
      listWeeklyHours(supabase, trainer.id),
      listOverrides(supabase, trainer.id, toDateStr(new Date())),
    ])
    return NextResponse.json({ success: true, weekly, overrides })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
