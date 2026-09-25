import type { Metadata } from 'next'
import { LoginForm } from '@/components/dashboard/LoginForm'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { isValidTrainerSlug } from '@/lib/players/trainers'
import { isDraftId } from '@/lib/players/entry'

export const metadata: Metadata = {
  title: 'Entra en tu cuenta',
  robots: { index: false, follow: false },
}

interface EntrarPageProps {
  searchParams: Promise<{ error?: string; next?: string; trainer?: string; draft?: string }>
}

/**
 * Entrada de jugadores. Mismo login que el dashboard (enlace mágico + Google)
 * con otro callback. `?trainer=<slug>` viaja hasta el callback, que crea la
 * relación con ese entrenador.
 */
export default async function EntrarPage({ searchParams }: EntrarPageProps) {
  const { error, next, trainer, draft } = await searchParams
  const trainerSlug = isValidTrainerSlug(trainer) ? trainer : null
  const trainerName = trainerSlug ? await findTrainerName(trainerSlug) : null

  // El borrador de reserva (solo un UUID) acompaña al entrenador hasta la vuelta.
  const callbackPath = trainerName
    ? `/cuenta/auth/callback?trainer=${encodeURIComponent(trainerSlug!)}${isDraftId(draft) ? `&draft=${draft}` : ''}`
    : '/cuenta/auth/callback'

  return (
    <main className="min-h-screen bg-gray-50/50 flex items-center justify-center px-4 sm:px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Tu cuenta de jugador</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Entra en tu cuenta</h1>
          <p className="mt-1.5 text-gray-500">
            {trainerName
              ? `Una sola cuenta para reservar con ${trainerName} y con cualquier otro entrenador.`
              : 'Una sola cuenta para reservar con todos tus entrenadores. Sin contraseñas.'}
          </p>
        </div>

        <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 sm:p-8">
          <LoginForm initialError={error ?? null} next={next ?? null} callbackPath={callbackPath} />
        </div>
      </div>
    </main>
  )
}

async function findTrainerName(slug: string): Promise<string | null> {
  const { data } = await getSupabaseServerClient()
    .from('trainers')
    .select('name, status')
    .eq('slug', slug)
    .maybeSingle()
  if (!data || (data.status && data.status !== 'active')) return null
  return data.name
}
