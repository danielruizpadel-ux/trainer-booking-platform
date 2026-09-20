import { NextResponse, type NextRequest } from 'next/server'
import { createSessionClient } from '@/lib/supabase/server'

/** POST desde un <form>: cierra la sesión y vuelve al login. */
export async function POST(request: NextRequest) {
  const supabase = await createSessionClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/dashboard/login', request.nextUrl.origin), {
    status: 303,
  })
}
