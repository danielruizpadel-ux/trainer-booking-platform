import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDateStr, toDateStr } from '@/lib/dateUtils'
import { isSlotOpen, reservationHoldsSlot } from './slot-status'

/**
 * Generador: a partir de la plantilla semanal + excepciones (migración 005),
 * crea o borra las filas reales de `availability_slots` de las próximas
 * `weeksAhead` semanas. Es lo único que traduce la plantilla en huecos que
 * ve el cliente; el widget público y `POST /api/reservations` no saben que
 * la plantilla existe.
 *
 * Regla de seguridad, la misma que en todo el proyecto: un hueco con una
 * reserva viva encima (`reservationHoldsSlot`) NUNCA se borra ni se toca,
 * aunque el patrón haya cambiado. Solo se borran huecos que:
 *   - los creó este generador (`generated_by_pattern = true`), y
 *   - siguen `available` y sin reserva viva, y
 *   - ya no forman parte del patrón para esa fecha.
 * Un hueco añadido a mano (botón "Añadir hueco") tiene `generated_by_pattern
 * = false` y el generador no lo toca nunca, esté o no ocupado.
 */

interface WeeklyRow {
  day_of_week: number
  start_time: string
  end_time: string
  class_type: string
}

interface OverrideRow {
  override_date: string
  is_blocked: boolean
  start_time: string | null
  end_time: string | null
  class_type: string | null
}

interface ExistingSlotRow {
  id: string
  session_date: string
  start_time: string
  end_time: string
  class_type: string
  status: string | null
  current_bookings: number | null
  max_capacity: number | null
  generated_by_pattern: boolean
  reservations: Array<{ id: string; status: string | null }> | null
}

interface DesiredRange {
  start_time: string
  end_time: string
  class_type: string
}

export interface GenerateSummary {
  created: number
  removed: number
  keptOccupied: number
}

function rangeKey(startTime: string, classType: string): string {
  return `${startTime}__${classType}`
}

