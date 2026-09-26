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
 * Respuesta de fallo: 500 { success: false, code: 'sync_failed', saved, error }.
 * La interfaz no debe presentarlo como guardado/sincronizado.
 */
export const SYNC_FAILED_CODE = 'sync_failed'

export function syncFailedMessage(saved: boolean, missingMigration: boolean): string {
  const base = saved
    ? 'Tu cambio se ha guardado, pero tu disponibilidad publicada NO se ha actualizado: sigue exactamente como antes.'
    : 'No se ha sincronizado: tu disponibilidad publicada no ha cambiado.'
  return missingMigration
    ? `${base} Falta aplicar la migración 014 en la base de datos.`
    : `${base} Vuelve a intentarlo con «Sincronizar huecos».`
}

export type SyncOutcome = { ok: true; summary: GenerateSummary } | { ok: false; response: NextResponse }

export async function syncWindows(supabase: SupabaseClient, trainerId: string, saved: boolean): Promise<SyncOutcome> {
  try {
    return { ok: true, summary: await generateSlotsForTrainer(supabase, trainerId) }
  } catch (error) {
    const missingMigration = error instanceof WindowSyncError && error.missingMigration
    console.error('Sincronización de ventanas fallida:', error instanceof Error ? error.message : String(error))
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, code: SYNC_FAILED_CODE, saved, error: syncFailedMessage(saved, missingMigration) },
        { status: 500 }
      ),
    }
  }
}
