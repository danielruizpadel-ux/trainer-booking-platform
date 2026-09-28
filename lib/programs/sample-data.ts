/**
 * ============================================================
 *  DATOS DE EJEMPLO — PROTOTIPO DE UI
 * ============================================================
 * Nada de esto sale de la base de datos ni se guarda. Jugador, diagnóstico,
 * notas y huecos son inventados para enseñar las pantallas de /programa.
 *
 * Las fechas se calculan a partir de "ahora" para que el prototipo siempre
 * parezca actual (la oferta de 24 h no caduca sola a los dos días).
 *
 * Los huecos de Dani y Denzel NO son disponibilidad real: la versión real debe
 * sacarlos de lib/availability/booking.ts (bookableSlotsFor), como el resto de
 * reservas (ver CLAUDE.md → Disponibilidad).
 */

import { atProgramTime, toProgramDateKey } from './format'
import type { Coach, CoachId, CoachSlot, PlanSession, PlayerProgram } from './types'

export const SAMPLE_COACHES: Record<CoachId, Coach> = {
  dani: { id: 'dani', name: 'Dani', initials: 'D' },
  denzel: { id: 'denzel', name: 'Denzel', initials: 'Dz' },
}

export const SAMPLE_SESSION_MINUTES = 90

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const iso = (dateKey: string, hhmm: string) => atProgramTime(dateKey, hhmm).toISOString()

const SAMPLE_DIAGNOSIS: PlayerProgram['diagnosis'] = {
  level: 'Intermedio · nivel 3,5 aprox.',
  summary:
    'Buena lectura del juego y derecha sólida desde el fondo. Pierde muchos puntos al subir a la red y con la bandeja bajo presión.',
  strengths: ['Derecha de fondo estable', 'Lectura del juego y colocación', 'Buena actitud competitiva'],
  improvements: ['Bandeja: altura y dirección', 'Transición de fondo a red', 'Salidas de pared con revés'],
}

const SAMPLE_GOAL: PlayerProgram['goal'] = {
  title: 'Ganar la red con una bandeja fiable',
  detail: 'Que la bandeja deje de regalar el punto y te permita quedarte arriba en 7 de cada 10 subidas.',
  focusAreas: ['Bandeja', 'Transición a la red', 'Pared de revés'],
}

