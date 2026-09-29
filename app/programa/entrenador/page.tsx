import type { Metadata } from 'next'
import Link from 'next/link'
import { SessionTimeline } from '@/components/programs/SessionTimeline'
import { ProgramProgressBar, ProgressLegend } from '@/components/programs/ProgramProgressBar'
import { FocusEditor } from '@/components/programs/FocusEditor'
import { CoachAvatar } from '@/components/programs/CoachAvatar'
import { ProgramIcon } from '@/components/programs/ProgramIcon'
import { buildSampleEnrolledProgram, SAMPLE_COACHES } from '@/lib/programs/sample-data'
import { programProgress } from '@/lib/programs/progress'
import { PROGRAM_NAME } from '@/lib/programs/catalog'
import { formatLongDate, formatTime } from '@/lib/programs/format'
import type { CoachId } from '@/lib/programs/types'
import { requireProgramDemo } from '@/lib/programs/require-demo'

export const metadata: Metadata = { title: 'Plan del jugador · entrenador' }
export const dynamic = 'force-dynamic'

const VIEWERS = [
  { value: 'dani', label: 'Dani' },
  { value: 'denzel', label: 'Denzel' },
  { value: 'otro', label: 'Otro entrenador' },
] as const

/**
 * Flujo 5 — entrenador autorizado: objetivo, foco de la próxima sesión e
 * historial con notas. `?como=` simula quién mira: Dani y Denzel ven lo mismo;
 * un entrenador que no está en el plan no ve nada.
 *
 * En la versión real esta pantalla vive en /dashboard (con requireTrainer():
 * el entrenador sale de la sesión, nunca de la URL). Aquí `?como=` es solo
 * para el prototipo.
 */
