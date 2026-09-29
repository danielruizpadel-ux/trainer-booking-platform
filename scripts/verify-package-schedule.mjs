#!/usr/bin/env node
// Agendar / desagendar una sesión de paquete (R1, migración 017).
//
// schedulePackageSession y unschedulePackageSession ya no escriben reservas ni
// créditos por su cuenta: cada una llama UNA vez a su función de Postgres
// (schedule_package_session / unschedule_package_session, una transacción) y
// traduce el resultado. Los efectos posteriores (recalcular ventana, avisar)
// solo ocurren si la transacción terminó bien.
//
// Código real con dobles: Supabase falso que registra las llamadas. Sin
// servidor ni Supabase reales: no toca reservas. La concurrencia de verdad
// se prueba contra Postgres local con scripts/verify-package-schedule-concurrency.sh.
//
//   node scripts/verify-package-schedule.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase, load, mock } from './lib/ts-harness.mjs'

const T = '11111111-1111-4111-8111-111111111111'
const W = '22222222-2222-4222-8222-222222222222'

const state = {}
const reset = (overrides = {}) => {
  Object.assign(state, {
    calls: [],
    session: { id: 'ps-1', session_number: 1, status: 'not_scheduled', reservation_id: null },
    linked: null,
    rpc: { data: [{ outcome: 'scheduled', reservation_id: 'res-new' }], error: null },
    unrpc: { data: [{ outcome: 'unscheduled', cancelled_reservation_id: 'res-old', slot_id: W }], error: null },
    ...overrides,
  })
}

mock('lib/supabase/client.ts', {
  getSupabaseServerClient: () =>
    fakeSupabase((table, ops) => {
      state.calls.push({ table, ops })
      if (table === 'rpc:schedule_package_session') return state.rpc
      if (table === 'rpc:unschedule_package_session') return state.unrpc
      if (table === 'package_sessions') {
        return {
          data: {
            ...state.session,
            client_packages: { trainer_id: T, status: 'active', duration_minutes: 60, sessions_total: 5, client_name: 'Ana', client_email: 'ana@example.com', client_phone: null, notes: null, price_per_session_discounted: 270 },
          },
          error: null,
        }
      }
      if (table === 'reservations') return { data: state.linked, error: null }
      return { data: null, error: null }
    }),
})

const noop = async () => {}
mock('lib/notifications/notify.ts', {
  notifyReservationConfirmed: noop, notifyReservationNeedsReschedule: noop, notifyRescheduleProposed: noop,
  notifyProposalResponded: noop, notifyReservationCancelled: noop, notifyReservationMoved: noop, wantsWhatsApp: () => false,
})

const realSlots = load('lib/reservations/slots.ts')
mock('lib/reservations/slots.ts', {
  ...realSlots,
  refreshWindowStatus: async () => state.calls.push({ table: 'refreshWindowStatus', ops: [] }),
  loadOwnedOpenWindow: async (_s, slotId, _t, startTime, duration) => ({
    ok: true,
    window: { id: slotId, trainer_id: T, session_date: '2099-01-01', start_time: '08:00', end_time: '20:00', status: 'available', max_capacity: 1, current_bookings: 0 },
    range: { start_time: startTime, end_time: `${String(Number(startTime.slice(0, 2)) + duration / 60).padStart(2, '0')}:00` },
  }),
})

// Efectos de después de cancelar (recalcular ventana + aviso); aquí, un doble.
const realEdit = load('lib/reservations/edit.ts')
mock('lib/reservations/edit.ts', {
  ...realEdit,
  cancelReservation: async () => {
    throw new Error('unschedule no debe cancelar fuera de la transacción')
  },
  afterReservationCancelled: async (r, wasHolding) => {
    state.calls.push({ table: 'afterReservationCancelled', ops: [{ op: 'after', args: [r.id, wasHolding] }] })
  },
})

const { schedulePackageSession, unschedulePackageSession } = load('lib/packages/schedule.ts')
const writesTo = (table) => state.calls.filter((c) => c.table === table && c.ops.some((o) => ['insert', 'update', 'upsert', 'delete'].includes(o.op)))

test('schedule: una sola llamada a la RPC, sin insert ni update sueltos', async () => {
  reset()
  const r = await schedulePackageSession(T, 'ps-1', W, '10:00', true)
  assert.deepEqual(r, { ok: true, reservationId: 'res-new' })
  const rpc = state.calls.filter((c) => c.table === 'rpc:schedule_package_session')
  assert.equal(rpc.length, 1)
  assert.deepEqual(rpc[0].ops[0].args[0], { p_session_id: 'ps-1', p_trainer_id: T, p_slot_id: W, p_start_time: '10:00', p_status: 'confirmed' })
  assert.deepEqual(writesTo('reservations'), [])
  assert.deepEqual(writesTo('package_sessions'), [])
  assert.ok(state.calls.some((c) => c.table === 'refreshWindowStatus'))
})

test('schedule: sin confirmar → pending_confirmation', async () => {
  reset()
  await schedulePackageSession(T, 'ps-1', W, '10:00', false)
  const rpc = state.calls.find((c) => c.table === 'rpc:schedule_package_session')
  assert.equal(rpc.ops[0].args[0].p_status, 'pending_confirmation')
})

for (const [outcome, status] of [['already_scheduled', 409], ['package_inactive', 409], ['forbidden', 403], ['not_found', 404], ['invalid', 400]]) {
  test(`schedule: la RPC dice ${outcome} → ${status}, sin refrescar la ventana`, async () => {
    reset({ rpc: { data: [{ outcome, reservation_id: null }], error: null } })
    const r = await schedulePackageSession(T, 'ps-1', W, '10:00', false)
    assert.equal(r.ok, false)
    assert.equal(r.status, status)
    assert.ok(!state.calls.some((c) => c.table === 'refreshWindowStatus'))
  })
}

