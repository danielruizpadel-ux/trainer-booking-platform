import { NextResponse } from 'next/server'
import { findBookingPlayer } from '@/lib/auth/current-player'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * GET /api/player/me — para el widget de reserva de la página pública.
 *
 *   200 { authenticated: false }
 *   200 { authenticated: true, player: BookingPlayer | null }   null = perfil incompleto
 *   503 { error }   Supabase ha fallado: no se sabe si hay sesión ni qué perfil tiene
 *
 * Un visitante anónimo es el caso normal, no un error. Solo lectura: no
 * crea la fila de `players`. Devuelve los datos del propio usuario de la
 * sesión y nada más; no acepta parámetros.
 */
export async function GET() {
  try {
    const lookup = await findBookingPlayer()
    if (lookup.status === 'error') {
      return NextResponse.json({ error: lookup.message }, { status: 503, headers: NO_STORE })
    }
    const body =
      lookup.status === 'anonymous' ? { authenticated: false } : { authenticated: true, player: lookup.bookingPlayer }
    return NextResponse.json(body, { headers: NO_STORE })
  } catch (error) {
    console.error('GET /api/player/me:', error)
    return NextResponse.json({ error: 'No se pudo comprobar tu cuenta' }, { status: 503, headers: NO_STORE })
  }
}
