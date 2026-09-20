'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Cliente de Supabase para componentes cliente (login, logout).
 * Guarda la sesión en cookies para que el servidor y el proxy la vean.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
