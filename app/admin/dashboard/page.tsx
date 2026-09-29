import type { Metadata } from 'next'
import { surface, text } from '@/components/ui/styles'
import { requireAdminPage } from '@/lib/auth/current-admin'
import { SignOutButton } from '@/components/dashboard/SignOutButton'

export const metadata: Metadata = {
  title: 'Administración',
  robots: { index: false, follow: false },
}

const STATS = [
  { label: 'Total Trainers', value: '0' },
  { label: 'Total Clients', value: '0' },
  { label: 'Total Reservations', value: '0' },
  { label: 'Revenue', value: 'RM 0' },
]

/**
 * Panel de administración. Solo administradores (tabla `admins`, migración
 * 020): sin sesión → login de /admin; con sesión de jugador o de entrenador
 * sin permiso → 404. La comprobación va en la propia página (en Next 16 un
 * layout no basta).
 */
export default async function AdminDashboard() {
  const user = await requireAdminPage('/admin/dashboard')

  return (
    <div className="min-h-screen bg-gray-50/50 px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className={text.pageTitle}>Admin Dashboard</h1>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{user.email}</span>
            <SignOutButton action="/admin/auth/signout" />
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((stat) => (
            <div key={stat.label} className={`${surface.card} p-6`}>
              <dt className={text.eyebrow}>{stat.label}</dt>
              <dd className="mt-2 text-3xl font-bold tracking-tight text-gray-900 tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-12" aria-labelledby="activity-title">
          <h2 id="activity-title" className={text.cardTitle}>
            Recent Activity
          </h2>
          <div className={`mt-4 ${surface.card} p-6`}>
            <p className="text-sm text-gray-500">No recent activity</p>
          </div>
        </section>
      </div>
    </div>
  )
}
