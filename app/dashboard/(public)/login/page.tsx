import type { Metadata } from 'next'
import { LoginForm } from '@/components/dashboard/LoginForm'

export const metadata: Metadata = {
  title: 'Acceso de entrenadores',
  robots: { index: false, follow: false },
}

interface LoginPageProps {
  searchParams: Promise<{ error?: string; next?: string }>
}

export default async function DashboardLoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams

  return (
    <main className="min-h-screen bg-gray-50/50 flex items-center justify-center px-4 sm:px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Panel del entrenador
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            Entra en tu cuenta
          </h1>
          <p className="mt-1.5 text-gray-500">
            Sin contraseñas: te enviamos un enlace al correo o entras con Google.
          </p>
        </div>

        <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 sm:p-8">
          <LoginForm initialError={error ?? null} next={next ?? null} />
        </div>
      </div>
    </main>
  )
}
