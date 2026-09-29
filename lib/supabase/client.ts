import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}

/**
 * Browser-safe Supabase client for public operations
 * Use this in the browser or for public API routes
 */
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Cliente de servidor con la service role key, para route handlers y Server
 * Components. Es la ÚNICA vía de escritura de la app: desde la migración 010,
 * anon y authenticated no tienen permisos de escritura en `reservations` ni
 * en `trainer_session_prices`.
 *
 * Falla cerrado: sin SUPABASE_SERVICE_ROLE_KEY lanza un error explícito. Antes
 * caía en silencio al cliente anon, que con RLS lee cero filas y ya no puede
 * escribir: el fallo parecía "no hay huecos" o "no se pudo reservar".
 * Esta clave nunca va al navegador (sin prefijo NEXT_PUBLIC_).
 */
export function getSupabaseServerClient() {
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY no está configurada: el servidor no puede leer ni escribir datos. Revisa .env.local / las variables del despliegue.'
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export default supabaseClient;
