import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { loadTrainerPrices, parseTrainerPrices, saveTrainerPrices } from '@/lib/reservations/trainer-prices'
import { SESSION_DISCOUNTS } from '@/lib/reservations/pricing'

/**
 * GET /api/dashboard/pricing              { prices, discounts }
 * PUT /api/dashboard/pricing  { prices }  guarda la rejilla completa
 *                                        (60/90 min × 1..4 jugadores)
 *
 * El entrenador sale SIEMPRE de la sesión (requireTrainer): un trainer_id en
 * el body se rechaza como campo no permitido. Cambiar un precio solo afecta a
 * reservas futuras: las hechas guardan su snapshot en reservations.price.
 * Los descuentos por nº de sesiones no son editables todavía (se devuelven
 * para enseñarlos).
 *
 * Errores internos: al cliente, un mensaje genérico en inglés; al log, solo
 * el tipo de error. Nunca String(error) ni detalles de Supabase.
 */

function internalError(where: string, error: unknown) {
  console.error(`${where}:`, error instanceof Error ? error.name : 'error desconocido')
  return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 })
}

export async function GET() {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer
    const loaded = await loadTrainerPrices(getSupabaseServerClient(), trainer.id)
    if (!loaded.ok) return NextResponse.json({ success: false, error: loaded.message }, { status: 500 })
    return NextResponse.json({ success: true, prices: loaded.rows, discounts: SESSION_DISCOUNTS })
  } catch (error) {
    return internalError('GET /api/dashboard/pricing', error)
  }
}

export async function PUT(request: Request) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })
    }
    const extra = Object.keys(body).find((k) => k !== 'prices')
    if (extra) return NextResponse.json({ success: false, error: `Campo no permitido: ${extra}` }, { status: 400 })

    const parsed = parseTrainerPrices(body.prices)
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.message }, { status: 400 })

    const supabase = getSupabaseServerClient()
    const saved = await saveTrainerPrices(supabase, trainer.id, parsed.rows)
    if (!saved.ok) return NextResponse.json({ success: false, error: saved.message }, { status: 500 })
    return NextResponse.json({ success: true, prices: parsed.rows })
  } catch (error) {
    return internalError('PUT /api/dashboard/pricing', error)
  }
}
