/**
 * Llamadas de la página de Disponibilidad que escriben o sincronizan, con el
 * resultado en tres casos, para no afirmar lo que no se sabe:
 *
 *   ok       el servidor respondió success.
 *   failed   el servidor respondió con un error (JSON). Si es
 *            `sync_failed`, `data.outcome` dice si la sincronización no se
 *            aplicó ('not_applied') o no se sabe ('unknown').
 *   unknown  resultado no confirmado: no hay respuesta legible (red
 *            cortada, respuesta perdida) o no es nuestro JSON (un proxy con
 *            su propio cuerpo): la petición pudo completarse o no.
 */
export type ApiResult =
  | { kind: 'ok'; data: Record<string, unknown> & { success: true } }
  | { kind: 'failed'; data: ApiError; message: string }
  | { kind: 'unknown' }

export interface ApiError {
  success?: boolean
  error?: string
  code?: string
  saved?: boolean
  outcome?: 'not_applied' | 'unknown'
}

export async function callApi(url: string, init: RequestInit | undefined, fallbackError: string): Promise<ApiResult> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    return { kind: 'unknown' }
  }
  const data = (await response.json().catch(() => null)) as (ApiError & Record<string, unknown>) | null
  if (!data || typeof data !== 'object') return { kind: 'unknown' }
  if (response.ok && data.success === true) return { kind: 'ok', data: data as unknown as Record<string, unknown> & { success: true } }
  // Solo es "falló" si es nuestra respuesta de error ({ success: false, error }).
  if (data.success === false && typeof data.error === 'string') return { kind: 'failed', data, message: data.error || fallbackError }
  return { kind: 'unknown' }
}

/** Una escritura (horario, excepción) cuya respuesta se perdió. */
export const UNKNOWN_SAVE_MESSAGE =
  'Resultado no confirmado: no sabemos si el cambio se ha guardado ni si tu disponibilidad publicada se ha actualizado. Recarga la página para ver cómo ha quedado.'

/** «Sincronizar huecos» cuya respuesta se perdió. */
export const UNKNOWN_SYNC_MESSAGE =
  'Resultado no confirmado: no sabemos si la sincronización se ha aplicado. Recarga la página para ver tu disponibilidad actual y vuelve a sincronizar si hace falta.'

/** La limpieza de huecos antiguos cuya respuesta se perdió o que falló a mitad. */
export const UNKNOWN_PURGE_MESSAGE =
  'Limpieza de huecos antiguos no confirmada: puede haberse hecho en parte. Vuelve a pulsar «Sincronizar huecos» para terminarla.'
