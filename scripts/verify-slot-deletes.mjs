#!/usr/bin/env node
// Borrar ventanas sin llevarse reservas (FK ON DELETE CASCADE en la base
// real; migración 013 → RESTRICT). Código real con un Supabase falso:
//
//   1. deleteEmptyWindows: lote; si la base rechaza por la FK (23503), una a
//      una y las que tienen reserva se quedan; otro error se lanza.
//   2. Generador semanal: nunca pide borrar una ventana con reservas de
//      cualquier estado; si el patrón ya no la quiere y solo tiene
//      historial, la cierra (blocked); si la vuelve a querer, la reabre y la
//      reutiliza; un 23503 al borrar no aborta el regenerado.
//   3. Purga legacy: no propone ventanas con historial; un 23503 se cuenta
//      como `skippedReferenced` y no aborta.
//
// Sin base ni Supabase reales. La FK y la concurrencia se prueban en
// scripts/verify-slot-fk-db.sh (Postgres aislado).
//
//   node scripts/verify-slot-deletes.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fakeSupabase, load, read, root } from './lib/ts-harness.mjs'

const T = '11111111-1111-4111-8111-111111111111'
const { deleteEmptyWindows } = load('lib/availability/delete-windows.ts')
const { generateSlotsForTrainer } = load('lib/availability/generate.ts')
const { dryRunLegacyPurge, executeLegacyPurge } = load('lib/availability/cleanup.ts')

const klToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())
const localToday = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const plusDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const DAY = plusDays(localToday, 3)
const DOW = (new Date(`${DAY}T00:00:00`).getDay() + 6) % 7

// Errores con el texto real de PostgREST/Postgres.
const fkError = (constraint, table) => ({
  code: '23503',
  message: `update or delete on table "availability_slots" violates foreign key constraint "${constraint}" on table "${table}"`,
  details: 'Key (id)=(x) is still referenced from table "' + table + '".',
})
const RES_FK = fkError('reservations_availability_slot_id_fkey', 'reservations')
const OTHER_FK = fkError('slot_notes_availability_slot_id_fkey', 'slot_notes')

/**
 * Base falsa: `referenced` = ids que la base se niega a borrar por la FK de
 * reservations (RESTRICT, 013); `otherFk` = ids que rechaza por OTRA FK.
 * Registra deletes y updates.
 */
function db({ slots = [], weekly = [], referenced = [], otherFk = [], otherError = null } = {}) {
  const log = { deleteCalls: [], deleted: [], updates: [], inserts: [] }
  const supabase = fakeSupabase((table, ops) => {
    const op = (name) => ops.find((o) => o.op === name)
    if (op('delete')) {
      const ids = op('in')?.args[1] ?? [op('eq')?.args[1]]
      log.deleteCalls.push(ids)
      if (otherError) return { error: otherError, count: null }
      // Como Postgres: el error es el de la primera fila que choca.
      const first = ids.find((id) => otherFk.includes(id) || referenced.includes(id))
      if (first) return { error: otherFk.includes(first) ? OTHER_FK : RES_FK, count: null }
      log.deleted.push(...ids)
      return { error: null, count: ids.length }
    }
    if (op('update')) {
      log.updates.push({ values: op('update').args[0], ids: op('in')?.args[1] ?? [op('eq')?.args[1]] })
      return { error: null }
    }
    if (op('insert')) {
      log.inserts.push(...op('insert').args[0])
      return { error: null }
    }
    if (table === 'trainer_weekly_hours') return { data: weekly, error: null }
    if (table === 'trainer_availability_overrides') return { data: [], error: null }
    if (table === 'availability_slots') return { data: slots, error: null }
    return { data: [], error: null }
  })
  return { supabase, log }
}

const slot = (id, extra = {}) => ({
  id, session_date: DAY, start_time: '09:00:00', end_time: '13:00:00', class_type: 'private', status: 'available',
  current_bookings: 0, max_capacity: 1, generated_by_pattern: true, reservations: [], created_at: '2026-01-01T00:00:00Z', ...extra,
})
const cancelled = [{ id: 'r-old', status: 'cancelled' }]
const live = [{ id: 'r-live', status: 'confirmed' }]
const updatedTo = (log, status) => log.updates.filter((u) => u.values.status === status).flatMap((u) => u.ids)

// ─── 1. deleteEmptyWindows ───────────────────────────────────────────────────

