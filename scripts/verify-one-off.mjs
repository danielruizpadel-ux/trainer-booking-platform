#!/usr/bin/env node
// Clase puntual desde el calendario del Resumen (tramo arrastrado).
// Reglas en lib/reservations/one-off-rules.ts; servidor en
// lib/reservations/one-off.ts; ruta POST /api/dashboard/reservations/one-off.
//
//   1. Reglas del tramo: rejilla, duración ofrecida, mismo día, pasado (KL),
//      un año vista, solape; el tramo arrastrado se ajusta a 30 min.
//   2. Servidor: fuera de la disponibilidad crea una ventana EXACTA y
//      `blocked` (manual) y la reserva dentro; dentro de una ventana abierta
//      es la reserva manual de siempre. No escribe horario semanal ni
//      excepciones. Rechaza antes de escribir (400/409); si la base rechaza
//      el solape (23P01) borra la ventana que acaba de crear.
//   3. El entrenador sale de la sesión: un trainer_id en el body se ignora.
//   4. La ventana puntual no se publica: bookableSlotsFor no ofrece nada en
//      ella, descuenta su reserva de una ventana abierta que la solape, el
//      generador semanal no la toca y refreshWindowStatus no la reabre.
//
// Código real con dobles de Supabase. Sin servidor ni base reales: no toca
// reservas. La restricción de la base se prueba aparte en
// scripts/verify-one-off-db.sh (Postgres aislado en Docker).
//
//   node scripts/verify-one-off.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase, load, mock, read } from './lib/ts-harness.mjs'

const T = '11111111-1111-4111-8111-111111111111'
const OTHER = '99999999-9999-4999-8999-999999999999'
const OPEN = '22222222-2222-4222-8222-222222222222'

// Fechas relativas a hoy en Kuala Lumpur (la reserva manual usa el reloj real).
const klToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())
const plusDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const DAY = plusDays(klToday, 10)

const state = {}
function reset({ rows = [], offered = [60, 90], dayReadError = null, windowInsertError = null, reservationInsertError = null } = {}) {
  Object.assign(state, { rows, offered, dayReadError, windowInsertError, reservationInsertError, writes: [] })
}

const openRow = (reservations = []) => ({
  id: OPEN, trainer_id: T, session_date: DAY, start_time: '09:00:00', end_time: '13:00:00', class_type: 'private',
  status: 'available', current_bookings: reservations.length, max_capacity: 1, generated_by_pattern: true, reservations,
})

mock('lib/supabase/client.ts', {
  getSupabaseServerClient: () =>
    fakeSupabase((table, ops) => {
      const find = (op) => ops.find((o) => o.op === op)
      const eqValue = (column) => ops.find((o) => o.op === 'eq' && o.args[0] === column)?.args[1]
      for (const op of ['insert', 'update', 'delete', 'upsert']) {
        const write = find(op)
        if (!write) continue
        state.writes.push({ table, op, values: write.args[0], eq: ops.filter((o) => o.op === 'eq').map((o) => o.args) })
        if (table === 'availability_slots' && op === 'insert') {
          return state.windowInsertError ? { data: null, error: state.windowInsertError } : { data: { id: 'win-new' }, error: null }
        }
        if (table === 'reservations' && op === 'insert') {
          return state.reservationInsertError ? { data: null, error: state.reservationInsertError } : { data: { id: 'res-new' }, error: null }
        }
        return { data: null, error: null }
      }
      if (table === 'trainer_session_prices') {
        return { data: [60, 90].map((d) => ({ duration_minutes: d, player_count: 1, price_rm: d === 60 ? 300 : 450 })), error: null }
      }
      if (table === 'availability_slots') {
        if (find('maybeSingle')) return { data: state.rows.find((r) => r.id === eqValue('id')) ?? null, error: null }
        if (state.dayReadError) return { data: null, error: state.dayReadError }
        return { data: state.rows.filter((r) => r.trainer_id === eqValue('trainer_id') && r.session_date === eqValue('session_date')), error: null }
      }
      return { data: null, error: null }
    }),
})
mock('lib/availability/trainer-durations.ts', { getTrainerDurations: async () => state.offered })

const rules = load('lib/reservations/one-off-rules.ts')
const { createOneOffReservation } = load('lib/reservations/one-off.ts')

