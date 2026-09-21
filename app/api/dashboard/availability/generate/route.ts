import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { generateSlotsForTrainer } from '@/lib/availability/generate'
import { refreshAllWindows } from '@/lib/reservations/slots'
import { toDateStr } from '@/lib/dateUtils'

/**
 * POST /api/dashboard/availability/generate
 * Regenera a mano los huecos de las próximas 8 semanas a partir de la
 * plantilla y recalcula el estado (contador / full) de todas las ventanas
 * futuras. Las demás rutas de schedule/overrides ya regeneran solas; esto
 * es un botón de refresco por si acaso (y el que hay que pulsar tras aplicar
 * la migración 007).
 */
export async function POST() {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const supabase = getSupabaseServerClient()
    const summary = await generateSlotsForTrainer(supabase, trainer.id)
    const refreshedWindows = await refreshAllWindows(supabase, trainer.id, toDateStr(new Date()))
    return NextResponse.json({ success: true, summary: { ...summary, refreshedWindows } })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
