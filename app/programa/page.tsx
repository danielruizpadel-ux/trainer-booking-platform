import type { Metadata } from 'next'
import Link from 'next/link'
import { ProgramIcon, type ProgramIconName } from '@/components/programs/ProgramIcon'
import { CoachAvatar } from '@/components/programs/CoachAvatar'
import { SAMPLE_COACHES } from '@/lib/programs/sample-data'
import {
  ASSESSMENT_NAME,
  ASSESSMENT_PRICE_RM,
  OFFER_WINDOW_HOURS,
  PREMIUM_CLASS_PRICE_RM,
  PROGRAM_COMPLETION_PRICE_RM,
  PROGRAM_NAME,
  PROGRAM_PRICE_PER_SESSION_RM,
  PROGRAM_SAVINGS_RM,
  PROGRAM_TOTAL_PRICE_RM,
  PROGRAM_TOTAL_SAVINGS_RM,
  PROGRAM_TOTAL_SESSIONS,
  REMAINING_AFTER_ASSESSMENT,
  rm,
} from '@/lib/programs/catalog'
import { requireProgramDemo } from '@/lib/programs/require-demo'

export const metadata: Metadata = { title: 'Descubre el programa' }

const STEPS: { icon: ProgramIconName; title: string; body: string }[] = [
  {
    icon: 'clipboard',
    title: `Evaluación · ${rm(ASSESSMENT_PRICE_RM)}`,
    body: `Una sesión en pista para ver tu juego y fijar un objetivo. Pista incluida. Cuenta como la sesión 1 de ${PROGRAM_TOTAL_SESSIONS}.`,
  },
  {
    icon: 'clock',
    title: `Decides en ${OFFER_WINDOW_HOURS} h`,
    body: `Recibes tu diagnóstico y la opción de completar el plan por ${rm(PROGRAM_COMPLETION_PRICE_RM)}. Tienes ${OFFER_WINDOW_HOURS} horas desde que termina la evaluación.`,
  },
  {
    icon: 'users',
    title: `${REMAINING_AFTER_ASSESSMENT} sesiones con Dani o Denzel`,
    body: 'Reservas cada sesión con quien mejor te encaje. Los dos trabajan sobre tu mismo plan y anotan tu progreso.',
  },
]

/** Flujo 1 — jugador nuevo: qué es el programa y reservar la evaluación. */
export default async function ProgramDiscoverPage() {
  await requireProgramDemo()
  return (
    <div className="flex flex-col gap-12 sm:gap-16">
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8 lg:gap-12 items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Programa de 10 sesiones</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">{PROGRAM_NAME}</h1>
          <p className="mt-3 text-lg text-gray-500 max-w-xl">
            Un plan de mejora con un objetivo claro, que empieza por una evaluación en pista y sigue con
            sesiones con Dani o Denzel.
          </p>

          <ol className="mt-8 flex flex-col gap-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <ProgramIcon name={step.icon} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Paso {i + 1}</p>
                  <h2 className="mt-0.5 text-base font-semibold text-gray-900">{step.title}</h2>
                  <p className="mt-1 text-sm text-gray-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Lo que se compra hoy: solo la evaluación. */}
        <aside className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 lg:sticky lg:top-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Empieza aquí</p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">{ASSESSMENT_NAME}</h2>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums">
              {rm(ASSESSMENT_PRICE_RM)}
            </span>
            <span className="text-sm text-gray-500">pago único</span>
          </p>

          <ul className="mt-5 flex flex-col gap-2.5 text-sm text-gray-700">
            {[
              { icon: 'court' as const, text: 'Pista incluida, no pagas nada más' },
              { icon: 'target' as const, text: 'Diagnóstico y objetivo por escrito' },
              { icon: 'check' as const, text: `Cuenta como sesión 1 de ${PROGRAM_TOTAL_SESSIONS}` },
            ].map((item) => (
              <li key={item.text} className="flex items-start gap-2.5">
                <ProgramIcon name={item.icon} size={16} className="mt-0.5 text-blue-600 shrink-0" />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>

          <Link
            href="/programa/reservar?tipo=evaluacion"
            className="mt-6 h-12 w-full rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Reservar evaluación · {rm(ASSESSMENT_PRICE_RM)}
          </Link>
          <p className="mt-3 text-xs text-gray-500 text-center">
            Hoy solo pagas la evaluación. Completar el plan es opcional.
          </p>
        </aside>
      </section>

      {/* Precio del plan completo, sin letra pequeña. */}
      <section aria-labelledby="precio-title">
        <h2 id="precio-title" className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Cuánto cuesta el plan completo
        </h2>
        <p className="mt-1.5 text-gray-500">Si después de la evaluación decides seguir.</p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Sesión 1</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{rm(ASSESSMENT_PRICE_RM)}</p>
            <p className="mt-1 text-sm text-gray-600">Evaluación, pista incluida</p>
          </div>
          <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Sesiones 2 a {PROGRAM_TOTAL_SESSIONS}
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{rm(PROGRAM_COMPLETION_PRICE_RM)}</p>
            <p className="mt-1 text-sm text-gray-600">
              {REMAINING_AFTER_ASSESSMENT} sesiones, pista incluida. Oferta válida {OFFER_WINDOW_HOURS} h tras la
              evaluación.{' '}
              <span className="font-medium text-emerald-600">{rm(PROGRAM_SAVINGS_RM)} menos</span> que esas{' '}
              {REMAINING_AFTER_ASSESSMENT} sesiones compradas por separado.
            </p>
          </div>
          <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total del plan</p>
            <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{rm(PROGRAM_TOTAL_PRICE_RM)}</p>
            <p className="mt-1 text-sm text-gray-600">
              {rm(PROGRAM_PRICE_PER_SESSION_RM)} por sesión.{' '}
              <span className="font-medium text-emerald-600">
                Ahorras {rm(PROGRAM_TOTAL_SAVINGS_RM)}
              </span>{' '}
              frente a {PROGRAM_TOTAL_SESSIONS} clases premium sueltas ({rm(PREMIUM_CLASS_PRICE_RM)} cada una).
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="coaches-title">
        <h2 id="coaches-title" className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Dos entrenadores, un solo plan
        </h2>
        <p className="mt-1.5 text-gray-500 max-w-2xl">
          Dani y Denzel ven tu objetivo, el foco de cada sesión y las notas del otro. Cambiar de entrenador no
          te hace empezar de cero.
        </p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {Object.values(SAMPLE_COACHES).map((coach) => (
            <div key={coach.id} className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 flex items-center gap-4">
              <CoachAvatar coach={coach} />
              <div className="min-w-0">
                <p className="text-base font-semibold text-gray-900">{coach.name}</p>
                <p className="text-sm text-gray-500">Entrenador del {PROGRAM_NAME}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA fijo en móvil: la acción principal siempre a mano. */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-20 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-3">
        <Link
          href="/programa/reservar?tipo=evaluacion"
          className="h-12 w-full rounded-xl bg-blue-600 text-white font-semibold active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 flex items-center justify-center"
        >
          Reservar evaluación · {rm(ASSESSMENT_PRICE_RM)}
        </Link>
      </div>
    </div>
  )
}
