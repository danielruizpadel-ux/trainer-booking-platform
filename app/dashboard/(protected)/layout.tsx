import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth/current-trainer'
import { NotLinked } from '@/components/dashboard/NotLinked'
import { DashboardShell } from '@/components/dashboard/DashboardShell'

export const metadata: Metadata = {
  title: { default: 'Panel del entrenador', template: '%s · Panel del entrenador' },
  robots: { index: false, follow: false },
}

/**
 * Todo lo que cuelga de /dashboard (menos login y auth/*) pasa por aquí.
 *
 * proxy.ts ya ha redirigido al login si no hay sesión; la comprobación de
 * abajo es la red de seguridad por si el matcher cambia. Lo que solo puede
 * hacerse aquí es distinguir "hay sesión" de "hay sesión Y es un entrenador",
 * y montar el shell (cabecera + navegación) alrededor de cada página.
 */
export default async function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, trainer } = await getCurrentSession()

  if (!user) {
    redirect('/dashboard/login')
  }

  if (!trainer) {
    return <NotLinked email={user.email ?? null} />
  }

  return <DashboardShell trainer={trainer}>{children}</DashboardShell>
}
