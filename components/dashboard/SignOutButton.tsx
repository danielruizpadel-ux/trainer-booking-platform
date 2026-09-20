/** Formulario sin JavaScript: POST a /dashboard/auth/signout. */
export function SignOutButton() {
  return (
    <form action="/dashboard/auth/signout" method="post">
      <button
        type="submit"
        className="h-9 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="m16 17 5-5-5-5M21 12H9" />
        </svg>
        <span className="hidden sm:inline">Cerrar sesión</span>
        <span className="sr-only sm:hidden">Cerrar sesión</span>
      </button>
    </form>
  )
}