const client = { client_name: 'Ana Test', client_email: 'ana@example.com' }
const input = (start, duration, extra = {}) => ({ session_date: DAY, start_time: start, duration_minutes: duration, ...client, ...extra })
const writesTo = (table, op) => state.writes.filter((w) => w.table === table && (!op || w.op === op))

// ─── 1. Reglas ───────────────────────────────────────────────────────────────

test('reglas: rejilla de 30, duración ofrecida, mismo día, pasado, un año, solape', () => {
  const NOW = new Date('2099-01-05T03:15:00Z') // 11:15 en KL
  const ok = (start, duration, taken = [], date = '2099-01-06') =>
    rules.checkOneOffRange({ session_date: date, start_time: start, duration_minutes: duration }, [60, 90], taken, NOW)
  assert.deepEqual(ok('20:00', 90), { ok: true, range: { start_time: '20:00', end_time: '21:30' } })
  assert.equal(ok('20:15', 60).issue, 'invalid', 'fuera de la rejilla de 30')
  assert.equal(ok('20:00', 45).issue, 'duration')
  assert.equal(rules.checkOneOffRange({ session_date: '2099-01-06', start_time: '10:00', duration_minutes: 90 }, [60], [], NOW).issue, 'duration')
  assert.equal(ok('23:00', 60).issue, 'invalid', 'acabaría a medianoche')
  assert.equal(ok('22:30', 60).ok, true)
  assert.equal(ok('11:00', 60, [], '2099-01-05').issue, 'past', '11:00 ya empezó a las 11:15')
  assert.equal(ok('11:30', 60, [], '2099-01-05').ok, true)
  assert.equal(ok('10:00', 60, [], '2100-01-06').issue, 'too-far')
  assert.equal(ok('10:00', 60, [], '2099-02-30').issue, 'invalid', 'fecha que no existe')
  assert.equal(ok('10:00', 90, [{ start_time: '11:00:00', end_time: '12:00:00' }]).issue, 'overlap')
  assert.equal(ok('10:00', 60, [{ start_time: '11:00', end_time: '12:00' }]).ok, true, '[) : acabar cuando empieza otra no solapa')
})

test('reglas: el tramo arrastrado se ajusta a celdas de 30 min en cualquier dirección', () => {
  const m = (h, mm = 0) => h * 60 + mm
  assert.deepEqual(rules.selectionFromPoints(m(10, 10), m(11, 20), m(8), m(21)), { start: m(10), end: m(11, 30) })
  assert.deepEqual(rules.selectionFromPoints(m(11, 20), m(10, 10), m(8), m(21)), { start: m(10), end: m(11, 30) }, 'arrastrar hacia arriba')
  assert.deepEqual(rules.selectionFromPoints(m(10, 5), m(10, 5), m(8), m(21)), { start: m(10), end: m(10, 30) }, 'mínimo una celda')
  assert.deepEqual(rules.selectionFromPoints(m(20, 50), m(23), m(8), m(21)), { start: m(20, 30), end: m(21) }, 'recortado al final de la rejilla')
  assert.equal(rules.durationForSelection(90, [60, 90]), 90)
  assert.equal(rules.durationForSelection(120, [60, 90]), null)
})

// ─── 2. Servidor ─────────────────────────────────────────────────────────────

test('fuera de la disponibilidad: ventana exacta, blocked, manual; reserva dentro; nada del horario semanal', async () => {
  reset({ rows: [openRow()] })
  const r = await createOneOffReservation(T, input('18:00', 90, { confirmed: true }))
  assert.deepEqual(r, { ok: true, id: 'res-new', status: 'confirmed', placement: 'one_off' })
  const [win] = writesTo('availability_slots', 'insert')
  assert.equal(win.values.trainer_id, T)
  assert.equal(win.values.session_date, DAY)
  assert.equal(win.values.start_time, '18:00')
  assert.equal(win.values.end_time, '19:30')
  assert.equal(win.values.status, 'blocked')
  assert.equal(win.values.generated_by_pattern, false)
  const [res] = writesTo('reservations', 'insert')
  assert.equal(res.values.availability_slot_id, 'win-new')
  assert.equal(res.values.trainer_id, T)
  assert.equal(res.values.start_time, '18:00')
  assert.equal(res.values.end_time, '19:30')
  assert.equal(res.values.duration_minutes, 90)
  assert.equal(res.values.price, 450, 'precio del servidor (1 jugador, 90 min)')
  assert.equal(res.values.player_id, undefined, 'sin cuenta de jugador')
  assert.equal(res.values.whatsapp_opt_in, false)
  assert.equal(res.values.status, 'confirmed')
  assert.equal(state.writes.length, 2, 'solo ventana + reserva')
  assert.equal(state.writes.some((w) => /weekly|override/.test(w.table)), false)
})