test('deleteEmptyWindows: lote sin problemas → un solo DELETE', async () => {
  const { supabase, log } = db()
  assert.deepEqual(await deleteEmptyWindows(supabase, ['a', 'b']), { deleted: 2, kept: [] })
  assert.deepEqual(log.deleteCalls, [['a', 'b']])
  assert.deepEqual(await deleteEmptyWindows(supabase, []), { deleted: 0, kept: [] })
})

test('deleteEmptyWindows: 23503 en el lote → una a una; la que tiene reserva se queda', async () => {
  const { supabase, log } = db({ referenced: ['b'] })
  assert.deepEqual(await deleteEmptyWindows(supabase, ['a', 'b', 'c']), { deleted: 2, kept: ['b'] })
  assert.deepEqual(log.deleted, ['a', 'c'])
})

test('deleteEmptyWindows: el 23503 de OTRA restricción en el lote se propaga (sin reintentar una a una)', async () => {
  const { supabase, log } = db({ otherFk: ['b'] })
  await assert.rejects(deleteEmptyWindows(supabase, ['a', 'b', 'c']), /slot_notes_availability_slot_id_fkey/)
  assert.deepEqual(log.deleteCalls, [['a', 'b', 'c']], 'un solo intento')
  assert.deepEqual(log.deleted, [])
})

test('deleteEmptyWindows: el 23503 de OTRA restricción al ir una a una también se propaga', async () => {
  // El lote falla por la FK de reservations (b); al ir una a una, c falla por otra FK.
  const { supabase, log } = db({ referenced: ['b'], otherFk: ['c'] })
  await assert.rejects(deleteEmptyWindows(supabase, ['a', 'b', 'c', 'd']), /slot_notes_availability_slot_id_fkey/)
  assert.deepEqual(log.deleted, ['a'], 'se para en c: no sigue ni cuenta c como conservada')
})

test('isWindowHasReservationsError: solo el 23503 de reservations_availability_slot_id_fkey', () => {
  const { isWindowHasReservationsError } = load('lib/availability/delete-windows.ts')
  assert.equal(isWindowHasReservationsError(RES_FK), true)
  assert.equal(isWindowHasReservationsError({ code: '23503', message: 'x', details: 'y reservations_availability_slot_id_fkey' }), true, 'también si el nombre viene en details')
  assert.equal(isWindowHasReservationsError(OTHER_FK), false)
  assert.equal(isWindowHasReservationsError({ code: '23503', message: 'violates foreign key constraint' }), false, 'sin nombre de restricción')
  assert.equal(isWindowHasReservationsError({ code: '23505', message: 'reservations_availability_slot_id_fkey' }), false)
  assert.equal(isWindowHasReservationsError(null), false)
})

test('deleteEmptyWindows: otro error se lanza (no se traga)', async () => {
  const { supabase } = db({ otherError: { code: '42501', message: 'permission denied' } })
  await assert.rejects(deleteEmptyWindows(supabase, ['a']), /permission denied/)
})

// ─── 2. Generador ────────────────────────────────────────────────────────────

test('generador, el patrón ya no quiere el día: borra solo ventanas sin ninguna reserva', async () => {
  const { supabase, log } = db({
    slots: [
      slot('empty'),
      slot('history', { start_time: '14:00:00', end_time: '15:00:00', reservations: cancelled }),
      slot('retired', { start_time: '16:00:00', end_time: '17:00:00', status: 'blocked', reservations: cancelled }),
      slot('booked', { start_time: '18:00:00', end_time: '19:00:00', reservations: live }),
      slot('full-empty', { start_time: '20:00:00', end_time: '21:00:00', status: 'full' }),
    ],
  })
  const summary = await generateSlotsForTrainer(supabase, T, 1)
  assert.deepEqual(log.deleteCalls, [['empty', 'full-empty']], 'nunca pide borrar una ventana con reservas')
  assert.deepEqual(updatedTo(log, 'blocked').sort(), ['booked', 'history'], 'con historial o reserva viva: se cierra')
  assert.equal(log.updates.some((u) => u.ids.includes('retired')), false, 'la ya retirada no se toca')
  assert.equal(summary.removed, 2)
  assert.equal(summary.keptReferenced, 0)
})

test('generador, el patrón vuelve a querer una ventana retirada: la reabre, sin duplicar', async () => {
  const { supabase, log } = db({
    slots: [slot('retired', { status: 'blocked', reservations: cancelled })],
    weekly: [{ day_of_week: DOW, start_time: '09:00:00', end_time: '13:00:00', class_type: 'private' }],
  })
  await generateSlotsForTrainer(supabase, T, 1)
  assert.deepEqual(updatedTo(log, 'available'), ['retired'])
  assert.equal(log.inserts.filter((i) => i.session_date === DAY).length, 0, 'no inserta otra con el mismo rango')
  assert.equal(log.deleteCalls.length, 0)
})

