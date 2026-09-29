import type { Metadata } from 'next'
import Link from 'next/link'
import { OfferCard } from '@/components/programs/OfferCard'
import { CoachAvatar } from '@/components/programs/CoachAvatar'
import { ProgramIcon } from '@/components/programs/ProgramIcon'
import { buildSampleAssessmentResult, SAMPLE_COACHES } from '@/lib/programs/sample-data'
import { offerExpiresAt, PROGRAM_TOTAL_SESSIONS } from '@/lib/programs/catalog'
import { formatLongDate, formatTime } from '@/lib/programs/format'
import { requireProgramDemo } from '@/lib/programs/require-demo'

export const metadata: Metadata = { title: 'Resultado de tu evaluación' }
export const dynamic = 'force-dynamic'

/**
 * Flujo 2 — tras la evaluación: diagnóstico y propuesta de 24 h.
 * `?oferta=caducada` enseña el estado de oferta vencida.
 */
export default async function AssessmentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ oferta?: string }>
}) {
  await requireProgramDemo()
  const { oferta } = await searchParams
  const now = new Date()
  const program = buildSampleAssessmentResult(now)
  const coach = SAMPLE_COACHES[program.assessment.coachId]
  const endsAt = new Date(program.assessment.endsAt)
  const startsAt = new Date(program.assessment.startsAt)

  // Para ver el estado caducado sin esperar 24 h.
  const expiresAt = oferta === 'caducada' ? new Date(now.getTime() - 60 * 60_000) : offerExpiresAt(endsAt)

  const { diagnosis, goal } = program

  return (
    <div>
      <div className="mb-8 sm:mb-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Sesión 1 de {PROGRAM_TOTAL_SESSIONS} · completada
        </p>
        <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          {program.player.firstName}, este es tu diagnóstico
        </h1>
        <p className="mt-1.5 text-gray-500">
          Evaluación con {coach.name}, {formatLongDate(startsAt)} de{' '}
          {formatTime(startsAt)} a {formatTime(endsAt)}.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Nivel de partida</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{diagnosis.level}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CoachAvatar coach={coach} size="sm" />
                <span className="text-sm text-gray-600">{coach.name}</span>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600">{diagnosis.summary}</p>

            <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Lo que ya funciona</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {diagnosis.strengths.map((s) => (
                    <li key={s} className="flex items-start gap-2 text-sm text-gray-700">
                      <ProgramIcon name="check" size={16} className="mt-0.5 text-emerald-600 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Lo que vamos a trabajar</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {diagnosis.improvements.map((s) => (
                    <li key={s} className="flex items-start gap-2 text-sm text-gray-700">
                      <ProgramIcon name="arrow-right" size={16} className="mt-0.5 text-blue-600 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <ProgramIcon name="target" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Objetivo propuesto</p>
                <h2 className="text-base font-semibold text-gray-900">{goal.title}</h2>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600">{goal.detail}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {goal.focusAreas.map((area) => (
                <li key={area} className="h-7 px-3 rounded-full bg-gray-100 text-xs font-medium text-gray-700 flex items-center">
                  {area}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="lg:sticky lg:top-6">
          <OfferCard expiresAt={expiresAt.toISOString()} serverNow={now.toISOString()} />
          <p className="mt-4 text-xs text-gray-400 text-center">
            Prototipo: <Link href="/programa/evaluacion?oferta=caducada" className="underline hover:text-gray-600">ver oferta caducada</Link>
            {' · '}
            <Link href="/programa/evaluacion" className="underline hover:text-gray-600">ver oferta abierta</Link>
          </p>
        </aside>
      </div>
    </div>
  )
}