test('sin marcar "tengo pista": nace pendiente de confirmar, como la manual', async () => {
  reset()
  const r = await createOneOffReservation(T, input('18:00', 60))
  assert.equal(r.ok, true)
  assert.equal(r.status, 'pending_confirmation')
})

test('dentro de una ventana abierta: reserva manual normal en esa ventana (sin ventana nueva)', async () => {
  reset({ rows: [openRow([{ id: 'r1', status: 'confirmed', start_time: '09:00:00', end_time: '10:00:00' }])] })
  const r = await createOneOffReservation(T, input('10:00', 90))
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(r.placement, 'window')
  assert.equal(writesTo('availability_slots', 'insert').length, 0)
  const [res] = writesTo('reservations', 'insert')
  assert.equal(res.values.availability_slot_id, OPEN)
  assert.equal(res.values.start_time, '10:00')
  assert.equal(res.values.end_time, '11:30')
})

test('en parte dentro y en parte fuera de una ventana abierta: clase puntual propia', async () => {
  reset({ rows: [openRow()] })
  const r = await createOneOffReservation(T, input('12:30', 90))
  assert.equal(r.placement, 'one_off')
  assert.equal(writesTo('availability_slots', 'insert')[0].values.end_time, '14:00')
})

test('pisa una reserva viva de CUALQUIER ventana del día (también de una cerrada) → 409 sin escribir', async () => {
  const blockedWithBooking = {
    id: 'w-blocked', trainer_id: T, session_date: DAY, start_time: '18:00:00', end_time: '19:00:00', class_type: 'private',
    status: 'blocked', current_bookings: 1, max_capacity: 1, generated_by_pattern: false,
    reservations: [{ id: 'r2', status: 'pending_confirmation', start_time: '18:00:00', end_time: '19:00:00' }],
  }
  reset({ rows: [openRow([{ id: 'r1', status: 'confirmed', start_time: '11:00:00', end_time: '12:00:00' }]), blockedWithBooking] })
  for (const [start, duration] of [['10:30', 60], ['17:30', 90], ['18:30', 60]]) {
    const r = await createOneOffReservation(T, input(start, duration))
    assert.equal(r.ok, false, `${start}`)
    assert.equal(r.status, 409)
  }
  assert.equal(state.writes.length, 0)
  // Una cancelada ya no ocupa
  blockedWithBooking.reservations[0].status = 'cancelled'
  const r = await createOneOffReservation(T, input('17:30', 90))
  assert.equal(r.ok, true, JSON.stringify(r))
})

test('validación antes de escribir: pasado, duración no ofrecida, fuera de rejilla, medianoche, datos del cliente', async () => {
  reset({ offered: [60] })
  const cases = [
    [{ ...input('10:00', 60), session_date: plusDays(klToday, -1) }, 400, 'pasado'],
    [input('10:00', 90), 400, 'duración no ofrecida'],
    [input('10:15', 60), 400, 'fuera de rejilla'],
    [input('23:30', 60), 400, 'cruza medianoche'],
    [{ ...input('10:00', 60), session_date: plusDays(klToday, 400) }, 400, 'más de un año'],
    [{ ...input('10:00', 60), client_email: 'no-es-email' }, 400, 'email'],
    [{ ...input('10:00', 60), session_date: undefined }, 400, 'sin fecha'],
  ]
  for (const [body, status, why] of cases) {
    const r = await createOneOffReservation(T, body)
    assert.equal(r.ok, false, why)
    assert.equal(r.status, status, why)
  }
  assert.equal(state.writes.length, 0)
})

test('sin poder leer el día (fallo de red) no se crea nada: 500', async () => {
  reset({ dayReadError: { message: 'network' } })
  const r = await createOneOffReservation(T, input('18:00', 60))
  assert.equal(r.status, 500)
  assert.equal(state.writes.length, 0)
})

