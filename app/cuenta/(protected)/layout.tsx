import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getPlayerSession } from '@/lib/auth/current-player'
import { PlayerShell } from '@/components/player/PlayerShell'
import { PlayerUnavailable } from '@/components/player/PlayerUnavailable'

export const metadata: Metadata = {
  title: { default: 'Tu cuenta', template: '%s · Tu cuenta' },
  robots: { index: false, follow: false },
}

/**
 * Todo /cuenta menos entrar y auth/*.
 *
 * proxy.ts ya ha mandado al login si no hay sesión; esto es la red de
 * seguridad. Aquí se resuelve (o se crea) la fila de `players`. El
 * onboarding lo exige cada página: /cuenta manda a /cuenta/bienvenida si
 * falta, y bienvenida manda a /cuenta si ya está hecho.
 */
export default async function ProtectedPlayerLayout({ children }: { children: React.ReactNode }) {
  const { user, player, error } = await getPlayerSession()

  if (!user) {
    redirect('/cuenta/entrar')
  }

  if (!player) {
    return <PlayerUnavailable email={user.email ?? null} message={error} />
  }

  return <PlayerShell player={player}>{children}</PlayerShell>
}
