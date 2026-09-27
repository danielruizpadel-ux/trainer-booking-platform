import type { Metadata } from 'next'
import { LoginForm } from '@/components/dashboard/LoginForm'
import { safeAdminNext } from '@/lib/auth/admin-paths'

export const metadata: Metadata = {
  title: 'Acceso de administración',
  robots: { index: false, follow: false },
}

interface AdminLoginPageProps {
  searchParams: Promise<{ error?: string; next?: string }>
}

/**
 * Login de /admin: el mismo acceso de la app (enlace mágico o Google, con la
 * sesión de Supabase Auth). Entrar NO da permiso: después cada página y cada
 * ruta de /api/admin comprueba la tabla `admins` (lib/auth/current-admin.ts).
 */
export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const { error, next } = await searchParams

  return (
    <main className="min-h-screen bg-gray-50/50 flex items-center justify-center px-4 sm:px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Administración</p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Entra en tu cuenta</h1>
          <p className="mt-1.5 text-gray-500">Solo para cuentas con permiso de administrador.</p>
        </div>

        <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 sm:p-8">
          <LoginForm initialError={error ?? null} next={safeAdminNext(next ?? null)} callbackPath="/admin/auth/callback" />
        </div>
      </div>
    </main>
  )
}
