import { NextResponse, type NextRequest } from 'next/server'
import { createSessionClient } from '@/lib/supabase/server'

/** POST desde un <form>: cierra la sesión (la misma de toda la app) y vuelve al login de /admin. */
export async function POST(request: NextRequest) {
  const supabase = await createSessionClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/admin/login', request.nextUrl.origin), { status: 303 })
}
