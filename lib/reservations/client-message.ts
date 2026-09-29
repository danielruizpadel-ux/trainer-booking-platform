/**
 * Mensaje opcional del cliente al entrenador (`reservations.client_message`,
 * migración 010). Es texto de la RESERVA, no del perfil, y no son las notas
 * internas del entrenador (`notes`). Puro: lo usan el servidor (validación
 * que manda) y el checkout (contador).
 *
 * Se guarda como texto plano y se pinta SIEMPRE como texto (React, sin
 * dangerouslySetInnerHTML). No se escapa HTML al guardar: se escapa al
 * mostrar. Nunca se escribe en logs.
 */

export const CLIENT_MESSAGE_MAX = 500

// Controles C0/C1 salvo \n, y marcas de dirección (bidi) que permiten
// falsear cómo se ve el texto.
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g
const BIDI_CHARS = /[؜‎‏‪-‮⁦-⁩]/g

/** Longitud en puntos de código Unicode, la misma que char_length() de Postgres. */
export function codePointLength(value: string): number {
  return Array.from(value).length
}

/** Limpieza sin validar la longitud (la usa también el contador del checkout). */
export function normalizeClientMessage(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(BIDI_CHARS, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type ParseClientMessageResult = { ok: true; value: string | null } | { ok: false; message: string }

/** Vacío/ausente → null. Más de 500 → error (no se trunca en silencio). */
export function parseClientMessage(input: unknown): ParseClientMessageResult {
  if (input === undefined || input === null) return { ok: true, value: null }
  if (typeof input !== 'string') return { ok: false, message: 'The message must be text.' }
  const value = normalizeClientMessage(input)
  if (value === '') return { ok: true, value: null }
  if (codePointLength(value) > CLIENT_MESSAGE_MAX) {
    return { ok: false, message: `The message can be at most ${CLIENT_MESSAGE_MAX} characters.` }
  }
  return { ok: true, value }
}
