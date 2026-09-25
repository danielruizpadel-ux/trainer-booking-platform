/**
 * Player Development Plan — reglas de producto.
 *
 * Esto NO son datos de ejemplo: son las reglas acordadas del programa, y la
 * futura implementación real (cobro, créditos, oferta) debe partir de aquí.
 * Los datos de ejemplo del prototipo viven en `sample-data.ts`.
 *
 * Todavía no hay cobros, ni envío de la oferta, ni consumo de créditos
 * conectados: nada de esto se guarda en la base de datos.
 */

export const PROGRAM_NAME = 'Player Development Plan'
export const ASSESSMENT_NAME = 'Player Assessment Session'

/** Sesiones del plan completo; la evaluación cuenta como la 1. */
export const PROGRAM_TOTAL_SESSIONS = 10

/** Evaluación, pista incluida. Es la sesión 1 del plan. */
export const ASSESSMENT_PRICE_RM = 300

/** Lo que se paga para completar el plan (las 9 sesiones restantes). */
export const PROGRAM_COMPLETION_PRICE_RM = 2700

/** Clase premium suelta, pista incluida (referencia para comparar). */
export const PREMIUM_CLASS_PRICE_RM = 375

/** Ventana para aceptar la oferta, contada desde el final de la evaluación. */
export const OFFER_WINDOW_HOURS = 24

/** Malasia no tiene horario de verano: siempre GMT+8. */
export const PROGRAM_TIME_ZONE = 'Asia/Kuala_Lumpur'
export const PROGRAM_TIME_ZONE_LABEL = 'hora de Malasia, GMT+8'

export const REMAINING_AFTER_ASSESSMENT = PROGRAM_TOTAL_SESSIONS - 1

export const PROGRAM_TOTAL_PRICE_RM = ASSESSMENT_PRICE_RM + PROGRAM_COMPLETION_PRICE_RM

/** Precio medio por sesión del plan completo (3000 / 10 = 300). */
export const PROGRAM_PRICE_PER_SESSION_RM = PROGRAM_TOTAL_PRICE_RM / PROGRAM_TOTAL_SESSIONS

/**
 * Ahorro de completar el plan (RM 2,700) frente a pagar las 9 sesiones
 * restantes como clases premium sueltas (9 × 375 = 3375): RM 675.
 * Es la cifra que toca en la oferta, cuando la evaluación ya está pagada.
 */
export const PROGRAM_SAVINGS_RM =
  REMAINING_AFTER_ASSESSMENT * PREMIUM_CLASS_PRICE_RM - PROGRAM_COMPLETION_PRICE_RM

/**
 * Ahorro del plan entero (RM 3,000) frente a 10 clases premium sueltas
 * (10 × 375 = 3750): RM 750. Es la cifra que toca junto al total del plan.
 */
export const PROGRAM_TOTAL_SAVINGS_RM =
  PROGRAM_TOTAL_SESSIONS * PREMIUM_CLASS_PRICE_RM - PROGRAM_TOTAL_PRICE_RM

export function offerExpiresAt(assessmentEndedAt: Date): Date {
  return new Date(assessmentEndedAt.getTime() + OFFER_WINDOW_HOURS * 60 * 60 * 1000)
}

/**
 * "RM 2,700". Separador de miles a la malaya; `formatRM` de
 * lib/reservations/pricing no agrupa miles y aquí hay cifras de 4 dígitos.
 */
export function rm(amount: number): string {
  return `RM ${amount.toLocaleString('en-MY', { maximumFractionDigits: 2 })}`
}
