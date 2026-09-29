import { isDraftId, isValidTrainerSlug } from '@/lib/players/entry'

/**
 * Borrador de reserva para no perder la selección al ir al login ("Continue
 * with my account") y volver.
 *
 * Solo datos NO sensibles: versión, id, entrenador, sesiones, duración, nº de
 * jugadores y caducidad. NUNCA nombre, email, teléfono, WhatsApp, mensaje al
 * entrenador ni player_id. Lo que se recupera NO es de fiar: el servidor
 * vuelve a validar entrenador, sesiones, disponibilidad, duración, jugadores,
 * precio e identidad al confirmar. La caducidad solo decide si la UI lo
 * restaura, no si la reserva es válida.
 *
 * localStorage (no sessionStorage): el enlace mágico abre otra pestaña.
 * Clave versionada y aislada por entrenador + draftId, así dos pestañas o dos
 * entrenadores no se pisan. Todo acceso va en try/catch (modo privado, cuota).
 */

export const DRAFT_VERSION = 1
export const DRAFT_PREFIX = `tb:booking-draft:v${DRAFT_VERSION}:`
export const DRAFT_TTL_MS = 30 * 60 * 1000
export const DRAFT_MAX_SESSIONS = 20
export const DRAFT_MAX_STORED = 5

export interface BookingDraft {
  version: typeof DRAFT_VERSION
  draftId: string
  trainerSlug: string
  sessions: Array<{ date: string; time: string }>
  duration: number
  playerCount: number
  expiresAt: number
}

/** Los únicos campos que puede tener un borrador. Cualquier otro → se descarta entero. */
const DRAFT_KEYS = ['version', 'draftId', 'trainerSlug', 'sessions', 'duration', 'playerCount', 'expiresAt'] as const

export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly length: number
  key(index: number): string | null
}

export function draftKey(trainerSlug: string, draftId: string): string {
  return `${DRAFT_PREFIX}${trainerSlug}:${draftId}`
}

export function createDraft(
  input: { draftId: string; trainerSlug: string; sessions: Array<{ date: string; time: string }>; duration: number; playerCount: number },
  now: number
): BookingDraft {
  return {
    version: DRAFT_VERSION,
    draftId: input.draftId,
    trainerSlug: input.trainerSlug,
    sessions: input.sessions.map(({ date, time }) => ({ date, time })),
    duration: input.duration,
    playerCount: input.playerCount,
    expiresAt: now + DRAFT_TTL_MS,
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Valida un borrador recuperado. Devuelve null ante cualquier cosa rara:
 * versión, entrenador o id distintos, caducado, campos de más, sesiones mal
 * formadas o repetidas, duración que el entrenador no ofrece, jugadores fuera
 * de 1..4.
 */
export function parseDraft(
  raw: unknown,
  expected: { trainerSlug: string; draftId: string; now: number; allowedDurations: readonly number[] }
): BookingDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const d = raw as Record<string, unknown>
  if (Object.keys(d).some((k) => !(DRAFT_KEYS as readonly string[]).includes(k))) return null

  if (d.version !== DRAFT_VERSION) return null
  if (!isDraftId(d.draftId) || d.draftId !== expected.draftId) return null
  if (!isValidTrainerSlug(d.trainerSlug) || d.trainerSlug !== expected.trainerSlug) return null
  if (typeof d.expiresAt !== 'number' || !Number.isFinite(d.expiresAt) || d.expiresAt <= expected.now) return null
  if (d.expiresAt > expected.now + DRAFT_TTL_MS) return null
  if (typeof d.duration !== 'number' || !expected.allowedDurations.includes(d.duration)) return null
  if (typeof d.playerCount !== 'number' || !Number.isInteger(d.playerCount) || d.playerCount < 1 || d.playerCount > 4) return null

  if (!Array.isArray(d.sessions) || d.sessions.length === 0 || d.sessions.length > DRAFT_MAX_SESSIONS) return null
  const seen = new Set<string>()
  const sessions: Array<{ date: string; time: string }> = []
  for (const s of d.sessions) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null
    const keys = Object.keys(s)
    if (keys.length !== 2 || !keys.includes('date') || !keys.includes('time')) return null
    const { date, time } = s as { date: unknown; time: unknown }
    if (typeof date !== 'string' || !DATE_RE.test(date) || typeof time !== 'string' || !TIME_RE.test(time)) return null
    const key = `${date} ${time}`
    if (seen.has(key)) return null
    seen.add(key)
    sessions.push({ date, time })
  }

  return {
    version: DRAFT_VERSION,
    draftId: d.draftId,
    trainerSlug: d.trainerSlug,
    sessions,
    duration: d.duration,
    playerCount: d.playerCount,
    expiresAt: d.expiresAt,
  }
}

