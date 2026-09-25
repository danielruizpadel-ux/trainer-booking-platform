import { PROGRAM_TOTAL_SESSIONS } from './catalog'
import type { CoachId, PlanSession, PlayerProgram } from './types'

/** Cifras de avance de un plan, derivadas solo de sus sesiones. */
export interface ProgramProgress {
  total: number
  completed: number
  booked: number
  /** Sin fecha todavía: las que el jugador puede reservar */
  toBook: number
  /** Sin hacer (reservadas + por reservar) */
  remaining: number
  lastCompleted: PlanSession | null
  nextBooked: PlanSession | null
  /** Primera sesión sin fecha: la que se reserva a continuación */
  nextToBook: PlanSession | null
  sessionsByCoach: Record<CoachId, number>
}

export function programProgress(program: PlayerProgram): ProgramProgress {
  const { sessions } = program
  const completed = sessions.filter((s) => s.status === 'completed')
  const booked = sessions
    .filter((s) => s.status === 'booked')
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))
  const unscheduled = sessions.filter((s) => s.status === 'unscheduled')

  const sessionsByCoach: Record<CoachId, number> = { dani: 0, denzel: 0 }
  completed.forEach((s) => {
    if (s.coachId) sessionsByCoach[s.coachId]++
  })

  return {
    total: PROGRAM_TOTAL_SESSIONS,
    completed: completed.length,
    booked: booked.length,
    toBook: unscheduled.length,
    remaining: PROGRAM_TOTAL_SESSIONS - completed.length,
    lastCompleted: completed[completed.length - 1] ?? null,
    nextBooked: booked[0] ?? null,
    nextToBook: unscheduled[0] ?? null,
    sessionsByCoach,
  }
}
