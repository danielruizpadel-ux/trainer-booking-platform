import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'

/**
 * Listado público de entrenadores activos (lo usa /trainers).
 *
 * Es público a propósito, así que solo devuelve lo que ya se enseña en una
 * landing. Nunca `email`, `phone`, `user_id` ni `auth_user_id`.
 */
const PUBLIC_COLUMNS = 'id, slug, name, bio, image_url, specializations, rating, total_reviews'

export async function GET() {
  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('trainers')
      .select(PUBLIC_COLUMNS)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
