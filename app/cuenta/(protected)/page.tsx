import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getPlayerSession } from '@/lib/auth/current-player'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { isOnboarded } from '@/lib/players/profile'
import { listPlayerTrainers } from '@/lib/players/trainers'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { PlayerProfileForm } from '@/components/player/PlayerProfileForm'
import { PlayerTrainersCard } from '@/components/player/PlayerTrainersCard'
import { PlayerReservationsCard } from '@/components/player/PlayerReservationsCard'

export const metadata: Metadata = { title: 'Perfil' }

export default async function CuentaPage() {
  const { player } = await getPlayerSession()
  // Sin jugador el layout ya pinta el error. No redirigir a /cuenta/entrar:
  // con sesión, el proxy devolvería aquí y sería un bucle.
  if (!player) return null
  if (!isOnboarded(player)) redirect('/cuenta/bienvenida')

  const trainers = await listPlayerTrainers(getSupabaseServerClient(), player.id)

  return (
    <>
      <PageHeader
        eyebrow="Tu cuenta"
        title="Perfil"
        description="Los datos que verán tus entrenadores cuando reserves."
      />
      <div className="flex flex-col gap-6">
        <PlayerProfileForm
          mode="edit"
          email={player.email}
          initial={{
            full_name: player.full_name ?? '',
            phone: player.phone ?? '',
            whatsapp_opt_in: player.whatsapp_opt_in,
          }}
        />
        <PlayerReservationsCard playerKey={player.id} />
        <PlayerTrainersCard trainers={trainers} />
      </div>
    </>
  )
}