export async function generateSlotsForTrainer(supabase: SupabaseClient, trainerId: string, weeksAhead = 8): Promise<GenerateSummary> {
  const today = toDateStr(new Date())
  const endDate = toDateStr(addDays(parseDateStr(today), weeksAhead * 7))

  const [{ data: weeklyData, error: weeklyError }, { data: overrideData, error: overrideError }, { data: slotData, error: slotError }] =
    await Promise.all([
      supabase
        .from('trainer_weekly_hours')
        .select('day_of_week, start_time, end_time, class_type')
        .eq('trainer_id', trainerId)
        .eq('enabled', true),
      supabase
        .from('trainer_availability_overrides')
        .select('override_date, is_blocked, start_time, end_time, class_type')
        .eq('trainer_id', trainerId)
        .gte('override_date', today)
        .lte('override_date', endDate),
      supabase
        .from('availability_slots')
        .select(
          'id, session_date, start_time, end_time, class_type, status, current_bookings, max_capacity, generated_by_pattern, ' +
            'reservations ( id, status )'
        )
        .eq('trainer_id', trainerId)
        .gte('session_date', today)
        .lte('session_date', endDate),
    ])

  if (weeklyError) throw new Error(weeklyError.message)
  if (overrideError) throw new Error(overrideError.message)
  if (slotError) throw new Error(slotError.message)

  const weekly = (weeklyData ?? []) as WeeklyRow[]
  const overrides = (overrideData ?? []) as OverrideRow[]
  const existingSlots = (slotData ?? []) as unknown as ExistingSlotRow[]

  const weeklyByDay = new Map<number, WeeklyRow[]>()
  for (const row of weekly) {
    const list = weeklyByDay.get(row.day_of_week) ?? []
    list.push(row)
    weeklyByDay.set(row.day_of_week, list)
  }

  const overridesByDate = new Map<string, OverrideRow[]>()
  for (const row of overrides) {
    const list = overridesByDate.get(row.override_date) ?? []
    list.push(row)
    overridesByDate.set(row.override_date, list)
  }

  const existingByDate = new Map<string, ExistingSlotRow[]>()
  for (const row of existingSlots) {
    const list = existingByDate.get(row.session_date) ?? []
    list.push(row)
    existingByDate.set(row.session_date, list)
  }

  const toInsert: Array<{ trainer_id: string; session_date: string; start_time: string; end_time: string; class_type: string }> = []
  const toDelete: string[] = []
  const toUpdateEndTime: Array<{ id: string; end_time: string }> = []
  let keptOccupied = 0

  let cursor = parseDateStr(today)
  const last = parseDateStr(endDate)
  while (cursor <= last) {
    const date = toDateStr(cursor)
    const dayOverrides = overridesByDate.get(date) ?? []
    const blocked = dayOverrides.some((o) => o.is_blocked)

    let desired: DesiredRange[]
    if (blocked) {
      desired = []
    } else if (dayOverrides.length > 0) {
      desired = dayOverrides
        .filter((o) => !o.is_blocked && o.start_time && o.end_time)
        .map((o) => ({ start_time: o.start_time as string, end_time: o.end_time as string, class_type: o.class_type ?? 'private' }))
    } else {
      const dayOfWeek = (cursor.getDay() + 6) % 7
      desired = (weeklyByDay.get(dayOfWeek) ?? []).map((r) => ({ start_time: r.start_time, end_time: r.end_time, class_type: r.class_type }))
    }

    const desiredByKey = new Map(desired.map((d) => [rangeKey(d.start_time, d.class_type), d]))
    const existingForDate = existingByDate.get(date) ?? []
    const existingKeysSeen = new Set<string>()
    // El unique constraint real de `availability_slots` es
    // (trainer_id, session_date, start_time, end_time) — NO distingue
    // class_type. Cualquier fila que ya ocupe ese horario ese día (sea del
    // generador, manual, u ocupada) bloquea un INSERT ahí, así que hay que
    // registrar también por start_time+end_time para no violar el unique
    // constraint al insertar (antes se ignoraban aquí las filas manuales,
    // lo que producía "duplicate key value violates unique constraint
    // availability_slots_trainer_id_session_date_start_time_end_t_key").
    const existingTimeRangesSeen = new Set<string>()

    for (const slot of existingForDate) {
      const key = rangeKey(slot.start_time, slot.class_type)
      const timeRangeKey = `${slot.start_time}__${slot.end_time}`
      existingTimeRangesSeen.add(timeRangeKey)
      const holder = (slot.reservations ?? []).find((r) => reservationHoldsSlot(r.status))
      const occupied = Boolean(holder) || !isSlotOpen(slot)
      const wanted = desiredByKey.get(key)

      if (!slot.generated_by_pattern) {
        // Añadido a mano: el generador no lo toca, esté o no en el patrón.
        existingKeysSeen.add(key)
        continue
      }

      if (occupied) {
        keptOccupied += 1
        existingKeysSeen.add(key) // no crear un duplicado encima de una reserva
        continue
      }

      if (!wanted) {
        toDelete.push(slot.id)
        continue
      }

      existingKeysSeen.add(key)
      if (wanted.end_time !== slot.end_time) {
        toUpdateEndTime.push({ id: slot.id, end_time: wanted.end_time })
      }
    }

    for (const [key, range] of desiredByKey) {
      if (existingKeysSeen.has(key)) continue
      const timeRangeKey = `${range.start_time}__${range.end_time}`
      if (existingTimeRangesSeen.has(timeRangeKey)) {
        // Ya hay un hueco (manual, o de otro class_type) exactamente a esa
        // hora ese día — insertar otro violaría el unique constraint de la
        // base. Se deja como está: ese hueco ya cubre la disponibilidad.
        continue
      }
      toInsert.push({
        trainer_id: trainerId,
        session_date: date,
        start_time: range.start_time,
        end_time: range.end_time,
        class_type: range.class_type,
      })
    }

    cursor = addDays(cursor, 1)
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('availability_slots').insert(
      toInsert.map((slot) => ({
        ...slot,
        status: 'available',
        current_bookings: 0,
        max_capacity: 1,
        generated_by_pattern: true,
        created_at: new Date().toISOString(),
      }))
    )
    if (error) throw new Error(error.message)
  }

  if (toDelete.length > 0) {
    const { error } = await supabase.from('availability_slots').delete().in('id', toDelete)
    if (error) throw new Error(error.message)
  }

  for (const update of toUpdateEndTime) {
    const { error } = await supabase
      .from('availability_slots')
      .update({ end_time: update.end_time, updated_at: new Date().toISOString() })
      .eq('id', update.id)
    if (error) throw new Error(error.message)
  }

  return { created: toInsert.length, removed: toDelete.length, keptOccupied }
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}
