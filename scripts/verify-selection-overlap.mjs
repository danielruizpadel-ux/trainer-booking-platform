#!/usr/bin/env node
// Checkout: dos clases de la MISMA petición no pueden solaparse (fallo real:
// se podían elegir 12:00 y 12:30 de 60 min el mismo día).
//
//   1. La regla compartida (lib/availability/windows.ts): 12:00+12:30 de 60
//      se solapan; 12:00+13:00 no; con 90 min, 12:00+13:00 sí y 12:00+13:30 no.
//   2. POST /api/reservations con el código REAL de disponibilidad
//      (lib/availability/booking.ts, sin doble) y un Supabase falso que da una
//      ventana 09:00–18:00: la pareja que se pisa → 400 sin insertar nada (en
//      ambos órdenes); 12:00+13:00 → un único insert con las dos filas; una
//      petición con una sesión válida y otra inválida → nada creado.
//   3. El calendario usa la misma regla para no dejar elegir la hora.
//
// Sin servidor ni Supabase reales: no crea reservas.
//
//   node scripts/verify-selection-overlap.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase, load, mock, read } from './lib/ts-harness.mjs'

const TRAINER = '11111111-1111-4111-8111-111111111111'
const WINDOW = '22222222-2222-4222-8222-222222222222'
const DAY = '2099-01-05'

const PRICES = [
  [60, 1, 300], [60, 2, 300], [60, 3, 350], [60, 4, 350],
  [90, 1, 450], [90, 2, 450], [90, 3, 525], [90, 4, 525],
].map(([duration_minutes, player_count, price_rm]) => ({ duration_minutes, player_count, price_rm }))

let state
const reset = (existing = []) => {
  state = { inserts: [], windowQueries: 0, existing }
}
reset()

function respond(table, ops) {
  const has = (op) => ops.find((o) => o.op === op)
  if (table === 'reservations' && has('insert')) {
    const rows = has('insert').args[0]
    state.inserts.push(rows)
    return { data: rows.map((_, i) => ({ id: `r-${i + 1}` })), error: null }
  }
  if (table === 'availability_slots' && has('gte')) {
    state.windowQueries += 1
    return {
      data: [{
        id: WINDOW, trainer_id: TRAINER, session_date: DAY, start_time: '09:00:00', end_time: '18:00:00',
        class_type: 'private', status: 'available', current_bookings: 0, max_capacity: 1,
        reservations: state.existing,
      }],
      error: null,
    }
  }
  if (table === 'trainer_session_prices') return { data: PRICES, error: null }
  return { data: null, error: null }
}

mock('lib/supabase/client.ts', { getSupabaseServerClient: () => fakeSupabase(respond), supabaseClient: null })
mock('lib/auth/current-player.ts', { findBookingPlayer: async () => ({ status: 'anonymous' }) })
mock('lib/availability/trainer-durations.ts', { getTrainerDurations: async () => [60, 90] })
// OJO: lib/availability/booking.ts NO se sustituye: es el cálculo real.

const windows = load('lib/availability/windows.ts')
const route = load('app/api/reservations/route.ts')

async function post(sessions, duration = 60) {
  const response = await route.POST(
    new Request('http://localhost/api/reservations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        trainer_id: TRAINER,
        sessions,
        duration_minutes: duration,
        player_count: 1,
        client_name: 'Ana Test',
        client_email: 'ana@example.com',
        client_phone: '+60 12 345 6789',
        client_whatsapp_opt_in: false,
      }),
    })
  )
  return { status: response.status, body: await response.json() }
}

// ─── 1. La regla ─────────────────────────────────────────────────────────────

test('regla: 60 min → 12:00/12:30 se solapan, 12:00/13:00 no; otro día nunca', () => {
  const at = (time, date = DAY) => ({ date, time })
  assert.equal(windows.overlapsSelection([at('12:00')], at('12:30'), 60), true)
  assert.equal(windows.overlapsSelection([at('12:30')], at('12:00'), 60), true)
  assert.equal(windows.overlapsSelection([at('12:00')], at('13:00'), 60), false)
  assert.equal(windows.overlapsSelection([at('12:00')], at('11:00'), 60), false)
  assert.equal(windows.overlapsSelection([at('12:00')], at('12:30', '2099-01-06'), 60), false)
  assert.equal(windows.overlapsSelection([at('12:00:00')], at('12:30'), 60), true, 'HH:MM:SS')
  assert.equal(windows.overlapsSelection([at('12:00')], at('12:00:00'), 60), false, 'la propia hora no se bloquea a sí misma')
})

