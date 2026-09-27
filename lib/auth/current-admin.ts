import { notFound, redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { createSessionClient } from '@/lib/supabase/server'

/**
 * Única forma legítima de saber si detrás de una petición hay un
 * administrador (panel /admin y rutas /api/admin).
 *
 * Mismo patrón que getCurrentSession() (entrenadores) y getPlayerSession()
 * (jugadores): la sesión sale de Supabase Auth con auth.getUser() — que valida
 * el token contra Auth; nunca getSession(), que solo lee la cookie — y el papel
 * de una tabla enlazada por auth_user_id, `public.admins` (migración 020),
 * leída con la service role. Ser entrenador o jugador no da permiso: solo una
 * fila en `admins`.
 *
 * Falla cerrado: sin sesión, sin fila, con la tabla sin crear (020 sin
 * aplicar) o con cualquier error de lectura, NO es administrador.
 */
export interface AdminSession {
  user: User | null
  isAdmin: boolean
}

export async function getAdminSession(): Promise<AdminSession> {
  const session = await createSessionClient()
  const {
    data: { user },
  } = await session.auth.getUser()
  if (!user) return { user: null, isAdmin: false }
  return { user, isAdmin: await isAdminUser(user.id) }
}

export async function isAdminUser(authUserId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServerClient()
    .from('admins')
    .select('auth_user_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error) {
    // p. ej. PGRST205 / 42P01: falta la migración 020. Nadie es admin.
    console.error('No se pudo comprobar el permiso de administrador:', { code: error.code ?? null })
    return false
  }
  return Boolean(data)
}

/**
 * Para route handlers de /api/admin: el usuario administrador, o una
 * Response 401 (sin sesión) / 403 (con sesión, sin permiso) lista para
 * devolver. Igual que requireTrainer().
 *
 *   const admin = await requireAdmin()
 *   if (admin instanceof Response) return admin
 */
export async function requireAdmin(): Promise<User | Response> {
  const { user, isAdmin } = await getAdminSession()
  if (!user) return Response.json({ success: false, error: 'No autenticado' }, { status: 401 })
  if (!isAdmin) return Response.json({ success: false, error: 'No tienes permiso de administrador' }, { status: 403 })
  return user
}

/**
 * Para cada página de /admin (en Next 16 un layout no basta: cada página lo
 * llama). Sin sesión → al login de /admin (volviendo a `path`); con sesión y
 * sin permiso → 404, que no revela que la página exista.
 */
export async function requireAdminPage(path: string): Promise<User> {
  const { user, isAdmin } = await getAdminSession()
  if (!user) redirect(`/admin/login?next=${encodeURIComponent(path)}`)
  if (!isAdmin) notFound()
  return user
}