test('la base rechaza el solape (23P01) → 409 y se borra la ventana recién creada', async () => {
  reset({ reservationInsertError: { code: '23P01', message: 'conflicting key value violates exclusion constraint "reservations_no_overlap"' } })
  const r = await createOneOffReservation(T, input('18:00', 60))
  assert.equal(r.status, 409)
  const [del] = writesTo('availability_slots', 'delete')
  assert.ok(del, 'borra la ventana')
  assert.deepEqual(del.eq, [['id', 'win-new'], ['trainer_id', T]])
})

test('otro error al insertar la reserva → 500 y también se borra la ventana', async () => {
  reset({ reservationInsertError: { code: '23502', message: 'null value' } })
  const r = await createOneOffReservation(T, input('18:00', 60))
  assert.equal(r.status, 500)
  assert.equal(writesTo('availability_slots', 'delete').length, 1)
})

test('otra petición creó la misma ventana a la vez (23505) → 409 sin reserva', async () => {
  reset({ windowInsertError: { code: '23505', message: 'duplicate key' } })
  const r = await createOneOffReservation(T, input('18:00', 60))
  assert.equal(r.status, 409)
  assert.equal(writesTo('reservations').length, 0)
})

test('ya hay una fila con ese rango exacto: se reutiliza solo si es manual y blocked', async () => {
  const exact = (extra) => ({
    id: 'w-exact', trainer_id: T, session_date: DAY, start_time: '18:00:00', end_time: '19:00:00', class_type: 'private',
    current_bookings: 0, max_capacity: 1, reservations: [{ id: 'old', status: 'cancelled', start_time: '18:00:00', end_time: '19:00:00' }], ...extra,
  })
  reset({ rows: [exact({ status: 'blocked', generated_by_pattern: false })] })
  let r = await createOneOffReservation(T, input('18:00', 60))
  assert.equal(r.ok, true)
  assert.equal(writesTo('availability_slots', 'insert').length, 0)
  assert.equal(writesTo('reservations', 'insert')[0].values.availability_slot_id, 'w-exact')
  assert.equal(writesTo('availability_slots', 'update')[0].values.status, undefined, 'no cambia su estado (sigue blocked)')

  for (const extra of [{ status: 'blocked', generated_by_pattern: true }, { status: 'full', generated_by_pattern: false }, { status: 'cancelled', generated_by_pattern: false }]) {
    reset({ rows: [exact(extra)] })
    r = await createOneOffReservation(T, input('18:00', 60))
    assert.equal(r.status, 409, JSON.stringify(extra))
    assert.equal(state.writes.length, 0)
  }
})

test('solo mira las ventanas del entrenador de la sesión', async () => {
  // Otra ventana abierta de OTRO entrenador a esa hora: ni la usa ni cuenta.
  reset({ rows: [{ ...openRow(), id: 'foreign', trainer_id: OTHER }] })
  const r = await createOneOffReservation(T, input('10:00', 60))
  assert.equal(r.placement, 'one_off')
  assert.equal(writesTo('reservations', 'insert')[0].values.trainer_id, T)
})

// ─── 3. Ruta ─────────────────────────────────────────────────────────────────

test('ruta: el entrenador sale de la sesión; trainer_id del body se ignora; sin sesión no escribe', async () => {
  let session = { id: T, class_durations: [60, 90] }
  mock('lib/auth/current-trainer.ts', { requireTrainer: async () => session })
  const { POST } = load('app/api/dashboard/reservations/one-off/route.ts')
  const call = (body) => POST(new Request('http://localhost/api/dashboard/reservations/one-off', { method: 'POST', body: JSON.stringify(body) }))

  reset()
  let res = await call({ ...input('18:00', 60), trainer_id: OTHER })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).placement, 'one_off')
  assert.equal(writesTo('availability_slots', 'insert')[0].values.trainer_id, T)
  assert.equal(writesTo('reservations', 'insert')[0].values.trainer_id, T)

  reset()
  session = new Response(JSON.stringify({ success: false }), { status: 401 })
  res = await call(input('18:00', 60))
  assert.equal(res.status, 401)
  assert.equal(state.writes.length, 0)

  const code = read('app/api/dashboard/reservations/one-off/route.ts')
  assert.match(code, /createOneOffReservation\(trainer\.id, body\)/)
  assert.doesNotMatch(code, /body\.trainer_id|searchParams/)
})

