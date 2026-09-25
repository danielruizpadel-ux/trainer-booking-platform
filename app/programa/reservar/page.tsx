import type { Metadata } from 'next'
import Link from 'next/link'
import { SessionBooking } from '@/components/programs/SessionBooking'
import { ProgramProgressBar } from '@/components/programs/ProgramProgressBar'
import { ProgramIcon } from '@/components/programs/ProgramIcon'
import { buildSampleEnrolledProgram, buildSampleSlots, SAMPLE_SESSION_MINUTES } from '@/lib/programs/sample-data'
import { programProgress } from '@/lib/programs/progress'
import { ASSESSMENT_NAME, ASSESSMENT_PRICE_RM, PROGRAM_NAME, PROGRAM_TOTAL_SESSIONS, rm } from '@/lib/programs/catalog'
import { requireProgramDemo } from '@/lib/programs/require-demo'

export const metadata: Metadata = { title: 'Reservar sesión' }
export const dynamic = 'force-dynamic'

/**
 * Flujo 4 — reservar la siguiente sesión del plan con Dani o Denzel.
 * `?tipo=evaluacion` reutiliza la misma pantalla para la evaluación de pago
 * (flujo 1), cambiando solo la cabecera y el resumen.
 */
export default async function BookProgramSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  await requireProgramDemo()
  const { tipo } = await searchParams
  const now = new Date()
  const isAssessment = tipo === 'evaluacion'

  if (isAssessment) {
    return (
      <div>
        <BackLink href="/programa" label="Volver al programa" />
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{PROGRAM_NAME}</p>
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            Reserva tu {ASSESSMENT_NAME}
          </h1>
          <p className="mt-1.5 text-gray-500">
            {rm(ASSESSMENT_PRICE_RM)}, pista incluida. Cuenta como la sesión 1 de {PROGRAM_TOTAL_SESSIONS}.
          </p>
        </div>
        <SessionBooking mode="assessment" slots={buildSampleSlots(now)} coachIds={['dani', 'denzel']} />
      </div>
    )
  }

  const program = buildSampleEnrolledProgram(now)
  const progress = programProgress(program)
  const session = progress.nextToBook
  // Lo que el jugador ya tiene reservado: ningún hueco nuevo puede pisarlo.
  const busy = program.sessions.flatMap((s) =>
    s.status === 'booked' && s.startsAt
      ? [{ startsAt: s.startsAt, durationMinutes: s.durationMinutes ?? SAMPLE_SESSION_MINUTES }]
      : []
  )
  const planDone = progress.remaining === 0

  return (
    <div>
      <BackLink href="/programa/mi-programa" label="Mi programa" />

      {/* El contexto del plan se queda fijo: cambiar de entrenador no lo cambia. */}
      <section className="mb-6 bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{PROGRAM_NAME}</p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
              {session
                ? `Reserva la sesión ${session.number} de ${PROGRAM_TOTAL_SESSIONS}`
                : planDone
                  ? 'Plan completado'
                  : 'Todas tus sesiones están reservadas'}
            </h1>
            <p className="mt-1.5 flex items-start gap-2 text-sm text-gray-600">
              <ProgramIcon name="target" size={16} className="mt-0.5 text-blue-600 shrink-0" />
              <span>
                Objetivo: <span className="font-medium text-gray-900">{program.goal.title}</span>
              </span>
            </p>
          </div>
          <div className="md:w-64 shrink-0">
            <ProgramProgressBar sessions={program.sessions} total={progress.total} />
            <p className="mt-2 text-xs text-gray-500 tabular-nums">
              {progress.completed}/{progress.total} hechas · {progress.toBook} por reservar
            </p>
          </div>
        </div>
      </section>

      {session ? (
        <SessionBooking
          mode="program"
          slots={buildSampleSlots(now, 10, busy)}
          coachIds={program.coachIds}
          sessionsByCoach={progress.sessionsByCoach}
          sessionNumber={session.number}
          toBookAfter={progress.toBook - 1}
        />
      ) : (
        <p className="text-sm text-gray-600">
          {planDone
            ? `Has hecho las ${PROGRAM_TOTAL_SESSIONS} sesiones de tu plan. No queda ninguna por reservar.`
            : 'Ya tienes fecha para todas las sesiones que te quedan. Las verás en Mi programa.'}
        </p>
      )}
    </div>
  )
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-ml-3 mb-4 h-9 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors inline-flex items-center gap-1.5"
    >
      <ProgramIcon name="arrow-left" size={16} />
      {label}
    </Link>
  )
}
