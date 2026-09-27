import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { loggedInEntryRedirect } from '@/lib/players/entry'
import { isProgramDemoEnabled } from '@/lib/programs/demo'

/**
 * Protege /dashboard/** (entrenadores), /cuenta/** (jugadores) y /admin/**
 * (administración: aquí solo la sesión; el permiso lo comprueba cada página
 * con requireAdminPage(), lib/auth/current-admin.ts). /api/admin/** no pasa
 * por aquí: cada ruta llama a requireAdmin() y responde 401/403 en JSON.
 *
 * - Refresca la sesión de Supabase en cada petición (las cookies de sesión
 *   caducan y solo aquí se pueden reescribir antes de que se rendericen las páginas).
 * - Sin sesión → /dashboard/login?next=<ruta pedida> (o /cuenta/entrar?next=…).
 * - Con sesión en /dashboard/login → /dashboard (y /cuenta/entrar → /cuenta).
 *   Excepción: /cuenta/entrar?trainer=<slug> con sesión va a
 *   /cuenta/auth/vincular, que crea la relación con ese entrenador (si no,
 *   se perdería el entrenador al saltarse el login).
 *
 * Lo que NO hace: comprobar si el usuario está vinculado a un `trainers.auth_user_id`.
 * Eso lo hace `app/dashboard/(protected)/layout.tsx`, que es quien puede pintar
 * la pantalla de "cuenta no vinculada". Igual en /cuenta: crear la fila de
 * `players` y exigir el onboarding lo hace app/cuenta/(protected). Aquí solo
 * hay redirecciones.
 *
 * /programa/** (prototipo con datos de ejemplo) no tiene sesión: aquí solo se
 * corta con 404 si no está PROGRAMA_DEMO=1 (ver lib/programs/demo.ts). Va
 * antes de crear el cliente de Supabase para no pedir getUser() en el demo.
 *
 * (En Next 16 este fichero se llama proxy.ts; es lo que antes era middleware.ts.)
 */

interface ProtectedArea {
  root: string
  login: string
  publicPaths: string[]
  /** Adónde va quien ya tiene sesión y abre el login. Por defecto, `root`. */
  loggedInRedirect?: (request: NextRequest) => string
}

const AREAS: ProtectedArea[] = [
  { root: '/dashboard', login: '/dashboard/login', publicPaths: ['/dashboard/login', '/dashboard/auth'] },
  // /admin: aquí solo "hay sesión"; el permiso (tabla `admins`) lo comprueba
  // cada página con requireAdminPage() y cada ruta /api/admin con requireAdmin().
  { root: '/admin', login: '/admin/login', publicPaths: ['/admin/login', '/admin/auth'] },
  {
    root: '/cuenta',
    login: '/cuenta/entrar',
    publicPaths: ['/cuenta/entrar', '/cuenta/auth'],
    loggedInRedirect: (request) =>
      loggedInEntryRedirect(request.nextUrl.searchParams.get('trainer'), request.nextUrl.searchParams.get('draft')),
  },
]

function matchesPath(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`)
}

export async function proxy(request: NextRequest) {
  if (matchesPath(request.nextUrl.pathname, '/programa')) {
    if (!isProgramDemoEnabled()) {
      return new NextResponse('Not Found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } })
    }
    return NextResponse.next()
  }

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
  const area = AREAS.find((candidate) => matchesPath(pathname, candidate.root))
  if (!area) return response

  const isPublic = area.publicPaths.some((path) => matchesPath(pathname, path))

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = area.login
    loginUrl.search = ''
    if (pathname !== area.root) {
      loginUrl.searchParams.set('next', `${pathname}${search}`)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (user && pathname === area.login) {
    const target = area.loggedInRedirect?.(request) ?? area.root
    return NextResponse.redirect(new URL(target, request.nextUrl.origin))
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/cuenta/:path*', '/programa/:path*', '/admin/:path*'],
}
