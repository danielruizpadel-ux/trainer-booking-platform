import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDateStr, toDateStr } from '@/lib/dateUtils'
import { isSlotOpen, reservationHoldsSlot } from './slot-status'
import { isDatabaseErrorCode } from '@/lib/supabase/error-codes'

/**
 * Generador: a partir de la plantilla semanal + excepciones (migración 005),
 * crea o borra las VENTANAS reales de `availability_slots` de las próximas
 * `weeksAhead` semanas: una fila por rango y fecha (modelo 007). Las clases
 * de 1 h / 1 h 30 se colocan dentro de cada ventana por solapamiento
 * (lib/availability/windows.ts); aquí no se generan filas por duración, y
 * por eso el unique constraint (trainer, fecha, inicio, fin) no molesta.
 *
 * Regla de seguridad, la misma que en todo el proyecto: un hueco con una
 * reserva viva encima (`reservationHoldsSlot`) NUNCA se borra ni se le
 * cambia el rango, aunque el patrón haya cambiado. Solo se borran huecos
 * que:
 *   - los creó este generador (`generated_by_pattern = true`), y
 *   - no tienen ninguna reserva viva, y
 *   - ya no forman parte del patrón para esa fecha.
 * Un hueco añadido a mano (botón "Añadir hueco") tiene `generated_by_pattern
 * = false` y el generador no lo toca nunca, esté o no ocupado.
 *
 * 21/09/2026 (prompt 23, día apagado con reserva dentro): antes, un hueco
 * con reserva que dejaba de estar en el patrón se quedaba `available` tal
 * cual — y el tiempo libre que le sobrara alrededor de la reserva seguía
 * ofreciéndose a clientes nuevos ese día, aunque el entrenador hubiera
 * apagado el día entero. Ahora, cuando un hueco con reserva deja de estar
 * en el patrón, se le pone `status = 'blocked'`: dejan de calcularse horas
 * libres ahí (`isSlotOpen` ya trataba `blocked` como cerrado) pero la fila y
 * la reserva siguen intactas — cancelar la reserva sigue funcionando igual,
 * lo único que cambia es que ya no se ofrece el resto del hueco. Si el
 * patrón vuelve a querer ese hueco más adelante (se reactiva el día), se le
 * quita el `blocked` (`toReopen`) y el `refreshAllWindows` de después
 * recalcula si queda `available` o `full`. Un hueco que quedó `blocked` y ya
 * no tiene ninguna reserva viva (se canceló) se trata como libre de verdad:
 * se borra si el patrón no lo quiere, igual que cualquier otro.
 *
 * 26/09/2026 (FK con ON DELETE CASCADE en la base real): borrar una
 * ventana borraba sus reservas, también las CANCELADAS (historial) y una
 * reserva que entrase entre la lectura y el borrado. Ahora el generador
 * solo pide borrar ventanas SIN NINGUNA fila en reservations. Una ventana
 * que el patrón ya no quiere y solo tiene reservas no vivas se CIERRA
 * (`blocked`) en vez de borrarse ("retirada"); si el patrón la vuelve a
 * querer, se reabre y se reutiliza como una libre.
 *
 * 26/09/2026 (sincronización parcial, revisión de Codex): el plan (qué
 * insertar, borrar, acortar/alargar, cerrar y reabrir) se aplica con
 * apply_window_plan (migrations/014) en UNA transacción que bloquea las
 * ventanas y revalida: una ventana a borrar que ya tiene reservas se cierra
 * (`keptReferenced`); un acortamiento que dejaría fuera una reserva viva
 * cierra la ventana. Si algo falla, no cambia nada y se lanza
 * WindowSyncError: las rutas lo devuelven como `sync_failed`.
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
  closed: number
  reopened: number
  /** Ventanas que se iban a borrar pero la base no dejó (tienen reservas) */
  keptReferenced: number
}

function rangeKey(startTime: string, classType: string): string {
  return `${startTime}__${classType}`
}

