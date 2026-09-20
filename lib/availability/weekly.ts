import type { SupabaseClient } from '@supabase/supabase-js'
import { CLASS_TYPES, type ClassType } from './class-types'

/**
 * Plantilla de horario semanal recurrente (migración 005). Un día (0=lunes
 * … 6=domingo) puede tener varios rangos; `enabled` se guarda por rango pero
 * se cambia siempre junto para todos los rangos de un día (un solo toggle en
 * la interfaz, como en Cal.com).
 */
export interface WeeklyRange {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  class_type: string
  enabled: boolean
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const DEFAULT_RANGE = { start: '09:00', end: '17:00' } as const

function toStoredTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value
}

export async function listWeeklyHours(supabase: SupabaseClient, trainerId: string): Promise<WeeklyRange[]> {
  const { data, error } = await supabase
    .from('trainer_weekly_hours')
    .select('id, day_of_week, start_time, end_time, class_type, enabled')
    .eq('trainer_id', trainerId)
    .order('day_of_week')
    .order('start_time')
  if (error) throw new Error(error.message)
  return (data ?? []) as WeeklyRange[]
}

export type WeeklyResult = { ok: true } | { ok: false; status: number; message: string }
export type WeeklyRangeResult = { ok: true; id: string } | { ok: false; status: number; message: string }

/**
 * Enciende/apaga un día entero. Si se enciende y no tiene ningún rango
 * todavía, crea uno por defecto (09:00–17:00) para que el día no quede
 * "encendido" pero vacío.
 */
export async function setDayEnabled(
  supabase: SupabaseClient,
  trainerId: string,
  dayOfWeek: number,
  enabled: boolean
): Promise<WeeklyResult> {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return { ok: false, status: 400, message: 'Día inválido' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('trainer_weekly_hours')
    .select('id')
    .eq('trainer_id', trainerId)
    .eq('day_of_week', dayOfWeek)
  if (existingError) return { ok: false, status: 500, message: existingError.message }

  if ((existing ?? []).length === 0) {
    if (!enabled) return { ok: true } // nada que apagar
    const { error: insertError } = await supabase.from('trainer_weekly_hours').insert({
      trainer_id: trainerId,
      day_of_week: dayOfWeek,
      start_time: `${DEFAULT_RANGE.start}:00`,
      end_time: `${DEFAULT_RANGE.end}:00`,
      class_type: 'private',
      enabled: true,
    })
    if (insertError) return { ok: false, status: 500, message: insertError.message }
    return { ok: true }
  }

  const { error: updateError } = await supabase
    .from('trainer_weekly_hours')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('trainer_id', trainerId)
    .eq('day_of_week', dayOfWeek)
  if (updateError) return { ok: false, status: 500, message: updateError.message }
  return { ok: true }
}

export interface NewRangeInput {
  day_of_week?: unknown
  start_time?: unknown
  end_time?: unknown
  class_type?: unknown
}

function parseRange(input: NewRangeInput): { ok: true; day: number; start: string; end: string; classType: ClassType } | { ok: false; message: string } {
  const day = Number(input.day_of_week)
  const start = typeof input.start_time === 'string' ? input.start_time.trim() : ''
  const end = typeof input.end_time === 'string' ? input.end_time.trim() : ''
  const classType = typeof input.class_type === 'string' && input.class_type ? input.class_type.trim() : 'private'

  if (!Number.isInteger(day) || day < 0 || day > 6) return { ok: false, message: 'Día inválido' }
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return { ok: false, message: 'Hora inválida' }
  if (end <= start) return { ok: false, message: 'La hora de fin tiene que ser posterior a la de inicio' }
  if (!CLASS_TYPES.includes(classType as ClassType)) return { ok: false, message: `Tipo de clase inválido (${CLASS_TYPES.join(', ')})` }

  return { ok: true, day, start, end, classType: classType as ClassType }
}

/** Añade un rango horario a un día. El día queda encendido automáticamente. */
export async function addWeeklyRange(supabase: SupabaseClient, trainerId: string, input: NewRangeInput): Promise<WeeklyRangeResult> {
  const parsed = parseRange(input)
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message }

  const { data, error } = await supabase
    .from('trainer_weekly_hours')
    .insert({
      trainer_id: trainerId,
      day_of_week: parsed.day,
      start_time: toStoredTime(parsed.start),
      end_time: toStoredTime(parsed.end),
      class_type: parsed.classType,
      enabled: true,
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, status: 500, message: error?.message ?? 'No se pudo añadir el rango' }
  return { ok: true, id: data.id }
}

/** Cambia las horas (y opcionalmente el tipo) de un rango existente. */
export async function updateWeeklyRange(
  supabase: SupabaseClient,
  trainerId: string,
  rangeId: string,
  input: NewRangeInput
): Promise<WeeklyResult> {
  const start = typeof input.start_time === 'string' ? input.start_time.trim() : ''
  const end = typeof input.end_time === 'string' ? input.end_time.trim() : ''
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return { ok: false, status: 400, message: 'Hora inválida' }
  if (end <= start) return { ok: false, status: 400, message: 'La hora de fin tiene que ser posterior a la de inicio' }

  const { data, error } = await supabase.from('trainer_weekly_hours').select('id, trainer_id').eq('id', rangeId).maybeSingle()
  if (error) return { ok: false, status: 500, message: error.message }
  if (!data) return { ok: false, status: 404, message: 'Ese rango no existe' }
  if (data.trainer_id !== trainerId) return { ok: false, status: 403, message: 'Ese rango no es tuyo' }

  const { error: updateError } = await supabase
    .from('trainer_weekly_hours')
    .update({ start_time: toStoredTime(start), end_time: toStoredTime(end), updated_at: new Date().toISOString() })
    .eq('id', rangeId)
  if (updateError) return { ok: false, status: 500, message: updateError.message }
  return { ok: true }
}

/** Borra un rango horario del entrenador de la sesión. */
export async function deleteWeeklyRange(supabase: SupabaseClient, trainerId: string, rangeId: string): Promise<WeeklyResult> {
  const { data, error } = await supabase.from('trainer_weekly_hours').select('id, trainer_id').eq('id', rangeId).maybeSingle()
  if (error) return { ok: false, status: 500, message: error.message }
  if (!data) return { ok: false, status: 404, message: 'Ese rango no existe' }
  if (data.trainer_id !== trainerId) return { ok: false, status: 403, message: 'Ese rango no es tuyo' }

  const { error: deleteError } = await supabase.from('trainer_weekly_hours').delete().eq('id', rangeId)
  if (deleteError) return { ok: false, status: 500, message: deleteError.message }
  return { ok: true }
}
