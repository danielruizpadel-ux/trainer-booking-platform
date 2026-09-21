import type { User } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { createSessionClient } from '@/lib/supabase/server'
import { normalizeDurations } from '@/lib/availability/durations'

export interface CurrentTrainer {
  id: string
  slug: string
  name: string
  email: string
  phone: string | null
  image_url: string | null
  status: string | null
  /** Duraciones de clase que ofrece (60/90), migración 007 */
  class_durations: number[]
}

export interface CurrentSession {
  user: User | null
  /** null si el usuario existe pero ningún `trainers.auth_user_id` apunta a él */
  trainer: CurrentTrainer | null
}

/**
 * Única forma legítima de saber qué entrenador está detrás de una petición.
 *
 * Deriva el `trainer_id` de la sesión autenticada (cookie → auth.users.id →
 * trainers.auth_user_id). Cualquier ruta o página del dashboard tiene que
 * pasar por aquí y NUNCA aceptar un `trainer_id` que venga del cliente: si no,
 * un entrenador podría pedir los datos de otro cambiando un parámetro.
 *
 * La búsqueda en `trainers` va con la service role key porque la tabla tiene
 * RLS y la clave anon no devuelve filas (ver docs/DATABASE.md).
 */
export async function getCurrentSession(): Promise<CurrentSession> {
  const session = await createSessionClient()
  const {
    data: { user },
  } = await session.auth.getUser()

  if (!user) {
    return { user: null, trainer: null }
  }

  const admin = getSupabaseServerClient()
  const select = (columns: string) => admin.from('trainers').select(columns).eq('auth_user_id', user.id).maybeSingle()
  let { data: trainer, error } = await select('id, slug, name, email, phone, image_url, status, class_durations')
  if (error?.code === '42703') {
    // migración 007 sin aplicar: solo 1 h
    ;({ data: trainer, error } = await select('id, slug, name, email, phone, image_url, status'))
  }

  if (error) {
    // Si la columna aún no existe (migración 002 sin aplicar) el error es
    // 42703. Se trata como "no vinculado" y se deja rastro en el log.
    console.error('No se pudo resolver el entrenador de la sesión:', error.message)
    return { user, trainer: null }
  }

  const row = trainer as unknown as (Omit<CurrentTrainer, 'class_durations'> & { class_durations?: unknown }) | null
  return {
    user,
    trainer: row ? { ...row, class_durations: normalizeDurations(row.class_durations) } : null,
  }
}

/**
 * Para route handlers del dashboard: devuelve el entrenador o lanza una
 * Response 401/403 lista para devolver.
 *
 *   const trainer = await requireTrainer()   // dentro de try/catch
 *   if (trainer instanceof Response) return trainer
 */
export async function requireTrainer(): Promise<CurrentTrainer | Response> {
  const { user, trainer } = await getCurrentSession()

  if (!user) {
    return Response.json({ success: false, error: 'No autenticado' }, { status: 401 })
  }

  if (!trainer) {
    return Response.json(
      { success: false, error: 'Tu cuenta no está vinculada a ningún perfil de entrenador' },
      { status: 403 }
    )
  }

  return trainer
}