/** Borra los borradores caducados o ilegibles y deja como mucho DRAFT_MAX_STORED. */
export function sweepDrafts(storage: DraftStorage, now: number): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(DRAFT_PREFIX)) keys.push(key)
    }
    const alive: Array<{ key: string; expiresAt: number }> = []
    for (const key of keys) {
      let expiresAt = 0
      try {
        expiresAt = Number((JSON.parse(storage.getItem(key) ?? 'null') as { expiresAt?: unknown } | null)?.expiresAt)
      } catch {
        expiresAt = 0
      }
      if (!Number.isFinite(expiresAt) || expiresAt <= now) storage.removeItem(key)
      else alive.push({ key, expiresAt })
    }
    alive
      .sort((a, b) => b.expiresAt - a.expiresAt)
      .slice(DRAFT_MAX_STORED)
      .forEach(({ key }) => storage.removeItem(key))
  } catch {
    // Almacenamiento no disponible: no hay nada que barrer.
  }
}

export function saveDraft(storage: DraftStorage, draft: BookingDraft, now: number): boolean {
  try {
    sweepDrafts(storage, now)
    storage.setItem(draftKey(draft.trainerSlug, draft.draftId), JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

/** Recupera y CONSUME el borrador (se borra al leerlo, sea válido o no). */
export function takeDraft(
  storage: DraftStorage,
  expected: { trainerSlug: string; draftId: string; now: number; allowedDurations: readonly number[] }
): BookingDraft | null {
  if (!isValidTrainerSlug(expected.trainerSlug) || !isDraftId(expected.draftId)) return null
  try {
    const key = draftKey(expected.trainerSlug, expected.draftId)
    const raw = storage.getItem(key)
    storage.removeItem(key)
    sweepDrafts(storage, expected.now)
    if (!raw) return null
    return parseDraft(JSON.parse(raw), expected)
  } catch {
    return null
  }
}

/** localStorage si existe y se deja usar; si no, null. */
export function browserDraftStorage(): DraftStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    return null
  }
}

/**
 * Lee el borrador SIN consumirlo, para que un refresco tras volver del login
 * no pierda la selección mientras no caduque. Si está caducado, es de otro
 * entrenador/id o no pasa parseDraft, se borra y devuelve null. Mismas
 * garantías que takeDraft: lo recuperado sigue sin ser de fiar.
 */
export function peekDraft(
  storage: DraftStorage,
  expected: { trainerSlug: string; draftId: string; now: number; allowedDurations: readonly number[] }
): BookingDraft | null {
  if (!isValidTrainerSlug(expected.trainerSlug) || !isDraftId(expected.draftId)) return null
  try {
    const key = draftKey(expected.trainerSlug, expected.draftId)
    const raw = storage.getItem(key)
    sweepDrafts(storage, expected.now)
    if (!raw) return null
    let parsed: BookingDraft | null = null
    try {
      parsed = parseDraft(JSON.parse(raw), expected)
    } catch {
      parsed = null
    }
    if (!parsed) storage.removeItem(key)
    return parsed
  } catch {
    return null
  }
}

/**
 * Actualiza la selección de un borrador vivo (sesiones, duración, jugadores)
 * SIN alargar su caducidad y copiando solo esos campos: nunca datos personales.
 * Devuelve el borrador guardado, o null si no se pudo (caducado, inválido o
 * almacenamiento no disponible); en ese caso el que hubiera se borra.
 */
export function updateDraftSelection(
  storage: DraftStorage,
  draft: BookingDraft,
  selection: { sessions: Array<{ date: string; time: string }>; duration: number; playerCount: number },
  expected: { now: number; allowedDurations: readonly number[] }
): BookingDraft | null {
  const next = parseDraft(
    {
      version: DRAFT_VERSION,
      draftId: draft.draftId,
      trainerSlug: draft.trainerSlug,
      sessions: selection.sessions.map(({ date, time }) => ({ date, time: time.slice(0, 5) })),
      duration: selection.duration,
      playerCount: selection.playerCount,
      expiresAt: draft.expiresAt,
    },
    { trainerSlug: draft.trainerSlug, draftId: draft.draftId, now: expected.now, allowedDurations: expected.allowedDurations }
  )
  try {
    if (!next) {
      storage.removeItem(draftKey(draft.trainerSlug, draft.draftId))
      return null
    }
    storage.setItem(draftKey(next.trainerSlug, next.draftId), JSON.stringify(next))
    return next
  } catch {
    return null
  }
}

/** Borra un borrador (tras reservar, o si ya no sirve). */
export function discardDraft(storage: DraftStorage, trainerSlug: string, draftId: string): void {
  try {
    storage.removeItem(draftKey(trainerSlug, draftId))
  } catch {
    // Almacenamiento no disponible: nada que borrar.
  }
}
