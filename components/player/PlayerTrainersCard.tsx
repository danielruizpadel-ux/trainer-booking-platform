import Link from 'next/link'
import type { PlayerTrainerLink } from '@/lib/players/trainers'

/** Entrenadores con los que el jugador tiene relación (player_trainers). Solo lectura en esta fase. */
export function PlayerTrainersCard({ trainers }: { trainers: PlayerTrainerLink[] }) {
  const active = trainers.filter((link) => link.status === 'active')

  return (
    <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6">
      <h2 className="text-base font-semibold text-gray-900">Tus entrenadores</h2>
      <p className="mt-1 text-sm text-gray-500">Con una sola cuenta puedes reservar con varios entrenadores.</p>

      {active.length === 0 ? (
        <p className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
          Todavía no tienes ningún entrenador. Aparecerán aquí cuando entres desde su página.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {active.map(({ trainer }) => (
            <li key={trainer.id}>
              <Link
                href={`/${trainer.slug}`}
                className="flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/60 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 text-sm font-semibold flex items-center justify-center shrink-0">
                  {trainer.name.trim().charAt(0).toUpperCase() || '?'}
                </span>
                <span className="flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate">{trainer.name}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-gray-400 shrink-0"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
