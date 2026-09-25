/**
 * Trainer Data Service — perfil PÚBLICO de un entrenador.
 *
 * Solo para páginas públicas (/mauri, /[trainerSlug]). Nunca `select('*')`:
 * `trainers` tiene columnas internas (`user_id`, `auth_user_id`, `status`,
 * `created_at`, `updated_at`) que no deben llegar al navegador. Un Server
 * Component que pasa este objeto a un componente cliente lo serializa ENTERO
 * en el payload RSC, así que aquí se devuelve un DTO con campos explícitos:
 *
 *   - PUBLIC_TRAINER_COLUMNS: lo único que se pide a la base.
 *   - toPublicTrainer(): copia campo a campo; aunque alguien amplíe el select,
 *     un campo interno no pasa.
 *
 * `email` y `phone` son el contacto público que ya enseñan las landings
 * (pie de /mauri, "Get in Touch" de /[trainerSlug]). Pasarlos solo a donde se
 * pintan, nunca el objeto entero a un componente cliente.
 *
 * El dashboard NO usa esto: lee su perfil con requireTrainer() y
 * /api/trainers/[id] (PROFILE_COLUMNS). El listado público es /api/coaches.
 */

import { getSupabaseServerClient } from '@/lib/supabase/client'

export interface PublicTrainer {
  id: string
  slug: string
  name: string
  bio?: string
  image_url?: string
  rating?: number
  total_reviews?: number
  specializations?: string[]
  /** Duraciones de clase que ofrece (60/90), migración 007 */
  class_durations?: number[]
  /** Contacto público de la landing */
  email?: string
  phone?: string
}

export const PUBLIC_TRAINER_COLUMNS =
  'id, slug, name, bio, image_url, rating, total_reviews, specializations, class_durations, email, phone'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !isNaN(Number(v)) ? Number(v) : undefined)

/** DTO público: copia solo los campos permitidos, nunca el resto de la fila. */
export function toPublicTrainer(row: Row): PublicTrainer {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    bio: str(row.bio),
    image_url: str(row.image_url),
    rating: num(row.rating),
    total_reviews: num(row.total_reviews),
    specializations: Array.isArray(row.specializations) ? row.specializations.map(String) : undefined,
    class_durations: Array.isArray(row.class_durations) ? row.class_durations.map(Number) : undefined,
    email: str(row.email),
    phone: str(row.phone),
  }
}

/**
 * Entrenador ACTIVO por slug, o null.
 */
export async function getTrainerBySlug(slug: string): Promise<PublicTrainer | null> {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('trainers')
      .select(PUBLIC_TRAINER_COLUMNS)
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return toPublicTrainer(data as Row)
  } catch (error) {
    console.error('Error fetching trainer by slug:', error)
    return null
  }
}

/**
 * Entrenador ACTIVO por id, o null.
 */
export async function getTrainerById(id: string): Promise<PublicTrainer | null> {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('trainers')
      .select(PUBLIC_TRAINER_COLUMNS)
      .eq('id', id)
      .eq('status', 'active')
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return toPublicTrainer(data as Row)
  } catch (error) {
    console.error('Error fetching trainer by ID:', error)
    return null
  }
}

/**
 * Entrenadores ACTIVOS, por valoración.
 */
export async function getAllTrainers(): Promise<PublicTrainer[]> {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('trainers')
      .select(PUBLIC_TRAINER_COLUMNS)
      .eq('status', 'active')
      .order('rating', { ascending: false })

    if (error) {
      return []
    }

    return ((data || []) as Row[]).map(toPublicTrainer)
  } catch (error) {
    console.error('Error fetching trainers:', error)
    return []
  }
}
