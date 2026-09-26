#!/usr/bin/env node
// Fechas pasadas en las escrituras del panel (revisión 25/09/2026):
// proposeReschedule, moveReservation y schedulePackageSession rechazan una
// franja que ya empezó en Asia/Kuala_Lumpur, ANTES de escribir nada, y dejan
// pasar las futuras (incluida una hora más tarde de hoy).
//
// Código real con dobles: la ventana la devuelve loadOwnedOpenWindow (doble)
// con la fecha/hora de cada caso, y un Supabase falso registra las
// escrituras. Sin servidor ni Supabase reales: no toca reservas.
//
//   node scripts/verify-past-dates.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase, load, mock } from './lib/ts-harness.mjs'

const T = '11111111-1111-4111-8111-111111111111'
const W = '22222222-2222-4222-8222-222222222222'
const W2 = '33333333-3333-4333-8333-333333333333'

const state = { target: null, writes: [] }
const reset = (date, time) => {
  state.target = { date, time }
  state.writes = []
}

const WRITE_OPS = new Set(['insert', 'update', 'upsert', 'delete', 'rpc'])
mock('lib/supabase/client.ts', {
  getSupabaseServerClient: () =>
    fakeSupabase((table, ops) => {
      const write = ops.find((o) => WRITE_OPS.has(o.op))
      if (write) {
        state.writes.push({ table, op: write.op })
        if (write.op === 'insert') return { data: { id: 'new-1' }, error: null }
        if (write.op === 'rpc') return { data: [{ outcome: 'scheduled', reservation_id: 'new-1' }], error: null }
        return { data: [{ id: 'row-1' }], error: null }
      }
      if (table === 'package_sessions') {
        return {
          data: {
            id: 'ps-1', session_number: 1, status: 'not_scheduled', reservation_id: null,
            client_packages: { trainer_id: T, status: 'active', duration_minutes: 60, sessions_total: 5, client_name: 'Ana', client_email: 'ana@example.com', client_phone: null, notes: null, price_per_session_discounted: 270 },
          },
          error: null,
        }
      }
      return { data: null, error: null }
    }),
})

// Las notificaciones son un stub: aquí, no-ops.
const noop = async () => {}
mock('lib/notifications/notify.ts', {
  notifyReservationConfirmed: noop, notifyReservationNeedsReschedule: noop, notifyRescheduleProposed: noop,
  notifyProposalResponded: noop, notifyReservationCancelled: noop, notifyReservationMoved: noop, wantsWhatsApp: () => false,
})

// La ventana: del dueño, abierta y con sitio; la fecha/hora es la del caso.
const realSlots = load('lib/reservations/slots.ts')
mock('lib/reservations/slots.ts', {
  ...realSlots,
  refreshWindowStatus: noop,
  loadOwnedOpenWindow: async (_supabase, slotId, _trainerId, startTime, duration) => {
    const start = state.target.time
    const [h, m] = start.split(':').map(Number)
    const endMin = h * 60 + m + (duration ?? 60)
    const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
    return {
      ok: true,
      window: { id: slotId, trainer_id: T, session_date: state.target.date, start_time: '00:00', end_time: '23:59', status: 'available', max_capacity: 1, current_bookings: 0 },
      range: { start_time: start, end_time: end },
    }
  },
})

const { proposeReschedule } = load('lib/reservations/proposal.ts')
const { moveReservation } = load('lib/reservations/edit.ts')
const { schedulePackageSession } = load('lib/packages/schedule.ts')

// "Ahora" en Kuala Lumpur, independiente de la zona del proceso.
function kl(offsetDays = 0, offsetHours = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000 + offsetHours * 3_600_000)
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const g = (t) => p.find((x) => x.type === t).value
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:00`, hour: Number(g('hour')) }
}
const nowKl = kl()

const reservation = {
  id: 'r-1', trainer_id: T, availability_slot_id: W, status: 'pending_confirmation', client_name: 'Ana', client_email: 'ana@example.com',
  client_phone: null, notes: null, price: 300, start_time: '08:00:00', end_time: '09:00:00', duration_minutes: 60,
  player_id: null, client_message: null, player_count: 1, whatsapp_opt_in: null,
}

const CALLS = {
  proposeReschedule: (time) => proposeReschedule(reservation, W2, time, 'http://localhost'),
  moveReservation: (time) => moveReservation(reservation, W2, time),
  schedulePackageSession: (time) => schedulePackageSession(T, 'ps-1', W2, time, false),
}

const PAST_CASES = [
  ['ayer', () => kl(-1)],
  ['hoy, una hora antes', () => (nowKl.hour >= 1 ? kl(0, -1) : null)],
]
const FUTURE_CASES = [
  ['hoy, una hora después', () => (nowKl.hour <= 22 ? kl(0, 1) : null)],
  ['mañana', () => kl(1)],
]

for (const [name, call] of Object.entries(CALLS)) {
  for (const [label, when] of PAST_CASES) {
    test(`${name}: ${label} (Kuala Lumpur) → 400 y NINGUNA escritura`, async () => {
      const t = when()
      if (!t) return
      reset(t.date, t.time)
      const r = await call(t.time)
      assert.equal(r.ok, false)
      assert.equal(r.status, 400)
      assert.match(r.message, /pasad|pasado/i)
      assert.deepEqual(state.writes, [], 'no escribe antes de rechazar')
    })
  }
  for (const [label, when] of FUTURE_CASES) {
    test(`${name}: ${label} (Kuala Lumpur) → NO se rechaza por fecha`, async () => {
      const t = when()
      if (!t) return
      reset(t.date, t.time)
      const r = await call(t.time)
      assert.ok(!(r.ok === false && /pasad/i.test(r.message ?? '')), `rechazado como pasado: ${r.message}`)
      assert.ok(state.writes.length > 0, 'sigue hasta escribir (en el doble)')
    })
  }
}
