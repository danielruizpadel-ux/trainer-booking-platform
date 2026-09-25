import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requirePlayer } from '@/lib/auth/current-player'
import { isOnboarded, parsePlayerProfileInput, savePlayerProfile } from '@/lib/players/profile'

/**
 * GET   /api/player/profile   perfil del jugador de la sesión
 * PATCH /api/player/profile   { full_name, phone, whatsapp_opt_in } edita el perfil
 *
 * El jugador sale SIEMPRE de la sesión (requirePlayer). El email no se edita
 * aquí: es el de Supabase Auth.
 */
export async function GET() {
  try {
    const player = await requirePlayer()
    if (player instanceof Response) return player
    return NextResponse.json({ success: true, player })
  } catch (error) {
    console.error('player route:', error instanceof Error ? error.name : 'error desconocido')
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const player = await requirePlayer()
    if (player instanceof Response) return player

    if (!isOnboarded(player)) {
      return NextResponse.json(
        { success: false, error: 'Completa primero tu perfil en /cuenta/bienvenida' },
        { status: 409 }
      )
    }

    const parsed = parsePlayerProfileInput(await request.json().catch(() => null))
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: parsed.message, field: parsed.field }, { status: parsed.status })
    }

    const saved = await savePlayerProfile(getSupabaseServerClient(), player, parsed.profile, { completeOnboarding: false })
    if (!saved.ok) return NextResponse.json({ success: false, error: saved.message }, { status: saved.status })
    return NextResponse.json({ success: true, player: saved.player })
  } catch (error) {
    console.error('player route:', error instanceof Error ? error.name : 'error desconocido')
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
