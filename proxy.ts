import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Protege /dashboard/**.
 *
 * - Refresca la sesión de Supabase en cada petición (las cookies de sesión
 *   caducan y solo aquí se pueden reescribir antes de que se rendericen las páginas).
 * - Sin sesión → /dashboard/login?next=<ruta pedida>.
 * - Con sesión en /dashboard/login → /dashboard.
 *
 * Lo que NO hace: comprobar si el usuario está vinculado a un `trainers.auth_user_id`.
 * Eso lo hace `app/dashboard/(protected)/layout.tsx`, que es quien puede pintar
 * la pantalla de "cuenta no vinculada". Aquí solo hay redirecciones.
 *
 * (En Next 16 este fichero se llama proxy.ts; es lo que antes era middleware.ts.)
 */

const PUBLIC_DASHBOARD_PATHS = ['/dashboard/login', '/dashboard/auth']

function isPublicDashboardPath(pathname: string) {
  return PUBLIC_DASHBOARD_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() valida el token contra Supabase Auth. No usar getSession():
  // solo lee la cookie y se puede falsificar.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl
  const isPublic = isPublicDashboardPath(pathname)

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/dashboard/login'
    loginUrl.search = ''
    if (pathname !== '/dashboard') {
      loginUrl.searchParams.set('next', `${pathname}${search}`)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (user && pathname === '/dashboard/login') {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    dashboardUrl.search = ''
    return NextResponse.redirect(dashboardUrl)
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
