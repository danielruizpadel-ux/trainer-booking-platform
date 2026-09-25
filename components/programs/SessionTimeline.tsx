import { CoachAvatar } from './CoachAvatar'
import { ProgramIcon } from './ProgramIcon'
import { SAMPLE_COACHES } from '@/lib/programs/sample-data'
import { formatShortDate, formatTime, upperFirst } from '@/lib/programs/format'
import type { PlanSession } from '@/lib/programs/types'

interface SessionTimelineProps {
  sessions: PlanSession[]
  total: number
  /**
   * Notas internas bajo cada sesión hecha. Solo en la vista de entrenador:
   * el jugador no las ve nunca.
   */
  showInternalNotes?: boolean
  /** Agrupa las sesiones sin fecha en una sola fila ("6 por reservar") */
  collapseUnscheduled?: boolean
}

/** Historial del plan, de la sesión 1 a la 10, con quién y qué se trabajó. */
export function SessionTimeline({ sessions, total, showInternalNotes = false, collapseUnscheduled = true }: SessionTimelineProps) {
  const scheduled = sessions.filter((s) => s.status !== 'unscheduled')
  const unscheduled = sessions.filter((s) => s.status === 'unscheduled')
  const rows = collapseUnscheduled ? scheduled : sessions

  return (
    <ol className="flex flex-col">
      {rows.map((session, i) => {
        const coach = session.coachId ? SAMPLE_COACHES[session.coachId] : null
        const date = session.startsAt ? new Date(session.startsAt) : null
        const isLast = i === rows.length - 1 && (!collapseUnscheduled || unscheduled.length === 0)
        return (
          <li key={session.number} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-px bg-gray-200" />}
            <StatusDot status={session.status} number={session.number} />
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold text-gray-900">
                  Sesión {session.number}
                  {session.number === 1 && <span className="font-normal text-gray-500"> · Evaluación</span>}
                  {/* El check del círculo es decorativo: el estado se lee aquí. */}
                  {session.status === 'completed' && <span className="sr-only"> · hecha</span>}
                  {session.status === 'booked' && (
                    <span className="ml-2 inline-flex h-5 px-2 rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700 align-middle items-center">
                      Reservada
                    </span>
                  )}
                </p>
                {date && (
                  <p className="text-xs text-gray-500 tabular-nums">
                    {upperFirst(formatShortDate(date))} · {formatTime(date)}
                  </p>
                )}
              </div>
              {session.focus && session.number !== 1 && <p className="mt-0.5 text-sm text-gray-600">{session.focus}</p>}
              {coach && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
                  <CoachAvatar coach={coach} size="sm" />
                  con {coach.name}
                </p>
              )}
              {showInternalNotes && session.note && (
                <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <span className="text-xs font-semibold text-gray-500">Nota interna de {coach?.name ?? 'entrenador'} · </span>
                  {session.note}
                </p>
              )}
            </div>
          </li>
        )
      })}
      {collapseUnscheduled && unscheduled.length > 0 && (
        <li className="flex gap-4">
          <span className="h-8 w-8 rounded-full bg-white border border-dashed border-gray-300 text-gray-400 flex items-center justify-center text-xs font-semibold tabular-nums shrink-0">
            +{unscheduled.length}
          </span>
          <p className="pt-1.5 text-sm text-gray-500">
            Sesiones {unscheduled[0].number} a {total}: por reservar
          </p>
        </li>
      )}
    </ol>
  )
}

function StatusDot({ status, number }: { status: PlanSession['status']; number: number }) {
  if (status === 'completed') {
    return (
      <span aria-hidden className="relative z-10 h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
        <ProgramIcon name="check" size={16} />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={`relative z-10 h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums shrink-0 ${
        status === 'booked' ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-300' : 'bg-white text-gray-400 ring-1 ring-inset ring-gray-200'
      }`}
    >
      {number}
    </span>
  )
}
