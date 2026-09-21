import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeDurations, type ClassDuration } from './durations'

/** Duraciones que ofrece un entrenador (`trainers.class_durations`, migración 007). */
export async function getTrainerDurations(supabase: SupabaseClient, trainerId: string): Promise<ClassDuration[]> {
  const { data, error } = await supabase.from('trainers').select('class_durations').eq('id', trainerId).maybeSingle()
  if (error) {
    // 42703: migración 007 sin aplicar → solo 1 h, como hasta ahora.
    if (error.code !== '42703') console.warn('No se pudieron leer las duraciones del entrenador:', error.message)
    return normalizeDurations(null)
  }
  return normalizeDurations(data?.class_durations)
}

export type SetDurationsResult = { ok: true; durations: ClassDuration[] } | { ok: false; status: number; message: string }

export async function setTrainerDurations(supabase: SupabaseClient, trainerId: string, values: unknown): Promise<SetDurationsResult> {
  const list = Array.isArray(values) ? values.map(Number) : []
  if (list.length === 0 || list.some((v) => v !== 60 && v !== 90)) {
    return { ok: false, status: 400, message: 'Elige al menos una duración: 1 h y/o 1 h 30 min' }
  }
  const durations = normalizeDurations(list)
  const { error } = await supabase
    .from('trainers')
    .update({ class_durations: durations, updated_at: new Date().toISOString() })
    .eq('id', trainerId)
  if (error) {
    const missing = error.code === '42703'
    return { ok: false, status: 500, message: missing ? 'Falta aplicar migrations/007_class_durations.sql en Supabase' : error.message }
  }
  return { ok: true, durations }
}
