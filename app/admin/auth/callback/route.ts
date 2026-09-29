import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createSessionClient } from '@/lib/supabase/server'
import { safeAdminNext } from '@/lib/auth/admin-paths'

/**
 * Vuelta de Supabase Auth (enlace mágico o Google) para el login de /admin.
 * Igual que /dashboard/auth/callback, pero solo vuelve a rutas de /admin.
 * Esta URL tiene que estar en Supabase → Authentication → URL Configuration →
 * Redirect URLs (ver migrations/020_admins.sql).
 *
 * Crear la sesión NO da permiso: cada página y cada ruta de /admin comprueba
 * la tabla `admins` (lib/auth/current-admin.ts).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const next = safeAdminNext(searchParams.get('next'))

  const providerError = searchParams.get('error_description') ?? searchParams.get('error')
  if (providerError) return redirectToLogin(origin, providerError)

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
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

function redirectToLogin(origin: string, message: string) {
  const url = new URL('/admin/login', origin)
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}
