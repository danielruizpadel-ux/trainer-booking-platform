import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createSessionClient } from '@/lib/supabase/server'

/**
 * Destino de vuelta de Supabase Auth, tanto para el enlace mágico como para
 * Google OAuth. Esta URL tiene que estar en Supabase → Authentication →
 * URL Configuration → Redirect URLs (p.ej. http://localhost:3001/dashboard/auth/callback).
 *
 * Admite dos formatos:
 *   ?code=...                      flujo PKCE (Google, y el enlace mágico con la
 *                                  plantilla de email por defecto). Solo funciona
 *                                  si se abre en el MISMO navegador que pidió el enlace.
 *   ?token_hash=...&type=email     si se cambia la plantilla del enlace mágico a
 *                                  {{ .SiteURL }}/dashboard/auth/callback?token_hash={{ .TokenHash }}&type=email
 *                                  funciona desde cualquier navegador.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const next = safeNext(searchParams.get('next'))

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  // Supabase devuelve aquí sus propios errores (enlace caducado, etc.)
  const providerError = searchParams.get('error_description') ?? searchParams.get('error')
  if (providerError) {
    return redirectToLogin(origin, providerError)
  }

  const supabase = await createSessionClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    return redirectToLogin(origin, error.message)
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    return redirectToLogin(origin, error.message)
  }

  return redirectToLogin(origin, 'Enlace no válido')
}

/** Solo se vuelve a rutas internas del dashboard: nada de redirecciones abiertas. */
function safeNext(value: string | null): string {
  if (!value) return '/dashboard'
  if (!value.startsWith('/dashboard') || value.startsWith('//')) return '/dashboard'
  return value
}

function redirectToLogin(origin: string, message: string) {
  const url = new URL('/dashboard/login', origin)
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}
