import type { Metadata } from 'next'
import Link from 'next/link'
import { ProgramProgressBar, ProgressLegend } from '@/components/programs/ProgramProgressBar'
import { SessionTimeline } from '@/components/programs/SessionTimeline'
import { CoachAvatar } from '@/components/programs/CoachAvatar'
import { ProgramIcon } from '@/components/programs/ProgramIcon'
import { buildSampleEnrolledProgram, SAMPLE_COACHES } from '@/lib/programs/sample-data'
import { programProgress } from '@/lib/programs/progress'
import { PROGRAM_NAME } from '@/lib/programs/catalog'
import { formatLongDate, formatTime, upperFirst } from '@/lib/programs/format'

export const metadata: Metadata = { title: 'Mi programa' }
export const dynamic = 'force-dynamic'

const primaryButton =
  'h-12 px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'

/** Flujo 3 — jugador inscrito: progreso, próxima sesión, objetivo y reservar. */
export default function MyProgramPage() {
  const program = buildSampleEnrolledProgram(new Date())
  const progress = programProgress(program)
  const next = progress.nextBooked
  const nextCoach = next?.coachId ? SAMPLE_COACHES[next.coachId] : null
  const nextDate = next?.startsAt ? new Date(next.startsAt) : null
  const summary = program.progressSummary
  const bookLabel = progress.nextToBook ? `Reservar sesión ${progress.nextToBook.number}` : null

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{PROGRAM_NAME}</p>
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Mi programa</h1>
          <p className="mt-1.5 text-gray-500">Hola, {program.player.firstName}. Así va tu plan.</p>
        </div>
        {bookLabel && (
          <Link href="/programa/reservar" className={`${primaryButton} hidden md:flex shrink-0`}>
            {bookLabel}
            <ProgramIcon name="arrow-right" size={18} />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progreso: la cifra grande manda. */}
        <section aria-labelledby="progress-title" className="lg:col-span-2 bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
          <h2 id="progress-title" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Progreso
          </h2>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums">
              {progress.completed}
              <span className="text-gray-300">/{progress.total}</span>
            </p>
            <p className="text-sm text-gray-600">
              sesiones hechas · te quedan <span className="font-semibold text-gray-900 tabular-nums">{progress.remaining}</span>
            </p>
          </div>
          <div className="mt-5">
            <ProgramProgressBar sessions={program.sessions} total={progress.total} showNumbers />
          </div>
          <div className="mt-5">
            <ProgressLegend completed={progress.completed} booked={progress.booked} toBook={progress.toBook} />
          </div>
        </section>

        {/* Próximo entrenamiento */}
        <section aria-labelledby="next-title" className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 flex flex-col">
          <h2 id="next-title" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Próximo entrenamiento
          </h2>
          {next && nextDate && nextCoach ? (
            <>
              <p className="mt-2 text-base font-semibold text-gray-900">{upperFirst(formatLongDate(nextDate))}</p>
              <p className="text-sm text-gray-600 tabular-nums">
                {formatTime(nextDate)} · {next.durationMinutes} min · Sesión {next.number}
              </p>
              <div className="mt-4 flex items-center gap-2.5">
                <CoachAvatar coach={nextCoach} size="sm" />
                <span className="text-sm text-gray-700">con {nextCoach.name}</span>
              </div>
              {next.focus && (
                <p className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Foco</span>
                  {next.focus}
                </p>
              )}
              <p className="mt-auto pt-4 flex items-center gap-1.5 text-xs text-gray-500">
                <ProgramIcon name="court" size={14} />
                Pista incluida
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No tienes ninguna sesión reservada.</p>
          )}
        </section>

        {/* Objetivo */}
        <section aria-labelledby="goal-title" className="lg:col-span-2 bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ProgramIcon name="target" />
            </span>
            <div className="min-w-0">
              <h2 id="goal-title" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Objetivo actual
              </h2>
              <p className="text-base font-semibold text-gray-900">{program.goal.title}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600">{program.goal.detail}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {program.goal.focusAreas.map((area) => (
              <li key={area} className="h-7 px-3 rounded-full bg-gray-100 text-xs font-medium text-gray-700 flex items-center">
                {area}
              </li>
            ))}
          </ul>
          {/* Solo el resumen escrito para el jugador; las notas internas de los entrenadores no salen aquí. */}
          {summary && (
            <p className="mt-5 pt-5 border-t border-gray-100 text-sm text-gray-600">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                Cómo vas · tras la sesión {summary.afterSession}, con {SAMPLE_COACHES[summary.coachId].name}
              </span>
              {summary.text}
            </p>
          )}
        </section>

        {/* Entrenadores del plan */}
        <section aria-labelledby="coaches-title" className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
          <h2 id="coaches-title" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Tus entrenadores
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {program.coachIds.map((id) => (
              <li key={id} className="flex items-center gap-3">
                <CoachAvatar coach={SAMPLE_COACHES[id]} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{SAMPLE_COACHES[id].name}</p>
                  <p className="text-xs text-gray-500 tabular-nums">
                    {progress.sessionsByCoach[id]} {progress.sessionsByCoach[id] === 1 ? 'sesión hecha' : 'sesiones hechas'} contigo
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
            Los dos trabajan sobre tu mismo objetivo y saben qué hiciste en cada sesión.
          </p>
        </section>

        {/* Historial */}
        <section aria-labelledby="history-title" className="lg:col-span-3 bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
          <h2 id="history-title" className="text-base font-semibold text-gray-900">
            Tus sesiones
          </h2>
          <div className="mt-5">
            <SessionTimeline sessions={program.sessions} total={progress.total} />
          </div>
        </section>
      </div>

      {bookLabel && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-20 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-3">
          <Link href="/programa/reservar" className={`${primaryButton} w-full`}>
            {bookLabel}
          </Link>
        </div>
      )}
    </div>
  )
}
