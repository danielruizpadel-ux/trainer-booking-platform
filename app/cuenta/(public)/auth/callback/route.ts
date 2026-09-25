import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType, User } from '@supabase/supabase-js'
import { createSessionClient } from '@/lib/supabase/server'
import { finishPlayerEntry } from '@/lib/auth/player-entry'

/**
 * Vuelta de Supabase Auth para la cuenta de jugador (enlace mágico y Google).
 * Mismo funcionamiento que /dashboard/auth/callback; esta URL también tiene
 * que estar en Supabase → Authentication → URL Configuration → Redirect URLs
 * (p. ej. http://localhost:3001/cuenta/auth/callback).
 *
 * Además de abrir la sesión, finishPlayerEntry crea la fila de `players`,
 * la relación con `?trainer=<slug>` (entró desde la página de un entrenador)
 * y decide si toca bienvenida. Aquí el vínculo no necesita la comprobación
 * de origen de /cuenta/auth/vincular: la petición ya viene autenticada por
 * el `code` / `token_hash` de un login que el propio usuario pidió.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const next = safeNext(searchParams.get('next'))
  const trainerSlug = searchParams.get('trainer')
  // Borrador de reserva (formato UUID; lo valida playerDestination).
  const draftId = searchParams.get('draft')

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const providerError = searchParams.get('error_description') ?? searchParams.get('error')
  if (providerError) {
    return redirectToLogin(origin, providerError)
  }

  const supabase = await createSessionClient()
  let user: User | null = null

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return redirectToLogin(origin, error.message)
    user = data.user
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) return redirectToLogin(origin, error.message)
    user = data.user
  } else {
    return redirectToLogin(origin, 'Enlace no válido')
  }

  if (!user) return redirectToLogin(origin, 'No se pudo abrir la sesión')

  const destination = await finishPlayerEntry(user, { trainerSlug, draftId, next, linkTrainer: true })
  return NextResponse.redirect(`${origin}${destination}`)
}

/** Solo rutas internas de /cuenta: nada de redirecciones abiertas. */
function safeNext(value: string | null): string {
  if (!value) return '/cuenta'
  if (value !== '/cuenta' && !value.startsWith('/cuenta/') && !value.startsWith('/cuenta?')) return '/cuenta'
  if (value.startsWith('//') || value.includes('\\')) return '/cuenta'
  return value
}

function redirectToLogin(origin: string, message: string) {
  const url = new URL('/cuenta/entrar', origin)
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}