export async function generateSlotsForTrainer(supabase: SupabaseClient, trainerId: string, weeksAhead = 8): Promise<GenerateSummary> {
  const today = toDateStr(new Date())
  const endDate = toDateStr(addDays(parseDateStr(today), weeksAhead * 7))

  // Revisión del horario ANTES de leerlo (migrations/016): el plan se aplica
  // solo si nadie lo ha cambiado desde aquí. Si cambia entre esta lectura y
  // la del horario, el plan se rechaza (y syncWindows lo recalcula).
  const { data: trainerRow, error: revisionError } = await supabase
    .from('trainers')
    .select('availability_revision')
    .eq('id', trainerId)
    .maybeSingle()
  if (revisionError || !trainerRow) throw new WindowSyncError(revisionError ?? { code: 'P0002', message: 'trainer_not_found' })
  const revision = Number((trainerRow as { availability_revision: number | string }).availability_revision)

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
  // Hueco con reserva viva que el patrón ya no quiere: se cierra (no se
  // borra ni se toca la reserva) para dejar de ofrecer su tiempo libre.
  const toClose: string[] = []
  // Hueco que estaba `blocked` de un ciclo anterior y el patrón vuelve a
  // querer: se reabre (el refreshAllWindows de después decide available/full).
  const toReopen: string[] = []
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
      // Distinto de `occupiedOf`: si tiene una reserva viva de verdad, no
      // solo si su `status` ya está cerrado por otro motivo (p. ej. un
      // `blocked` de un ciclo anterior sin reserva ya no cuenta como
      // reservado). Decide si hay que CERRAR (con reserva) o se puede
      // borrar sin más (sin reserva) cuando el patrón ya no lo quiere.
      const hasLiveReservation = (s: ExistingSlotRow) => Boolean((s.reservations ?? []).find((r) => reservationHoldsSlot(r.status)))
      // Cualquier fila en reservations, viva o no: una ventana así NUNCA se
      // borra (con CASCADE se llevaría el historial; con RESTRICT, 013, la
      // base lo rechaza).
      const hasAnyReservation = (s: ExistingSlotRow) => (s.reservations ?? []).length > 0
      // Retirada: cerrada por el generador sin reserva viva, pero con
      // historial. Cuenta como libre (se puede reabrir y reutilizar).
      const isRetired = (s: ExistingSlotRow) => s.status === 'blocked' && !hasLiveReservation(s) && hasAnyReservation(s)
      // Quitar una ventana que sobra: borrar si no tiene ninguna reserva; si
      // tiene historial, cerrarla.
      const retire = (s: ExistingSlotRow) => {
        if (!hasAnyReservation(s)) toDelete.push(s.id)
        else if (s.status !== 'blocked') toClose.push(s.id)
      }

      const occupied = pattern.filter((s) => occupiedOf(s) && !isRetired(s))
      // Las no retiradas primero: son las preferidas para conservar/actualizar.
      const free = pattern.filter((s) => !occupiedOf(s) || isRetired(s)).sort((a, b) => Number(isRetired(a)) - Number(isRetired(b)))

      if (occupied.length > 0) {
        keptOccupied += occupied.length
        existingKeysSeen.add(key) // no crear/actualizar otra encima de una reserva
      }

      if (!wanted) {
        // Nada del patrón quiere esta clave hoy: toda fila libre sobra.
        for (const s of free) retire(s)
        // Las "ocupadas": si de verdad tienen una reserva viva, se cierran
        // (status 'blocked') para dejar de ofrecer el resto del hueco, sin
        // tocar la reserva. Si solo estaban cerradas por otro motivo y no
        // tienen ninguna reserva viva, sobran como una libre.
        for (const s of occupied) {
          if (hasLiveReservation(s)) {
            if (s.status !== 'blocked') toClose.push(s.id)
          } else {
            retire(s)
          }
        }
        continue
      }

      // El patrón vuelve a querer esta clave: si alguna ocupada se había
      // cerrado en un ciclo anterior (`blocked`), se reabre — el patrón la
      // reclama otra vez, con o sin reserva viva dentro.
      for (const s of occupied) {
        if (s.status === 'blocked') toReopen.push(s.id)
      }

      // ¿Ya hay una fila EXACTA en el grupo entero (ocupada, manual o
      // libre)? Si la hay, nunca se actualiza nada — actualizar otra fila
      // libre a ese mismo end_time chocaría con ella (unique constraint).
      // Solo sobran las libres que no sean esa exacta.
      const exactExists = group.some((s) => s.end_time === wanted.end_time)
      if (exactExists) {
        existingKeysSeen.add(key)
        for (const s of free) {
          if (s.end_time !== wanted.end_time) retire(s)
          else if (isRetired(s)) toReopen.push(s.id)
        }
        continue
      }

      // Sin exacta en todo el grupo: es seguro actualizar una libre (no
      // puede chocar con nada, nada más en el grupo tiene ese end_time).
      const representative = free[0]
      if (representative) {
        existingKeysSeen.add(key)
        toUpdateEndTime.push({ id: representative.id, end_time: wanted.end_time })
        if (isRetired(representative)) toReopen.push(representative.id)
        for (const s of free) {
          if (s.id !== representative.id) retire(s)
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

  // Todo el plan en UNA transacción (migrations/014, apply_window_plan): o se
  // aplica entero o no cambia nada. Antes eran cinco escrituras sueltas y un
  // fallo a mitad dejaba publicadas horas que el entrenador había quitado.
  let result: { data: unknown; error: { code?: string; message?: string } | null }
  try {
    result = await supabase.rpc(WINDOW_PLAN_FUNCTION, {
      p_trainer_id: trainerId,
      p_plan: { insert: toInsert, delete: toDelete, update_end: toUpdateEndTime, close: toClose, reopen: toReopen },
      p_revision: revision,
    })
  } catch (thrown) {
    // La llamada salió y no hay respuesta: la transacción pudo confirmarse.
    throw new WindowSyncError({ message: thrown instanceof Error ? thrown.message : String(thrown) }, { afterSend: true })
  }
  const { data, error } = result
  if (error) throw new WindowSyncError(error, { afterSend: true })
  const applied = (data ?? {}) as Partial<Record<'created' | 'removed' | 'kept' | 'closed' | 'shrink_blocked' | 'reopened', number>>

  return {
    created: applied.created ?? 0,
    removed: applied.removed ?? 0,
    keptOccupied,
    closed: (applied.closed ?? 0) + (applied.shrink_blocked ?? 0),
    reopened: applied.reopened ?? 0,
    keptReferenced: applied.kept ?? 0,
  }
}

export const WINDOW_PLAN_FUNCTION = 'apply_window_plan'

export { isDatabaseErrorCode }

/**
 * La sincronización no se ha aplicado (nada ha cambiado en las ventanas).
 * `missingMigration`: la 014 no está en la base (o PostgREST no ha recargado
 * el esquema). No hay camino alternativo no atómico.
 */
export class WindowSyncError extends Error {
  readonly code: string | null
  readonly missingMigration: boolean
  /** El plan se calculó con un horario que ya cambió (016): no se aplicó nada; se puede recalcular. */
  readonly stale: boolean
  /**
   * No se sabe si se aplicó: el error llegó DESPUÉS de mandar el plan y no
   * trae código de Postgres/PostgREST (red cortada, respuesta perdida, 5xx
   * de un proxy). Con código, la base lo rechazó y la transacción se deshizo.
   */
  readonly outcomeUnknown: boolean
  constructor(error: { code?: string; message?: string }, options: { afterSend?: boolean } = {}) {
    // PGRST202 / 42883: falta la función (014/016) o su firma nueva (016);
    // 42703: falta trainers.availability_revision (016).
    const missingMigration = error.code === 'PGRST202' || error.code === '42883' || error.code === '42703'
    const stale = error.code === 'P0001' && String(error.message ?? '').includes('window_plan_stale')
    super(missingMigration ? 'Faltan las migraciones 014/016 (apply_window_plan)' : `apply_window_plan falló (${error.code ?? 'sin código'}): ${error.message ?? ''}`)
    this.name = 'WindowSyncError'
    this.code = error.code ?? null
    this.missingMigration = missingMigration
    this.stale = stale
    this.outcomeUnknown = Boolean(options.afterSend) && !isDatabaseErrorCode(error.code)
  }
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}