/** Jugador recién evaluado: la oferta de 24 h está abierta (flujo 2). */
export function buildSampleAssessmentResult(now: Date): PlayerProgram {
  // Evaluación terminada hace un rato, en punto o y media para que se lea bien.
  const endsAt = new Date(Math.floor(now.getTime() / 1_800_000) * 1_800_000 - 30 * 60_000)
  const startsAt = new Date(endsAt.getTime() - SAMPLE_SESSION_MINUTES * 60_000)

  return {
    player: { name: 'Aisha Rahman', firstName: 'Aisha' },
    coachIds: ['dani', 'denzel'],
    assessment: { coachId: 'dani', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    diagnosis: SAMPLE_DIAGNOSIS,
    goal: SAMPLE_GOAL,
    sessions: [
      {
        number: 1,
        status: 'completed',
        coachId: 'dani',
        startsAt: startsAt.toISOString(),
        durationMinutes: SAMPLE_SESSION_MINUTES,
        focus: 'Evaluación inicial',
      },
    ],
  }
}

/** Jugador inscrito con 3/10 hechas y la 4 reservada (flujos 3, 4 y 5). */
export function buildSampleEnrolledProgram(now: Date): PlayerProgram {
  const today = toProgramDateKey(now)

  const sessions: PlanSession[] = [
    {
      number: 1,
      status: 'completed',
      coachId: 'dani',
      startsAt: iso(addDays(today, -16), '18:00'),
      durationMinutes: SAMPLE_SESSION_MINUTES,
      focus: 'Evaluación inicial',
      note: 'Diagnóstico hecho. Objetivo acordado con Aisha: bandeja y subida a la red.',
    },
    {
      number: 2,
      status: 'completed',
      coachId: 'denzel',
      startsAt: iso(addDays(today, -10), '19:30'),
      durationMinutes: SAMPLE_SESSION_MINUTES,
      focus: 'Bandeja: punto de impacto',
      note: 'Impacta la bandeja muy detrás del cuerpo. Con el ejercicio de cesta mejora en 20 min. Repetir calentamiento.',
    },
    {
      number: 3,
      status: 'completed',
      coachId: 'dani',
      startsAt: iso(addDays(today, -4), '18:00'),
      durationMinutes: SAMPLE_SESSION_MINUTES,
      focus: 'Bandeja con dirección',
      note: 'Ya dirige la bandeja a la reja en situación controlada. Bajo presión vuelve a abrirse. Siguiente: transición.',
    },
    {
      number: 4,
      status: 'booked',
      coachId: 'denzel',
      startsAt: iso(addDays(today, 2), '18:30'),
      durationMinutes: SAMPLE_SESSION_MINUTES,
      focus: 'Transición de fondo a red tras la bandeja',
    },
    ...Array.from({ length: 6 }, (_, i): PlanSession => ({ number: 5 + i, status: 'unscheduled' })),
  ]

  const assessmentStart = new Date(sessions[0].startsAt!)
  const assessmentEnd = new Date(assessmentStart.getTime() + SAMPLE_SESSION_MINUTES * 60_000)

  return {
    player: { name: 'Aisha Rahman', firstName: 'Aisha' },
    coachIds: ['dani', 'denzel'],
    assessment: { coachId: 'dani', startsAt: assessmentStart.toISOString(), endsAt: assessmentEnd.toISOString() },
    diagnosis: SAMPLE_DIAGNOSIS,
    goal: SAMPLE_GOAL,
    sessions,
    progressSummary: {
      text: 'Tu bandeja ya va dirigida a la reja cuando tienes tiempo. Ahora toca mantenerla bajo presión y subir a la red detrás de ella.',
      afterSession: 3,
      coachId: 'dani',
    },
  }
}

/** Una reserva ya hecha: los huecos que la pisen no se ofrecen. */
export interface BusyRange {
  startsAt: string
  durationMinutes: number
}

const overlaps = (startsAt: string, minutes: number, busy: BusyRange) => {
  const start = new Date(startsAt).getTime()
  const busyStart = new Date(busy.startsAt).getTime()
  return start < busyStart + busy.durationMinutes * 60_000 && busyStart < start + minutes * 60_000
}

/** Patrón de horas por entrenador; cada día se quitan algunas para que varíe. */
const SAMPLE_HOURS: Record<CoachId, string[]> = {
  dani: ['07:00', '08:30', '18:00', '19:30', '21:00'],
  denzel: ['09:00', '10:30', '17:00', '18:30', '20:00'],
}

/**
 * Huecos de ejemplo para los próximos `days` días, ordenados por hora. Se
 * quitan los que se solapan con `busy` (las sesiones que el jugador ya tiene),
 * por rango y no por hora de inicio: una de 18:00 pisa una de 18:30.
 */
export function buildSampleSlots(now: Date, days = 10, busy: BusyRange[] = []): CoachSlot[] {
  const today = toProgramDateKey(now)
  const slots: CoachSlot[] = []

  for (let day = 1; day <= days; day++) {
    const dateKey = addDays(today, day)
    ;(Object.keys(SAMPLE_HOURS) as CoachId[]).forEach((coachId, coachIndex) => {
      SAMPLE_HOURS[coachId].forEach((hhmm, hourIndex) => {
        // Determinista: el mismo día siempre enseña los mismos huecos.
        if ((day * 3 + hourIndex * 2 + coachIndex * 5) % 4 === 0) return
        // Un domingo sin Denzel, para que se note la diferencia entre ambos.
        if (coachId === 'denzel' && (day + 2) % 7 === 0) return
        const startsAt = iso(dateKey, hhmm)
        if (busy.some((b) => overlaps(startsAt, SAMPLE_SESSION_MINUTES, b))) return
        slots.push({ coachId, startsAt, durationMinutes: SAMPLE_SESSION_MINUTES })
      })
    })
  }

  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}
