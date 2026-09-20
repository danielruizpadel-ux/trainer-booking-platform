import type { SupabaseClient } from '@supabase/supabase-js'
import { CLASS_TYPES, type ClassType } from './class-types'

/** Excepción puntual sobre el horario semanal para una fecha (migración 005). */
export interface AvailabilityOverride {
  id: string
  override_date: string
  is_blocked: boolean
  start_time: string | null
  end_time: string | null
  class_type: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function toStoredTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value
}

export async function listOverrides(supabase: SupabaseClient, trainerId: string, fromDate: string): Promise<AvailabilityOverride[]> {
  const { data, error } = await supabase
    .from('trainer_availability_overrides')
    .select('id, override_date, is_blocked, start_time, end_time, class_type')
    .eq('trainer_id', trainerId)
    .gte('override_date', fromDate)
    .order('override_date')
    .order('start_time')
  if (error) throw new Error(error.message)
  return (data ?? []) as AvailabilityOverride[]
}

export interface NewOverrideInput {
  override_date?: unknown
  is_blocked?: unknown
  start_time?: unknown
  end_time?: unknown
  class_type?: unknown
}

export type OverrideResult = { ok: true; id: string } | { ok: false; status: number; message: string }

/**
 * Añade una excepción: `is_blocked: true` cierra ese día entero (sin horas);
 * si no, hace falta `start_time`/`end_time` — ese rango sustituye al patrón
 * semanal ese día (se puede llamar varias veces para varios rangos).
 */
export async function addOverride(supabase: SupabaseClient, trainerId: string, input: NewOverrideInput): Promise<OverrideResult> {
  const date = typeof input.override_date === 'string' ? input.override_date.trim() : ''
  if (!DATE_RE.test(date)) return { ok: false, status: 400, message: 'Fecha inválida' }

  const today = new Date().toISOString().slice(0, 10)
  if (date < today) return { ok: false, status: 400, message: 'No se puede añadir una excepción en una fecha pasada' }

  const blocked = input.is_blocked === true

  if (blocked) {
    const { data, error } = await supabase
      .from('trainer_availability_overrides')
      .insert({ trainer_id: trainerId, override_date: date, is_blocked: true, start_time: null, end_time: null, class_type: null })
      .select('id')
      .single()
    if (error || !data) return { ok: false, status: 500, message: error?.message ?? 'No se pudo bloquear la fecha' }
    return { ok: true, id: data.id }
  }

  const start = typeof input.start_time === 'string' ? input.start_time.trim() : ''
  const end = typeof input.end_time === 'string' ? input.end_time.trim() : ''
  const classType = typeof input.class_type === 'string' && input.class_type ? input.class_type.trim() : 'private'
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return { ok: false, status: 400, message: 'Hora inválida' }
  if (end <= start) return { ok: false, status: 400, message: 'La hora de fin tiene que ser posterior a la de inicio' }
  if (!CLASS_TYPES.includes(classType as ClassType)) return { ok: false, status: 400, message: `Tipo de clase inválido (${CLASS_TYPES.join(', ')})` }

  const { data, error } = await supabase
    .from('trainer_availability_overrides')
    .insert({
      trainer_id: trainerId,
      override_date: date,
      is_blocked: false,
      start_time: toStoredTime(start),
      end_time: toStoredTime(end),
      class_type: classType,
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, status: 500, message: error?.message ?? 'No se pudo añadir la excepción' }
  return { ok: true, id: data.id }
}

export type DeleteOverrideResult = { ok: true } | { ok: false; status: number; message: string }

export async function deleteOverride(supabase: SupabaseClient, trainerId: string, overrideId: string): Promise<DeleteOverrideResult> {
  const { data, error } = await supabase.from('trainer_availability_overrides').select('id, trainer_id').eq('id', overrideId).maybeSingle()
  if (error) return { ok: false, status: 500, message: error.message }
  if (!data) return { ok: false, status: 404, message: 'Esa excepción no existe' }
  if (data.trainer_id !== trainerId) return { ok: false, status: 403, message: 'Esa excepción no es tuya' }

  const { error: deleteError } = await supabase.from('trainer_availability_overrides').delete().eq('id', overrideId)
  if (deleteError) return { ok: false, status: 500, message: deleteError.message }
  return { ok: true }
}
