import type { SupabaseClient } from '@supabase/supabase-js'
import { isSlotOpen, reservationHoldsSlot } from './slot-status'

/**
 * CRUD de `availability_slots` del entrenador de la sesión (Fase D).
 * Comparte el mismo predicado (`isSlotOpen`/`reservationHoldsSlot`) que el
 * resto del proyecto: un hueco `pending` o `full`, o con una reserva viva
 * encima, no se puede borrar sin decidir antes esa reserva desde Reservas.
 */

/** Únicos valores reales de `class_type` (docs/DATABASE.md, tabla `class_types`). */
export const CLASS_TYPES = ['private', 'group', 'academy'] as const
export type ClassType = (typeof CLASS_TYPES)[number]

export interface NewSlotInput {
  session_date?: unknown
  start_time?: unknown
  end_time?: unknown
  class_type?: unknown
}

export type ParsedSlot =
  | { ok: true; values: { session_date: string; start_time: string; end_time: string; class_type: ClassType } }
  | { ok: false; message: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function toStoredTime(value: string): string {
  // El input llega "HH:MM" (input type=time); la base guarda "HH:MM:SS".
  return `${value}:00`
}

/** Valida los campos de un hueco nuevo. No toca la base. */
export function parseNewSlot(input: NewSlotInput): ParsedSlot {
  const date = typeof input.session_date === 'string' ? input.session_date.trim() : ''
  const start = typeof input.start_time === 'string' ? input.start_time.trim() : ''
  const end = typeof input.end_time === 'string' ? input.end_time.trim() : ''
  const classType = typeof input.class_type === 'string' ? input.class_type.trim() : ''

  if (!DATE_RE.test(date)) return { ok: false, message: 'Fecha inválida' }
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return { ok: false, message: 'Hora inválida' }
  if (end <= start) return { ok: false, message: 'La hora de fin tiene que ser posterior a la de inicio' }
  if (!CLASS_TYPES.includes(classType as ClassType)) {
    return { ok: false, message: `Tipo de clase inválido (${CLASS_TYPES.join(', ')})` }
  }

  // Hoy o en el futuro, en la zona horaria del servidor (basta para el MVP:
  // rechaza fechas ya pasadas por completo, no huecos "de hoy pero ya pasados").
  const today = new Date().toISOString().slice(0, 10)
  if (date < today) return { ok: false, message: 'No se puede abrir un hueco en una fecha pasada' }

  return {
    ok: true,
    values: { session_date: date, start_time: toStoredTime(start), end_time: toStoredTime(end), class_type: classType as ClassType },
  }
}

export type CreateSlotResult = { ok: true; id: string } | { ok: false; status: number; message: string }

/** Crea un hueco `available` del entrenador de la sesión. */
export async function createSlot(supabase: SupabaseClient, trainerId: string, input: NewSlotInput): Promise<CreateSlotResult> {
  const parsed = parseNewSlot(input)
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message }

  // Evita duplicados exactos (mismo trainer/fecha/hora/tipo): visualmente se
  // solaparían en el calendario y no aportan nada.
  const { data: existing, error: existingError } = await supabase
    .from('availability_slots')
    .select('id')
    .eq('trainer_id', trainerId)
    .eq('session_date', parsed.values.session_date)
    .eq('start_time', parsed.values.start_time)
    .eq('class_type', parsed.values.class_type)
    .maybeSingle()
  if (existingError) return { ok: false, status: 500, message: existingError.message }
  if (existing) return { ok: false, status: 409, message: 'Ya tienes un hueco de ese tipo a esa hora' }

  const { data, error } = await supabase
    .from('availability_slots')
    .insert({
      trainer_id: trainerId,
      session_date: parsed.values.session_date,
      start_time: parsed.values.start_time,
      end_time: parsed.values.end_time,
      class_type: parsed.values.class_type,
      status: 'available',
      current_bookings: 0,
      max_capacity: 1,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, status: 500, message: error?.message ?? 'No se pudo crear el hueco' }
  return { ok: true, id: data.id }
}

export type DeleteSlotResult = { ok: true } | { ok: false; status: number; message: string }

/**
 * Borra un hueco del entrenador de la sesión. Bloqueado si está ocupado
 * (`pending`/`full`) o tiene una reserva viva encima: hay que decidir esa
 * reserva desde Reservas antes de poder tocar el hueco.
 */
export async function deleteSlot(supabase: SupabaseClient, trainerId: string, slotId: string): Promise<DeleteSlotResult> {
  const { data, error } = await supabase
    .from('availability_slots')
    .select('id, trainer_id, status, current_bookings, max_capacity, reservations ( id, status )')
    .eq('id', slotId)
    .maybeSingle()
  if (error) return { ok: false, status: 500, message: error.message }
  if (!data) return { ok: false, status: 404, message: 'Ese hueco no existe' }

  const { reservations, ...slot } = data as unknown as {
    id: string
    trainer_id: string
    status: string | null
    current_bookings: number | null
    max_capacity: number | null
    reservations: Array<{ id: string; status: string | null }> | null
  }
  if (slot.trainer_id !== trainerId) return { ok: false, status: 403, message: 'Ese hueco no es tuyo' }

  const holder = (reservations ?? []).find((r) => reservationHoldsSlot(r.status))
  if (holder || !isSlotOpen(slot)) {
    return {
      ok: false,
      status: 409,
      message: 'Hay una reserva sobre este hueco. Gestiónala primero desde Reservas.',
    }
  }

  const { error: deleteError } = await supabase.from('availability_slots').delete().eq('id', slotId)
  if (deleteError) return { ok: false, status: 500, message: deleteError.message }
  return { ok: true }
}