// ─── 4. No se publica ────────────────────────────────────────────────────────

test('público: nada reservable en la ventana puntual y su reserva cuenta en la ventana abierta que la solapa', () => {
  const { bookableSlotsFor } = load('lib/availability/booking.ts')
  const { toLoadedWindow } = load('lib/reservations/slots.ts')
  const oneOff = {
    id: 'w-one', trainer_id: T, session_date: DAY, start_time: '12:30:00', end_time: '14:00:00', class_type: 'private',
    status: 'blocked', current_bookings: 1, max_capacity: 1,
    reservations: [{ id: 'r-one', status: 'confirmed', start_time: '12:30:00', end_time: '14:00:00' }],
  }
  const windows = [openRow(), oneOff].map(toLoadedWindow)
  const all = windows.flatMap((w) => w.taken)
  for (const w of windows) w.taken = all // como loadOpenWindows
  const starts = bookableSlotsFor(windows, 60, [60, 90]).map((s) => `${s.id}@${s.start_time.slice(0, 5)}`)
  assert.equal(starts.some((s) => s.startsWith('w-one')), false, 'la ventana puntual no ofrece nada')
  assert.deepEqual(starts, [`${OPEN}@09:00`, `${OPEN}@09:30`, `${OPEN}@10:00`, `${OPEN}@10:30`, `${OPEN}@11:00`, `${OPEN}@11:30`])
  // Cancelada la reserva, la ventana puntual sigue cerrada (blocked)
  oneOff.reservations[0].status = 'cancelled'
  const after = bookableSlotsFor([toLoadedWindow(oneOff)], 60, [60, 90])
  assert.deepEqual(after, [])
})

test('generador semanal: nunca borra, reabre ni cambia una ventana puntual (manual + blocked)', async () => {
  const { generateSlotsForTrainer } = load('lib/availability/generate.ts')
  const date = plusDays(klToday, 3)
  const oneOff = {
    id: 'w-one', session_date: date, start_time: '18:00:00', end_time: '19:00:00', class_type: 'private', status: 'blocked',
    current_bookings: 1, max_capacity: 1, generated_by_pattern: false, reservations: [],
  }
  const dow = (new Date(`${date}T00:00:00`).getDay() + 6) % 7
  for (const weekly of [[], [{ day_of_week: dow, start_time: '18:00:00', end_time: '19:00:00', class_type: 'private' }]]) {
    const writes = []
    const supabase = fakeSupabase((table, ops) => {
      const write = ops.find((o) => ['insert', 'update', 'delete'].includes(o.op))
      if (write) {
        writes.push({ table, op: write.op, values: write.args[0], filter: ops.filter((o) => o.op === 'in' || o.op === 'eq').map((o) => o.args) })
        return { data: null, error: null }
      }
      if (table === 'trainer_weekly_hours') return { data: weekly, error: null }
      if (table === 'trainer_availability_overrides') return { data: [], error: null }
      if (table === 'availability_slots') return { data: [oneOff], error: null }
      return { data: [], error: null }
    })
    await generateSlotsForTrainer(supabase, T, 1)
    const touching = writes.filter((w) => JSON.stringify(w.filter).includes('w-one'))
    assert.deepEqual(touching, [], `con patrón ${weekly.length ? 'que la quiere' : 'vacío'}`)
  }
})

test('refreshWindowStatus no reabre una ventana blocked (cancelar la clase puntual no la publica)', async () => {
  const { refreshWindowStatus } = load('lib/reservations/slots.ts')
  const writes = []
  const supabase = fakeSupabase((table, ops) => {
    if (ops.some((o) => o.op === 'update')) writes.push(table)
    return {
      data: { id: 'w-one', trainer_id: T, session_date: DAY, start_time: '18:00:00', end_time: '19:00:00', class_type: 'private', status: 'blocked', current_bookings: 0, max_capacity: 1, reservations: [] },
      error: null,
    }
  })
  await refreshWindowStatus(supabase, 'w-one', [60])
  assert.deepEqual(writes, [])
})
