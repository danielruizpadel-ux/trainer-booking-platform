import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente de Supabase con la sesión del usuario (cookies), para Server
 * Components, layouts y route handlers.
 *
 * Usa la clave anon: lo que vea está limitado por RLS. Sirve para saber QUIÉN
 * está logueado (`auth.getUser()`), no para leer `trainers`, `reservations` o
 * `availability_slots` — para eso sigue haciendo falta `getSupabaseServerClient()`
 * de `./client` (service role), una vez comprobada la sesión.
 */
export async function createSessionClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Un Server Component no puede escribir cookies. No pasa nada: el
            // proxy (proxy.ts) ya refresca la sesión en cada petición.
          }
        },
      },
    }
  )
}
