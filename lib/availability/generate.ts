import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDateStr, toDateStr } from '@/lib/dateUtils'
import { isSlotOpen, reservationHoldsSlot } from './slot-status'

/**
 * Generador: a partir de la plantilla semanal + excepciones (migración 005),
 * crea o borra las VENTANAS reales de `availability_slots` de las próximas
 * `weeksAhead` semanas: una fila por rango y fecha (modelo 007). Las clases
 * de 1 h / 1 h 30 se colocan dentro de cada ventana por solapamiento
 * (lib/availability/windows.ts); aquí no se generan filas por duración, y
 * por eso el unique constraint (trainer, fecha, inicio, fin) no molesta.
 *
 * Regla de seguridad, la misma que en todo el proyecto: un hueco con una
 * reserva viva encima (`reservationHoldsSlot`) NUNCA se borra ni se toca,
 * aunque el patrón haya cambiado. Solo se borran huecos que:
 *   - los creó este generador (`generated_by_pattern = true`), y
 *   - siguen `available` y sin reserva viva, y
 *   - ya no forman parte del patrón para esa fecha.
 * Un hueco añadido a mano (botón "Añadir hueco") tiene `generated_by_pattern
 * = false` y el generador no lo toca nunca, esté o no ocupado.
 *
 * 21/09/2026 (prompt 20, fix de regenerar): `rangeKey` solo mira
 * start_time + class_type, no end_time. Si dos filas `generated_by_pattern`
 * comparten esa clave (p. ej. una fila vieja 09:00–10:00 de antes del
 * horario semanal, y la fila correcta 09:00–17:00 del patrón actual), el
 * código de antes procesaba cada una por su cuenta e intentaba actualizar
 * la que no encajaba al `end_time` deseado — chocando con la otra fila que
 * ya tenía exactamente ese rango (`duplicate key value violates unique
 * constraint ..._start_time_end_t_key`), y abortaba el regenerado entero a
 * mitad de las 8 semanas. Ahora se agrupa por clave: como mucho UNA fila no
 * ocupada por grupo se actualiza (o se deja si ya es exacta); el resto de
 * filas del mismo grupo, si sobran, se borran como duplicados obsoletos.
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
    // constraint al insertar.
    const existingTimeRangesSeen = new Set<string>()
    for (const slot of existingForDate) {
      existingTimeRangesSeen.add(`${slot.start_time}__${slot.end_time}`)
    }

    // Agrupar por clave (start_time + class_type): puede haber varias filas
    // `generated_by_pattern` con la misma clave y distinto end_time (restos
    // de un patrón anterior). Como mucho una se conserva/actualiza por
    // grupo; el resto, si no están ocupadas, se borran.
    const groups = new Map<string, ExistingSlotRow[]>()
    for (const slot of existingForDate) {
      const key = rangeKey(slot.start_time, slot.class_type)
      const list = groups.get(key) ?? []
      list.push(slot)
      groups.set(key, list)
    }

    for (const [key, group] of groups) {
      const wanted = desiredByKey.get(key)
      const manual = group.filter((s) => !s.generated_by_pattern)
      const pattern = group.filter((s) => s.generated_by_pattern)

      // Manual: el generador nunca las toca, estén o no en el patrón.
      if (manual.length > 0) existingKeysSeen.add(key)

      const occupiedOf = (s: ExistingSlotRow) => {
        const holder = (s.reservations ?? []).find((r) => reservationHoldsSlot(r.status))
        return Boolean(holder) || !isSlotOpen(s)
      }

      const occupied = pattern.filter(occupiedOf)
      const free = pattern.filter((s) => !occupiedOf(s))

      if (occupied.length > 0) {
        keptOccupied += occupied.length
        existingKeysSeen.add(key) // no crear/actualizar otra encima de una reserva
      }

      if (!wanted) {
        // Nada del patrón quiere esta clave hoy: toda fila libre sobra.
        for (const s of free) toDelete.push(s.id)
        continue
      }

      // ¿Ya hay una fila EXACTA en el grupo entero (ocupada, manual o
      // libre)? Si la hay, nunca se actualiza nada — actualizar otra fila
      // libre a ese mismo end_time chocaría con ella (unique constraint).
      // Solo sobran las libres que no sean esa exacta.
      const exactExists = group.some((s) => s.end_time === wanted.end_time)
      if (exactExists) {
        existingKeysSeen.add(key)
        for (const s of free) {
          if (s.end_time !== wanted.end_time) toDelete.push(s.id)
        }
        continue
      }

      // Sin exacta en todo el grupo: es seguro actualizar una libre (no
      // puede chocar con nada, nada más en el grupo tiene ese end_time).
      const representative = free[0]
      if (representative) {
        existingKeysSeen.add(key)
        toUpdateEndTime.push({ id: representative.id, end_time: wanted.end_time })
        for (const s of free) {
          if (s.id !== representative.id) toDelete.push(s.id)
        }
      }
      // Si no hay ninguna libre (solo ocupadas o ninguna), se deja que el
      // paso de inserción de abajo cree la que falta.
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
    if (error) throw new Error(`INSERT failed (${toInsert.length} rows): ${error.message}. sample=${JSON.stringify(toInsert.slice(0,3))}`)
  }

  if (toDelete.length > 0) {
    const { error } = await supabase.from('availability_slots').delete().in('id', toDelete)
    if (error) throw new Error(`DELETE failed (${toDelete.length} rows): ${error.message}`)
  }

  for (const update of toUpdateEndTime) {
    const { error } = await supabase
      .from('availability_slots')
      .update({ end_time: update.end_time, updated_at: new Date().toISOString() })
      .eq('id', update.id)
    if (error) throw new Error(`UPDATE failed id=${update.id} end_time=${update.end_time}: ${error.message}`)
  }

  return { created: toInsert.length, removed: toDelete.length, keptOccupied }
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}
