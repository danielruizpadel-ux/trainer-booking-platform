import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { requireTrainer } from '@/lib/auth/current-trainer'

/**
 * Perfil del entrenador autenticado.
 *
 * Solo el propio entrenador puede leer y editar su fila: el `id` del path
 * tiene que coincidir con el `trainer.id` que sale de la sesión
 * (lib/auth/current-trainer.ts). Sin sesión → 401; otro entrenador → 403.
 *
 * Antes este fichero hacía `update(body)` sin ninguna comprobación: con la
 * columna `auth_user_id` eso permitía a cualquiera apuntar la fila de un
 * entrenador a su propio usuario y entrar en su dashboard. Ya no hay DELETE.
 */

/** Lo único que un entrenador puede cambiar de sí mismo desde el dashboard. */
const EDITABLE_COLUMNS = ['name', 'email', 'phone', 'bio', 'image_url', 'specializations'] as const

/** Campos que se devuelven al propio entrenador (nunca `user_id` ni `auth_user_id`). */
const PROFILE_COLUMNS =
  'id, slug, name, email, phone, bio, image_url, specializations, rating, total_reviews, status, created_at, updated_at'

type RouteContext = { params: Promise<{ id: string }> }

async function authorize(context: RouteContext) {
  const { id } = await context.params
  const trainer = await requireTrainer()
  if (trainer instanceof Response) return trainer

  if (trainer.id !== id) {
    return NextResponse.json(
      { success: false, error: 'No puedes acceder al perfil de otro entrenador' },
      { status: 403 }
    )
  }

  return trainer
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const trainer = await authorize(context)
    if (trainer instanceof Response) return trainer

    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('trainers')
      .select(PROFILE_COLUMNS)
      .eq('id', trainer.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Trainer not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const trainer = await authorize(context)
    if (trainer instanceof Response) return trainer

    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })
    }

    // Lista blanca estricta. `auth_user_id`, `slug`, `status`, `rating`... no se
    // aceptan ni se ignoran en silencio: se rechaza la petición entera para
    // que un cliente mal hecho no crea que ha guardado algo.
    const keys = Object.keys(body)
    const forbidden = keys.filter(
      (key) => !(EDITABLE_COLUMNS as readonly string[]).includes(key)
    )
    if (forbidden.length > 0) {
      return NextResponse.json(
        { success: false, error: `Campos no editables: ${forbidden.join(', ')}` },
        { status: 400 }
      )
    }
    if (keys.length === 0) {
      return NextResponse.json({ success: false, error: 'Nada que actualizar' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    for (const key of keys) {
      updates[key] = (body as Record<string, unknown>)[key]
    }
    updates.updated_at = new Date().toISOString()

    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('trainers')
      .update(updates)
      .eq('id', trainer.id)
      .select(PROFILE_COLUMNS)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'No se pudo actualizar el perfil', detail: error?.message ?? null },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
