/**
 * Duraciones de clase (minutos). Configuración a nivel de entrenador
 * (`trainers.class_durations`, migración 007): {60}, {90} o {60,90}.
 * Módulo puro, importable desde el navegador.
 */
export const CLASS_DURATIONS = [60, 90] as const
export type ClassDuration = (typeof CLASS_DURATIONS)[number]

export const DEFAULT_DURATIONS: ClassDuration[] = [60]

export function isClassDuration(value: unknown): value is ClassDuration {
  return (CLASS_DURATIONS as readonly number[]).includes(Number(value))
}

/** Normaliza lo que venga de la base o del cliente: sin duplicados, ordenado, solo 60/90. */
export function normalizeDurations(values: unknown): ClassDuration[] {
  const list = Array.isArray(values) ? values : []
  const clean = [...new Set(list.map(Number).filter(isClassDuration))].sort((a, b) => a - b) as ClassDuration[]
  return clean.length > 0 ? clean : [...DEFAULT_DURATIONS]
}

/** "1 h" / "1 h 30 min" */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/**
 * Rejilla de inicios: cada 30 min si se ofrece 1 h 30 (para encadenar
 * 09:00–10:30, 10:30–12:00), cada 60 si solo 1 h.
 */
export function gridStepFor(durations: readonly number[]): 30 | 60 {
  return durations.includes(90) ? 30 : 60
}

/** Multiplicador de precio: 1 h = ×1, 1 h 30 = ×1,5. */
export function durationMultiplier(minutes: number): number {
  return minutes / 60
}
