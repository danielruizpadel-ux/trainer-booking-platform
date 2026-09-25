import { SignOutButton } from '@/components/dashboard/SignOutButton'

interface PlayerUnavailableProps {
  email: string | null
  message: string | null
}

/** Hay sesión pero no se pudo cargar ni crear el perfil de jugador (normalmente, migración 009 sin aplicar). */
export function PlayerUnavailable({ email, message }: PlayerUnavailableProps) {
  return (
    <main className="min-h-screen bg-gray-50/50 flex items-center justify-center px-4 sm:px-6 py-16">
      <div className="w-full max-w-md bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 sm:p-8 flex flex-col items-center text-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">No hemos podido cargar tu cuenta</h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Has entrado como <span className="font-medium text-gray-900">{email ?? 'usuario sin correo'}</span>. Vuelve
            a intentarlo en unos minutos.
          </p>
          {message && <p className="mt-3 text-xs text-gray-400">{message}</p>}
        </div>
        <SignOutButton action="/cuenta/auth/signout" />
      </div>
    </main>
  )
}
