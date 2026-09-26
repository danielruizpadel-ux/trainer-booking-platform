import { UNKNOWN_PURGE_MESSAGE, UNKNOWN_SYNC_MESSAGE, type ApiResult } from './api'

/**
 * Qué decir tras «Sincronizar huecos». Las dos operaciones van en serie (la
 * limpieza solo si la sincronización se confirmó), y cada una se informa por
 * separado, sin afirmar lo que no se sabe:
 *
 *   sync   ok → resumen · failed → mensaje del servidor (dice si no se aplicó
 *          o si no se sabe) · unknown → no se sabe si se aplicó.
 *   purge  null (no se hizo) · ok → cuántos · failed/unknown → puede haberse
 *          hecho en parte (borra una a una).
 */
export interface ReportLine {
  tone: 'ok' | 'warning' | 'error'
  text: string
}

export interface SyncReport {
  sync: ReportLine
  purge: ReportLine
}

type Summary = { created?: number; removed?: number; closed?: number; reopened?: number; keptReferenced?: number }

export function describeSync(sync: ApiResult, purge: ApiResult | null): SyncReport {
  let syncLine: ReportLine
  if (sync.kind === 'ok') {
    const s = (sync.data.summary ?? {}) as Summary
    const parts = [`${s.created ?? 0} creados`, `${s.removed ?? 0} eliminados`]
    if ((s.closed ?? 0) > 0) parts.push(`${s.closed} cerrados`)
    if ((s.reopened ?? 0) > 0) parts.push(`${s.reopened} reabiertos`)
    if ((s.keptReferenced ?? 0) > 0) parts.push(`${s.keptReferenced} conservados porque tienen reservas`)
    syncLine = { tone: 'ok', text: `Huecos sincronizados: ${parts.join(', ')}.` }
  } else if (sync.kind === 'failed') {
    syncLine = { tone: 'error', text: sync.message }
  } else {
    syncLine = { tone: 'error', text: UNKNOWN_SYNC_MESSAGE }
  }

  let purgeLine: ReportLine
  if (purge === null) {
    purgeLine = { tone: 'warning', text: 'No se ha hecho la limpieza de huecos antiguos (va después de sincronizar).' }
  } else if (purge.kind === 'ok') {
    const removed = Number(purge.data.removed ?? 0)
    const kept = Number(purge.data.skippedWithHistory ?? 0) + Number(purge.data.skippedReferenced ?? 0)
    purgeLine = {
      tone: 'ok',
      text: `Limpieza de huecos antiguos: ${removed} eliminados${kept > 0 ? `, ${kept} conservados porque tienen reservas` : ''}.`,
    }
  } else {
    purgeLine = { tone: 'warning', text: UNKNOWN_PURGE_MESSAGE }
  }
  return { sync: syncLine, purge: purgeLine }
}
