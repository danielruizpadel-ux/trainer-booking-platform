/**
 * Forma de los datos del programa tal como los pinta la UI. Las fechas van
 * como ISO string para poder pasarlas de un Server Component a uno de cliente.
 *
 * No existe todavía en la base de datos: cuando se diseñe el esquema real,
 * esto es lo que la UI necesita recibir.
 */

export type CoachId = 'dani' | 'denzel'

export interface Coach {
  id: CoachId
  name: string
  initials: string
}

/** completed = hecha · booked = reservada con fecha · unscheduled = por reservar */
export type PlanSessionStatus = 'completed' | 'booked' | 'unscheduled'

export interface PlanSession {
  /** 1..10; la 1 es siempre la evaluación */
  number: number
  status: PlanSessionStatus
  coachId?: CoachId
  startsAt?: string
  durationMinutes?: number
  /** Foco de trabajo de esa sesión */
  focus?: string
  /**
   * Nota interna del entrenador tras la sesión (solo completed). La leen solo
   * los entrenadores del plan; el jugador nunca la ve.
   */
  note?: string
}

/** Resumen de progreso escrito para el jugador: lo único que ve de las notas. */
export interface ProgressSummary {
  text: string
  /** Sesión tras la que se actualizó */
  afterSession: number
  coachId: CoachId
}

export interface Diagnosis {
  level: string
  summary: string
  strengths: string[]
  improvements: string[]
}

export interface ProgramGoal {
  title: string
  detail: string
  focusAreas: string[]
}

export interface PlayerProgram {
  player: { name: string; firstName: string }
  coachIds: CoachId[]
  assessment: { coachId: CoachId; startsAt: string; endsAt: string }
  diagnosis: Diagnosis
  goal: ProgramGoal
  sessions: PlanSession[]
  progressSummary?: ProgressSummary
}

export interface CoachSlot {
  coachId: CoachId
  startsAt: string
  durationMinutes: number
}