test('schedule: 23P01 de reservations_no_overlap → 409 "franja ocupada"', async () => {
  reset({ rpc: { data: null, error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "reservations_no_overlap"' } } })
  const r = await schedulePackageSession(T, 'ps-1', W, '10:00', false)
  assert.equal(r.status, 409)
  assert.equal(r.message, realSlots.OVERLAP_MESSAGE)
})

test('schedule: sin la migración 017 → 500 que lo dice', async () => {
  reset({ rpc: { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } })
  const r = await schedulePackageSession(T, 'ps-1', W, '10:00', false)
  assert.equal(r.status, 500)
  assert.match(r.message, /017/)
})

test('schedule: crédito ya con reserva viva → 409 sin llamar a la RPC', async () => {
  reset({ session: { id: 'ps-1', session_number: 1, status: 'scheduled', reservation_id: 'res-old' }, linked: { id: 'res-old', status: 'confirmed' } })
  const r = await schedulePackageSession(T, 'ps-1', W, '10:00', false)
  assert.equal(r.status, 409)
  assert.ok(!state.calls.some((c) => c.table.startsWith('rpc:')))
})

for (const [outcome, status] of [['window_closed', 409], ['out_of_window', 409], ['past', 400]]) {
  test(`schedule: la RPC dice ${outcome} → ${status}`, async () => {
    reset({ rpc: { data: [{ outcome, reservation_id: null }], error: null } })
    const r = await schedulePackageSession(T, 'ps-1', W, '10:00', false)
    assert.equal(r.ok, false)
    assert.equal(r.status, status)
  })
}

test('schedule: función ausente reconocida por el texto aunque llegue con otro código', async () => {
  reset({ rpc: { data: null, error: { code: '404', message: 'Could not find the function public.schedule_package_session(...) in the schema cache' } } })
  const r = await schedulePackageSession(T, 'ps-1', W, '10:00', false)
  assert.equal(r.status, 500)
  assert.match(r.message, /017/)
})

const scheduledOld = () => ({
  session: { id: 'ps-1', session_number: 1, status: 'scheduled', reservation_id: 'res-old' },
  linked: { id: 'res-old', status: 'confirmed', availability_slot_id: W },
})

test('unschedule: una sola RPC con la reserva esperada; ninguna escritura suelta; efectos después', async () => {
  reset(scheduledOld())
  const r = await unschedulePackageSession(T, 'ps-1')
  assert.deepEqual(r, { ok: true, reservationId: null })
  const rpc = state.calls.filter((c) => c.table === 'rpc:unschedule_package_session')
  assert.equal(rpc.length, 1)
  assert.deepEqual(rpc[0].ops[0].args[0], { p_session_id: 'ps-1', p_trainer_id: T, p_expected_reservation_id: 'res-old' })
  assert.deepEqual(writesTo('reservations'), [])
  assert.deepEqual(writesTo('package_sessions'), [])
  const after = state.calls.filter((c) => c.table === 'afterReservationCancelled')
  assert.deepEqual(after.map((c) => c.ops[0].args), [['res-old', true]])
  const order = state.calls.map((c) => c.table)
  assert.ok(order.indexOf('rpc:unschedule_package_session') < order.indexOf('afterReservationCancelled'))
})

test('unschedule: si la transacción falla → 500 y NINGÚN efecto posterior', async () => {
  reset({ ...scheduledOld(), unrpc: { data: null, error: { code: 'P0001', message: 'fallo forzado' } } })
  const r = await unschedulePackageSession(T, 'ps-1')
  assert.equal(r.ok, false)
  assert.equal(r.status, 500)
  assert.ok(!state.calls.some((c) => c.table === 'afterReservationCancelled' || c.table === 'refreshWindowStatus'))
  assert.deepEqual(writesTo('reservations'), [])
  assert.deepEqual(writesTo('package_sessions'), [])
})

for (const [outcome, status] of [['changed', 409], ['not_scheduled', 409], ['forbidden', 403], ['not_found', 404]]) {
  test(`unschedule: la RPC dice ${outcome} → ${status}, sin efectos posteriores`, async () => {
    reset({ ...scheduledOld(), unrpc: { data: [{ outcome, cancelled_reservation_id: null, slot_id: null }], error: null } })
    const r = await unschedulePackageSession(T, 'ps-1')
    assert.equal(r.ok, false)
    assert.equal(r.status, status)
    assert.ok(!state.calls.some((c) => c.table === 'afterReservationCancelled' || c.table === 'refreshWindowStatus'))
  })
}

test('unschedule: reserva ya cancelada (no la cancela la RPC) → no avisa ni recalcula', async () => {
  reset({ ...scheduledOld(), unrpc: { data: [{ outcome: 'unscheduled', cancelled_reservation_id: null, slot_id: null }], error: null } })
  const r = await unschedulePackageSession(T, 'ps-1')
  assert.equal(r.ok, true)
  assert.ok(!state.calls.some((c) => c.table === 'afterReservationCancelled' || c.table === 'refreshWindowStatus'))
})

test('unschedule: scheduled sin reserva enlazada → p_expected_reservation_id null', async () => {
  reset({ session: { id: 'ps-1', session_number: 1, status: 'scheduled', reservation_id: null }, unrpc: { data: [{ outcome: 'unscheduled', cancelled_reservation_id: null, slot_id: null }], error: null } })
  const r = await unschedulePackageSession(T, 'ps-1')
  assert.equal(r.ok, true)
  const rpc = state.calls.find((c) => c.table === 'rpc:unschedule_package_session')
  assert.equal(rpc.ops[0].args[0].p_expected_reservation_id, null)
})