test('regla: 90 min → 12:00/13:00 se solapan, 12:00/13:30 no', () => {
  const at = (time) => ({ date: DAY, time })
  assert.equal(windows.overlapsSelection([at('12:00')], at('13:00'), 90), true)
  assert.equal(windows.overlapsSelection([at('12:00')], at('13:30'), 90), false)
  assert.deepEqual(windows.findSelectionOverlap([at('10:00'), at('12:00'), at('13:00')], 90), [at('12:00'), at('13:00')])
  assert.equal(windows.findSelectionOverlap([at('10:00'), at('12:00'), at('13:30')], 90), null)
})

// ─── 2. El servidor (código real de disponibilidad) ──────────────────────────

test('servidor: 12:00 + 12:30 de 60 min → 400, sin insertar y sin consultar ventanas', async () => {
  reset()
  const r = await post([{ date: DAY, time: '12:00' }, { date: DAY, time: '12:30' }])
  assert.equal(r.status, 400)
  assert.match(r.body.error, /overlap/i)
  assert.equal(state.inserts.length, 0)
  assert.equal(state.windowQueries, 0, 'se rechaza antes de tocar la base')
})

test('servidor: el orden no importa (12:30 + 12:00 → 400, sin insertar)', async () => {
  reset()
  const r = await post([{ date: DAY, time: '12:30' }, { date: DAY, time: '12:00:00' }])
  assert.equal(r.status, 400)
  assert.equal(state.inserts.length, 0)
})

test('servidor: 12:00 + 13:00 de 60 min → aceptadas, UN insert con las dos filas', async () => {
  reset()
  const r = await post([{ date: DAY, time: '12:00' }, { date: DAY, time: '13:00' }])
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.success, true)
  assert.equal(state.inserts.length, 1, 'un solo insert: todo o nada')
  assert.deepEqual(state.inserts[0].map((row) => [row.start_time, row.end_time]), [['12:00', '13:00'], ['13:00', '14:00']])
})

test('servidor: 90 min → 12:00 + 13:00 se rechaza; 12:00 + 13:30 se acepta', async () => {
  reset()
  const bad = await post([{ date: DAY, time: '12:00' }, { date: DAY, time: '13:00' }], 90)
  assert.equal(bad.status, 400)
  assert.equal(state.inserts.length, 0)
  reset()
  const ok = await post([{ date: DAY, time: '12:00' }, { date: DAY, time: '13:30' }], 90)
  assert.equal(ok.status, 200, JSON.stringify(ok.body))
  assert.equal(state.inserts.length, 1)
  assert.equal(state.inserts[0].length, 2)
})

test('servidor: una válida + una que pisa una reserva existente → rechazo y NINGUNA fila creada', async () => {
  reset([{ id: 'x', status: 'confirmed', start_time: '15:00:00', end_time: '16:00:00' }])
  const r = await post([{ date: DAY, time: '12:00' }, { date: DAY, time: '15:30' }])
  assert.ok(r.status >= 400, `status ${r.status}`)
  assert.equal(state.inserts.length, 0, 'sin reservas parciales')
})

test('servidor: una válida + una fuera de la ventana o pasada → rechazo y NINGUNA fila creada', async () => {
  reset()
  const outside = await post([{ date: DAY, time: '12:00' }, { date: DAY, time: '20:00' }])
  assert.ok(outside.status >= 400)
  assert.equal(state.inserts.length, 0)
  reset()
  const past = await post([{ date: DAY, time: '12:00' }, { date: '2020-01-06', time: '10:00' }])
  assert.equal(past.status, 400)
  assert.equal(state.inserts.length, 0)
})

test('servidor: misma hora dos veces → 400 "selected twice", sin insertar', async () => {
  reset()
  const r = await post([{ date: DAY, time: '12:00' }, { date: DAY, time: '12:00:00' }])
  assert.equal(r.status, 400)
  assert.match(r.body.error, /selected twice/)
  assert.equal(state.inserts.length, 0)
})

// ─── 3. El calendario usa la misma regla ─────────────────────────────────────

test('calendario: no deja añadir una hora que pisa otra elegida y la pinta desactivada', () => {
  const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const cal = code('components/trainer/calendar/AvailabilityCalendar.tsx')
  assert.match(cal, /import \{ overlapsSelection \} from '@\/lib\/availability\/windows'/)
  assert.match(cal, /if \(blockedBySelection\(date, time\)\) return/)
  assert.match(cal, /isBlocked=\{\(time\) => blockedBySelection\(pickerDate, time\)\}/)
  assert.match(cal, /isBlocked=\{\(time\) => blockedBySelection\(currentDateStr, time\)\}/)
  for (const f of ['components/trainer/calendar/TimePickerDropdown.tsx', 'components/trainer/calendar/DayView.tsx']) {
    assert.match(code(f), /isAvailable = slot\.current_bookings < slot\.max_capacity && !blocked/, f)
  }
  assert.match(code('components/booking/BookingFlow.tsx'), /overlapsSelection\(kept, s, restoredDraft\.duration\)/, 'el borrador tampoco trae solapes')
})
