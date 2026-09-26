import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateSlotsForTrainer, WindowSyncError, type GenerateSummary } from './generate'

/**
 * Sincronizar las ventanas tras un cambio de horario (o a mano) y, si falla,
 * decirlo claro. generateSlotsForTrainer aplica todo en una transacción
 * (migrations/014): si falla, la disponibilidad publicada NO ha cambiado.
 *
 *   saved = true   el cambio de horario/excepción ya se guardó antes (la ruta
 *                  lo escribió); lo que falló es pasarlo a los huecos.
 *   saved = false  «Sincronizar huecos»: no había nada más que guardar.
 *
 * Respuesta de fallo: 500 { success: false, code: 'sync_failed', saved, outcome, error }.
 *   outcome = 'not_applied'  la base rechazó el plan: la transacción se deshizo.
 *   outcome = 'unknown'      se perdió la respuesta tras mandar el plan: pudo
 *                            aplicarse o no. El mensaje NO dice que no cambió.
 * La interfaz no debe presentarlo como guardado/sincronizado.
 */
export const SYNC_FAILED_CODE = 'sync_failed'

export type SyncFailureOutcome = 'not_applied' | 'unknown'

export function syncFailedMessage(saved: boolean, missingMigration: boolean, outcome: SyncFailureOutcome = 'not_applied'): string {
  if (outcome === 'unknown') {
    return saved
      ? 'Tu cambio se ha guardado, pero no hemos podido confirmar si tu disponibilidad publicada se ha actualizado (se perdió la respuesta). Recarga la página para ver cómo ha quedado y, si hace falta, pulsa «Sincronizar huecos».'
      : 'No hemos podido confirmar si la sincronización se ha aplicado (se perdió la respuesta). Recarga la página para ver tu disponibilidad actual y vuelve a sincronizar si hace falta.'
  }
  const base = saved
    ? 'Tu cambio se ha guardado, pero tu disponibilidad publicada NO se ha actualizado: sigue exactamente como antes.'
    : 'No se ha sincronizado: tu disponibilidad publicada no ha cambiado.'
  return missingMigration
    ? `${base} Falta aplicar las migraciones 014 y 016 en la base de datos.`
    : `${base} Vuelve a intentarlo con «Sincronizar huecos».`
}

export type SyncOutcome = { ok: true; summary: GenerateSummary } | { ok: false; response: NextResponse }

/** Intentos si el plan llega viejo (otro cambio de horario entre medias, 016). */
export const STALE_RETRIES = 3

export async function syncWindows(supabase: SupabaseClient, trainerId: string, saved: boolean): Promise<SyncOutcome> {
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return { ok: true, summary: await generateSlotsForTrainer(supabase, trainerId) }
      } catch (error) {
        // Plan calculado con un horario que ya cambió: no se aplicó nada; se recalcula.
        if (error instanceof WindowSyncError && error.stale && attempt < STALE_RETRIES) continue
        throw error
      }
    }
  } catch (error) {
    const missingMigration = error instanceof WindowSyncError && error.missingMigration
    // Solo es "desconocido" si el plan llegó a mandarse sin respuesta de la
    // base; cualquier fallo anterior (lecturas, cálculo) no escribió nada.
    const outcome: SyncFailureOutcome = error instanceof WindowSyncError && error.outcomeUnknown ? 'unknown' : 'not_applied'
    console.error('Sincronización de ventanas fallida:', { outcome, message: error instanceof Error ? error.message : String(error) })
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, code: SYNC_FAILED_CODE, saved, outcome, error: syncFailedMessage(saved, missingMigration, outcome) },
        { status: 500 }
      ),
    }
  }
}
