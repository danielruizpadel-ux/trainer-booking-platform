import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { generateSlotsForTrainer } from '@/lib/availability/generate'

/**
 * POST /api/dashboard/availability/generate
 * Regenera a mano los huecos de las próximas 8 semanas a partir de la
 * plantilla. Las demás rutas de schedule/overrides ya regeneran solas; esto
 * es un botón de refresco por si acaso.
 */
export async function POST() {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const supabase = getSupabaseServerClient()
    const summary = await generateSlotsForTrainer(supabase, trainer.id)
    return NextResponse.json({ success: true, summary })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
