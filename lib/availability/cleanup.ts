import type { SupabaseClient } from '@supabase/supabase-js'
import { reservationHoldsSlot } from './slot-status'
import { deleteEmptyWindows } from './delete-windows'

/**
 * Purga puntual (21/09/2026, a petición de Daniel tras encontrar el hallazgo
 * de huecos legacy): huecos `generated_by_pattern = false` (protegidos para
 * siempre por el generador normal, ver generate.ts) que en realidad son
 * restos de ANTES de la migración 005 — esa migración añadió la columna con
 * default `false`, así que toda fila que ya existía quedó marcada "manual"
 * sin haberla creado nadie a mano con el botón "Añadir hueco".
 *
 * Nunca toca: huecos con una reserva viva encima (`reservationHoldsSlot`),
 * ni huecos de fechas pasadas. Solo futuros, libres, y creados antes del
 * cutoff (el rediseño de horario semanal, Fase D, es del 20/09/2026).
 *
 * 26/09/2026: la FK de reservations a availability_slots era ON DELETE
 * CASCADE en la base real. Un hueco con reservas NO vivas (canceladas) se
 * borraba llevándose ese historial, y una reserva que entrase entre la
 * lectura y el borrado (p. ej. una clase puntual que reutiliza la ventana)
 * se borraba también. Ahora tampoco se proponen huecos con cualquier
 * reserva (`skippedWithHistory`), y el borrado va por deleteEmptyWindows:
 * con la migración 013 (ON DELETE RESTRICT) la base rechaza el de una
 * ventana que ganó una reserva y esa ventana se queda (`skippedReferenced`).
 */

const REDESIGN_CUTOFF = '2026-09-20T00:00:00Z'

interface CandidateRow {
  id: string
  session_date: string
  start_time: string
  end_time: string
  class_type: string
  created_at: string
  reservations: Array<{ id: string; status: string | null }> | null
}

export interface LegacyPurgeResult {
  candidates: Array<{ id: string; session_date: string; start_time: string; end_time: string; created_at: string }>
  skippedOccupied: number
  /** Sin reserva viva pero con reservas canceladas/terminadas: no se borran (historial) */
  skippedWithHistory: number
}

async function findLegacyManualSlots(supabase: SupabaseClient, trainerId: string, today: string): Promise<LegacyPurgeResult> {
  const { data, error } = await supabase
    .from('availability_slots')
    .select('id, session_date, start_time, end_time, class_type, created_at, reservations ( id, status )')
    .eq('trainer_id', trainerId)
    .eq('generated_by_pattern', false)
    .gte('session_date', today)
    .lt('created_at', REDESIGN_CUTOFF)
    .order('session_date')
    .order('start_time')

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as CandidateRow[]
  const candidates: LegacyPurgeResult['candidates'] = []
  let skippedOccupied = 0
  let skippedWithHistory = 0

  for (const row of rows) {
    const holder = (row.reservations ?? []).find((r) => reservationHoldsSlot(r.status))
    if (holder) {
      skippedOccupied += 1
      continue
    }
    if ((row.reservations ?? []).length > 0) {
      skippedWithHistory += 1
      continue
    }
    candidates.push({
      id: row.id,
      session_date: row.session_date,
      start_time: row.start_time,
      end_time: row.end_time,
      created_at: row.created_at,
    })
  }

  return { candidates, skippedOccupied, skippedWithHistory }
}

export async function dryRunLegacyPurge(supabase: SupabaseClient, trainerId: string, today: string): Promise<LegacyPurgeResult> {
  return findLegacyManualSlots(supabase, trainerId, today)
}

export async function executeLegacyPurge(
  supabase: SupabaseClient,
  trainerId: string,
  today: string
): Promise<{ removed: number; skippedOccupied: number; skippedWithHistory: number; skippedReferenced: number }> {
  const { candidates, skippedOccupied, skippedWithHistory } = await findLegacyManualSlots(supabase, trainerId, today)
  if (candidates.length === 0) return { removed: 0, skippedOccupied, skippedWithHistory, skippedReferenced: 0 }

  const result = await deleteEmptyWindows(supabase, candidates.map((c) => c.id))
  return { removed: result.deleted, skippedOccupied, skippedWithHistory, skippedReferenced: result.kept.length }
}
