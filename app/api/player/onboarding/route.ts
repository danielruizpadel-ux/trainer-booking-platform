import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requirePlayer } from '@/lib/auth/current-player'
import { parsePlayerProfileInput, savePlayerProfile } from '@/lib/players/profile'

/**
 * POST /api/player/onboarding  { full_name, phone, whatsapp_opt_in }
 *
 * Guarda los datos obligatorios y marca `onboarding_completed_at`. Si el
 * jugador ya lo había completado, solo guarda (la fecha original se respeta).
 */
export async function POST(request: Request) {
  try {
    const player = await requirePlayer()
    if (player instanceof Response) return player

    const parsed = parsePlayerProfileInput(await request.json().catch(() => null))
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.message, field: parsed.field }, { status: parsed.status })
    }

    const saved = await savePlayerProfile(getSupabaseServerClient(), player, parsed.profile, { completeOnboarding: true })
    if (!saved.ok) return NextResponse.json({ success: false, error: saved.message }, { status: saved.status })
    return NextResponse.json({ success: true, player: saved.player })
  } catch (error) {
    console.error('player route:', error instanceof Error ? error.name : 'error desconocido')
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