export default async function TrainerPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ como?: string }>
}) {
  await requireProgramDemo()
  const { como } = await searchParams
  // Sin `?como=` se mira como Dani (el enlace de la barra del prototipo).
  // Un valor desconocido no se adivina: se trata como alguien sin acceso.
  const viewer = como === undefined ? 'dani' : (VIEWERS.find((v) => v.value === como)?.value ?? null)

  const program = buildSampleEnrolledProgram(new Date())
  const progress = programProgress(program)
  const authorized = viewer !== null && program.coachIds.includes(viewer as CoachId)

  const next = progress.nextBooked
  const nextCoach = next?.coachId ? SAMPLE_COACHES[next.coachId] : null
  const nextDate = next?.startsAt ? new Date(next.startsAt) : null

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Ver como:</span>
        {VIEWERS.map((v) => (
          <Link
            key={v.value}
            href={`/programa/entrenador?como=${v.value}`}
            aria-current={viewer === v.value ? 'true' : undefined}
            className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center transition-colors ${
              viewer === v.value ? 'bg-gray-900 text-white' : 'ring-1 ring-inset ring-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {!authorized ? (
        <div className="max-w-lg bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 sm:p-8">
          <span className="h-10 w-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
            <ProgramIcon name="lock" />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">No tienes acceso a este plan</h1>
          <p className="mt-2 text-sm text-gray-600">
            Solo los entrenadores asignados al plan de este jugador pueden ver su objetivo, su diagnóstico y las
            notas de sesión.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {PROGRAM_NAME} · jugador
              </p>
              <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{program.player.name}</h1>
              <p className="mt-1.5 text-gray-500 tabular-nums">
                {progress.completed}/{progress.total} sesiones · {progress.remaining} restantes
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <ProgramIcon name="users" size={16} className="text-gray-400" />
              Plan compartido con
              {program.coachIds.map((id) => (
                <span key={id} className="inline-flex items-center gap-1.5 font-medium text-gray-900">
                  <CoachAvatar coach={SAMPLE_COACHES[id]} size="sm" />
                  {SAMPLE_COACHES[id].name}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
              {/* Lo que el entrenador necesita antes de salir a pista. */}
              <section aria-labelledby="next-title" className="bg-white rounded-2xl ring-2 ring-blue-600 p-6">
                <h2 id="next-title" className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Próxima sesión
                </h2>
                {next && nextDate && nextCoach ? (
                  <>
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-base font-semibold text-gray-900">
                        Sesión {next.number} · {formatLongDate(nextDate)},{' '}
                        {formatTime(nextDate)}
                      </p>
                      <p className="flex items-center gap-1.5 text-sm text-gray-600">
                        <CoachAvatar coach={nextCoach} size="sm" />
                        {nextCoach.id === viewer ? 'La das tú' : `La da ${nextCoach.name}`}
                      </p>
                    </div>
                    <div className="mt-5">
                      <FocusEditor initialFocus={next.focus ?? ''} sessionNumber={next.number} />
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">El jugador no tiene ninguna sesión reservada.</p>
                )}
              </section>

              <section aria-labelledby="history-title" className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h2 id="history-title" className="text-base font-semibold text-gray-900">
                    Historial y notas internas
                  </h2>
                  <span className="h-7 px-3 rounded-full bg-gray-100 text-xs font-medium text-gray-700 inline-flex items-center gap-1.5">
                    <ProgramIcon name="lock" size={14} />
                    Solo entrenadores del plan
                  </span>
                </div>
                <p id="internal-notes-hint" className="mt-2 text-sm text-gray-500">
                  Notas de trabajo entre {program.coachIds.map((id) => SAMPLE_COACHES[id].name).join(' y ')}.{' '}
                  {program.player.firstName} no las ve: en su programa solo aparece el resumen de progreso.
                </p>
                <div className="mt-5">
                  <SessionTimeline sessions={program.sessions} total={progress.total} showInternalNotes />
                </div>
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <label htmlFor="new-note" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Nota interna tras la sesión
                  </label>
                  <textarea
                    id="new-note"
                    rows={2}
                    disabled
                    aria-describedby="internal-notes-hint"
                    placeholder="Se podrá escribir al terminar la sesión (no conectado en el prototipo)"
                    className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-400 ring-1 ring-inset ring-gray-200 cursor-not-allowed resize-none"
                  />
                </div>
              </section>
            </div>

            <div className="flex flex-col gap-6 min-w-0">
              <section aria-labelledby="goal-title" className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <ProgramIcon name="target" />
                  </span>
                  <h2 id="goal-title" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Objetivo del plan
                  </h2>
                </div>
                <p className="mt-3 text-base font-semibold text-gray-900">{program.goal.title}</p>
                <p className="mt-1 text-sm text-gray-600">{program.goal.detail}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {program.goal.focusAreas.map((area) => (
                    <li key={area} className="h-7 px-3 rounded-full bg-gray-100 text-xs font-medium text-gray-700 flex items-center">
                      {area}
                    </li>
                  ))}
                </ul>
              </section>

              {program.progressSummary && (
                <section aria-labelledby="summary-title" className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
                  <h2 id="summary-title" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Resumen que ve {program.player.firstName}
                  </h2>
                  <p className="mt-2 text-sm text-gray-700">{program.progressSummary.text}</p>
                  <p className="mt-3 text-xs text-gray-500">
                    Tras la sesión {program.progressSummary.afterSession}, por{' '}
                    {SAMPLE_COACHES[program.progressSummary.coachId].name}.
                  </p>
                </section>
              )}

              <section aria-labelledby="progress-title" className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
                <h2 id="progress-title" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Progreso
                </h2>
                <div className="mt-4">
                  <ProgramProgressBar sessions={program.sessions} total={progress.total} showNumbers />
                </div>
                <div className="mt-4">
                  <ProgressLegend completed={progress.completed} booked={progress.booked} toBook={progress.toBook} />
                </div>
              </section>

              <section aria-labelledby="diagnosis-title" className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
                <h2 id="diagnosis-title" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Diagnóstico inicial
                </h2>
                <p className="mt-2 text-sm font-semibold text-gray-900">{program.diagnosis.level}</p>
                <p className="mt-1 text-sm text-gray-600">{program.diagnosis.summary}</p>
                <p className="mt-3 text-xs text-gray-500">
                  Evaluación con {SAMPLE_COACHES[program.assessment.coachId].name},{' '}
                  {formatLongDate(new Date(program.assessment.startsAt))}.
                </p>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
