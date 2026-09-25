import { NextResponse, type NextRequest } from 'next/server'
import { createSessionClient } from '@/lib/supabase/server'

/**
 * POST desde un <form>: cierra la sesión y vuelve a /cuenta/entrar.
 * La sesión de Supabase es una por navegador: si esa misma cuenta es también
 * entrenador, sale también del dashboard.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSessionClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/cuenta/entrar', request.nextUrl.origin), {
    status: 303,
  })
}