test('generador, la retirada tiene otro fin: se reutiliza (nuevo fin + reabierta)', async () => {
  const { supabase, log } = db({
    slots: [slot('retired', { status: 'blocked', reservations: cancelled })],
    weekly: [{ day_of_week: DOW, start_time: '09:00:00', end_time: '17:00:00', class_type: 'private' }],
  })
  await generateSlotsForTrainer(supabase, T, 1)
  assert.deepEqual(log.updates.filter((u) => u.values.end_time === '17:00:00').flatMap((u) => u.ids), ['retired'])
  assert.deepEqual(updatedTo(log, 'available'), ['retired'])
  assert.equal(log.inserts.filter((i) => i.session_date === DAY).length, 0)
})

test('generador, duplicado del mismo grupo con historial: se cierra en vez de borrarse', async () => {
  const { supabase, log } = db({
    slots: [slot('keep'), slot('dup', { end_time: '10:00:00', reservations: cancelled }), slot('dup-empty', { end_time: '11:00:00' })],
    weekly: [{ day_of_week: DOW, start_time: '09:00:00', end_time: '13:00:00', class_type: 'private' }],
  })
  await generateSlotsForTrainer(supabase, T, 1)
  assert.deepEqual(log.deleteCalls, [['dup-empty']])
  assert.deepEqual(updatedTo(log, 'blocked'), ['dup'])
})

test('generador: si la base rechaza un borrado (ganó una reserva), se conserva y no aborta', async () => {
  const { supabase, log } = db({ slots: [slot('a'), slot('b', { start_time: '14:00:00', end_time: '15:00:00' })], referenced: ['b'] })
  const summary = await generateSlotsForTrainer(supabase, T, 1)
  assert.deepEqual(log.deleted, ['a'])
  assert.equal(summary.removed, 1)
  assert.equal(summary.keptReferenced, 1)
})

test('generador: otro error al borrar sigue abortando (como antes)', async () => {
  const { supabase } = db({ slots: [slot('a')], otherError: { code: '42501', message: 'permission denied' } })
  await assert.rejects(generateSlotsForTrainer(supabase, T, 1), /permission denied/)
})

// ─── 3. Purga legacy ─────────────────────────────────────────────────────────

const legacy = (id, reservations = []) => ({
  id, session_date: DAY, start_time: '09:00:00', end_time: '10:00:00', class_type: 'private', created_at: '2026-09-01T00:00:00Z', reservations,
})

test('purga: no propone ventanas con reserva viva ni con historial', async () => {
  const { supabase } = db({ slots: [legacy('empty'), legacy('history', cancelled), legacy('booked', live)] })
  const dry = await dryRunLegacyPurge(supabase, T, klToday)
  assert.deepEqual(dry.candidates.map((c) => c.id), ['empty'])
  assert.equal(dry.skippedOccupied, 1)
  assert.equal(dry.skippedWithHistory, 1)
})

test('purga: si una candidata ganó una reserva, la base la rechaza y se conserva', async () => {
  const { supabase, log } = db({ slots: [legacy('e1'), legacy('e2'), legacy('e3')], referenced: ['e2'] })
  const r = await executeLegacyPurge(supabase, T, klToday)
  assert.deepEqual(r, { removed: 2, skippedOccupied: 0, skippedWithHistory: 0, skippedReferenced: 1 })
  assert.deepEqual(log.deleted, ['e1', 'e3'])
})

// ─── 4. Ningún otro camino borra ventanas ────────────────────────────────────

test('ningún código de la app borra availability_slots fuera de delete-windows.ts', () => {
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(rel)
    }
  }
  for (const dir of ['app', 'lib', 'components']) walk(dir)
  const offenders = files.filter((rel) => {
    if (rel === path.join('lib', 'availability', 'delete-windows.ts')) return false
    // Sin comentarios; cualquier .from('availability_slots') seguido de .delete( en la misma cadena.
    const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    return /from\(\s*['"`]availability_slots['"`]\s*\)[\s\S]{0,200}?\.delete\(/.test(code)
  })
  assert.deepEqual(offenders, [])
  assert.doesNotMatch(read('lib/services/availability.service.ts'), /export async function deleteAvailabilitySlot/)
})
