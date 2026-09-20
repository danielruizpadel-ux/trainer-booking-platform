import { SignOutButton } from './SignOutButton'

interface NotLinkedProps {
  email: string | null
}

/**
 * Se muestra cuando hay sesión válida pero ningún `trainers.auth_user_id`
 * apunta a este usuario. No es un error: es el estado normal de un entrenador
 * recién entrado hasta que se le vincula (ver migrations/002_trainers_auth_user_id.sql).
 */
export function NotLinked({ email }: NotLinkedProps) {
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
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 11h-6" />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Tu cuenta no está vinculada a ningún perfil de entrenador todavía
          </h1>
          <p className="mt-1.5 text-sm text-gray-600">
            Has entrado como{' '}
            <span className="font-medium text-gray-900">{email ?? 'usuario sin correo'}</span>.
            Avisa al administrador para que vincule esta cuenta a tu perfil; en cuanto lo
            haga, recarga esta página.
          </p>
        </div>

        <SignOutButton />
      </div>
    </main>
  )
}
