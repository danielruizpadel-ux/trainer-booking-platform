import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getPlayerSession } from '@/lib/auth/current-player'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { isOnboarded } from '@/lib/players/profile'
import { isDraftId, trainerReturnPath } from '@/lib/players/entry'
import { findActiveTrainerBySlug } from '@/lib/players/trainers'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { PlayerProfileForm } from '@/components/player/PlayerProfileForm'

export const metadata: Metadata = { title: 'Bienvenida' }

interface BienvenidaPageProps {
  searchParams: Promise<{ trainer?: string; draft?: string }>
}

export default async function BienvenidaPage({ searchParams }: BienvenidaPageProps) {
  const { user, player } = await getPlayerSession()
  // Sin jugador el layout ya pinta el error (ver /cuenta/page.tsx).
  if (!user || !player) return null

  // `?trainer=` llega del callback: se vuelve a resolver aquí contra la base
  // de datos y la vuelta se construye en el servidor (trainerReturnPath), no
  // se acepta ninguna URL del cliente.
  const { trainer: trainerParam, draft } = await searchParams
  const found = await findActiveTrainerBySlug(getSupabaseServerClient(), trainerParam)
  const trainer = found.ok ? found.trainer : null
  const returnTo = trainer ? trainerReturnPath(trainer.slug, isDraftId(draft) ? draft : null) : '/cuenta'

  if (isOnboarded(player)) redirect(returnTo)

  // Google trae el nombre en los metadatos; se propone, no se impone.
  const meta = user.user_metadata as { full_name?: unknown; name?: unknown } | undefined
  const suggestedName =
    player.full_name ??
    (typeof meta?.full_name === 'string' ? meta.full_name : typeof meta?.name === 'string' ? meta.name : '')

  return (
    <>
      <PageHeader
        eyebrow="Bienvenida"
        title="Completa tu perfil"
        description={
          trainer
            ? `Solo una vez. Después vuelves a la reserva con ${trainer.name} y no tendrás que escribir tus datos.`
            : 'Solo una vez. Así no tendrás que escribir tus datos en cada reserva.'
        }
      />
      <PlayerProfileForm
        mode="onboarding"
        email={player.email}
        returnTo={returnTo}
        initial={{ full_name: suggestedName, phone: player.phone ?? '', whatsapp_opt_in: player.whatsapp_opt_in }}
      />
    </>
  )
}
