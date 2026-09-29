import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { dryRunLegacyPurge, executeLegacyPurge } from '@/lib/availability/cleanup'
import { toDateStr } from '@/lib/dateUtils'

/**
 * POST /api/dashboard/availability/purge-legacy?dryRun=1
 *
 * Borra huecos manuales (generated_by_pattern = false) creados antes del
 * rediseño de horario semanal (20/09/2026, ver lib/availability/cleanup.ts)
 * que ya no tienen sentido: solo futuros y sin ninguna reserva (ni viva ni
 * cancelada). Nunca borra reservas: ver lib/availability/delete-windows.ts.
 * Con ?dryRun=1 no borra nada, solo devuelve qué borraría.
 */
export async function POST(request: NextRequest) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const supabase = getSupabaseServerClient()
    const today = toDateStr(new Date())
    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'

    if (dryRun) {
      const result = await dryRunLegacyPurge(supabase, trainer.id, today)
      return NextResponse.json({ success: true, dryRun: true, count: result.candidates.length, skippedOccupied: result.skippedOccupied, skippedWithHistory: result.skippedWithHistory, sample: result.candidates.slice(0, 10) })
    }

    const result = await executeLegacyPurge(supabase, trainer.id, today)
    return NextResponse.json({ success: true, dryRun: false, ...result })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
