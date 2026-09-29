interface PublicProfileCardProps {
  name: string
  slug: string
  publicUrl: string
  imageUrl: string | null
  bio: string | null
  specializations: string[]
  email: string | null
  phone: string | null
}

const secondaryButton =
  'h-11 px-4 rounded-xl bg-white text-gray-900 text-sm font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 inline-flex items-center justify-center gap-2'

/**
 * Lo que enseña la página pública del entrenador, en solo lectura (datos de
 * `trainers`). Editarlo desde aquí es una fase posterior.
 */
export function PublicProfileCard({ name, slug, publicUrl, imageUrl, bio, specializations, email, phone }: PublicProfileCardProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar pequeño; la URL puede ser externa
            <img src={imageUrl} alt="" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-gray-200/70 shrink-0" />
          ) : (
            <span className="h-16 w-16 rounded-2xl bg-blue-50 text-blue-600 text-xl font-semibold flex items-center justify-center shrink-0">
              {initial}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Public profile</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900 truncate">{name}</h2>
            <p className="text-sm text-gray-500 truncate">/{slug}</p>
          </div>
        </div>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className={`${secondaryButton} w-full sm:w-auto shrink-0`}>
          View public page
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
        </a>
      </div>

      <dl className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <dt className="text-gray-400">About</dt>
        <dd className="text-gray-900 whitespace-pre-line break-words">{bio?.trim() || <span className="text-gray-400">Not set</span>}</dd>

        {specializations.length > 0 && (
          <>
            <dt className="text-gray-400">Specialties</dt>
            <dd className="flex flex-wrap gap-1.5">
              {specializations.map((s) => (
                <span key={s} className="rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
                  {s}
                </span>
              ))}
            </dd>
          </>
        )}

        <dt className="text-gray-400">Email</dt>
        <dd className="text-gray-900 break-all">{email || <span className="text-gray-400">Not set</span>}</dd>

        <dt className="text-gray-400">Phone</dt>
        <dd className="text-gray-900 tabular-nums">{phone || <span className="text-gray-400">Not set</span>}</dd>
      </dl>

      <p className="mt-4 text-xs text-gray-400">Profile details can&apos;t be edited here yet.</p>
    </section>
  )
}
