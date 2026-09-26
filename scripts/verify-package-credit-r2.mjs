#!/usr/bin/env node
// R2 (migración 012b), lado TypeScript: proposeReschedule llama UNA vez a
// propose_reschedule y traduce el resultado; el 23505 del índice
// reservations_one_live_per_package_session es un 409 al proponer, al agendar
// y al mover (revivir una reserva de paquete muerta).
//
// Código real con dobles: Supabase falso que registra las llamadas. Sin
// servidor ni Supabase reales. El comportamiento en Postgres lo prueba
// scripts/verify-package-credit-r2.sh.
//
//   node scripts/verify-package-credit-r2.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase, load, mock } from './lib/ts-harness.mjs'

const T = '11111111-1111-4111-8111-111111111111'
const W = '22222222-2222-4222-8222-222222222222'
const W2 = '33333333-3333-4333-8333-333333333333'
const CREDIT_ERROR = { code: '23505', message: 'duplicate key value violates unique constraint "reservations_one_live_per_package_session"' }

const state = {}
const reset = (overrides = {}) =>
  Object.assign(state, {
    calls: [],
    propose: { data: [{ outcome: 'proposed', proposal_id: 'prop-1', original_slot_id: W, session_date: '2099-01-05', end_time: '12:00:00' }], error: null },
    schedule: { data: [{ outcome: 'scheduled', reservation_id: 'res-new' }], error: null },
    update: { data: [{ id: 'x' }], error: null },
    ...overrides,
  })

mock('lib/supabase/client.ts', {
  getSupabaseServerClient: () =>
    fakeSupabase((table, ops) => {
      state.calls.push({ table, ops })
      if (table === 'rpc:propose_reschedule') return state.propose
      if (table === 'rpc:schedule_package_session') return state.schedule
      if (table === 'reservations' && ops.some((o) => o.op === 'update')) return state.update
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

const record = (name) => async () => state.calls.push({ table: name, ops: [] })
mock('lib/notifications/notify.ts', {
  notifyReservationConfirmed: record('notify'), notifyReservationNeedsReschedule: record('notify'), notifyRescheduleProposed: record('notifyRescheduleProposed'),
  notifyProposalResponded: record('notify'), notifyReservationCancelled: record('notify'), notifyReservationMoved: record('notifyReservationMoved'), wantsWhatsApp: () => false,
})

const realSlots = load('lib/reservations/slots.ts')
mock('lib/reservations/slots.ts', {
  ...realSlots,
  refreshWindowStatus: async (_s, id) => state.calls.push({ table: 'refreshWindowStatus', ops: [{ op: 'refresh', args: [id] }] }),
  loadOwnedOpenWindow: async (_s, slotId, _t, startTime, duration) => ({
    ok: true,
    window: { id: slotId, trainer_id: T, session_date: '2099-01-05', start_time: '08:00', end_time: '20:00', status: 'available' },
    range: { start_time: startTime, end_time: `${String(Number(startTime.slice(0, 2)) + duration / 60).padStart(2, '0')}:${startTime.slice(3, 5)}` },
  }),
})

const { proposeReschedule } = load('lib/reservations/proposal.ts')
const { moveReservation } = load('lib/reservations/edit.ts')
const { schedulePackageSession } = load('lib/packages/schedule.ts')

const original = {
  id: 'orig', trainer_id: T, availability_slot_id: W, status: 'pending_confirmation', client_name: 'Ana', client_email: 'ana@example.com',
  client_phone: null, notes: 'Paquete de 5 clases · sesión 1/5', price: 270, start_time: '10:00:00', end_time: '11:00:00', duration_minutes: 60,
  player_id: null, client_message: null, player_count: 1, whatsapp_opt_in: false,
}
const loose = () => state.calls.filter((c) => (c.table === 'reservations' || c.table === 'package_sessions') && c.ops.some((o) => ['insert', 'update', 'upsert', 'delete'].includes(o.op)))
const after = () => state.calls.filter((c) => c.table === 'refreshWindowStatus' || c.table.startsWith('notify'))

test('proponer: una sola RPC, ninguna escritura suelta; ventanas y aviso DESPUÉS', async () => {
  reset()
  const r = await proposeReschedule(original, W2, '11:00', 'http://localhost')
  assert.equal(r.ok, true)
  assert.equal(r.proposalId, 'prop-1')
  const rpc = state.calls.filter((c) => c.table === 'rpc:propose_reschedule')
  assert.equal(rpc.length, 1)
  const args = rpc[0].ops[0].args[0]
  assert.deepEqual({ ...args, p_token: typeof args.p_token }, { p_original_id: 'orig', p_trainer_id: T, p_slot_id: W2, p_start_time: '11:00', p_token: 'string' })
  assert.match(args.p_token, /^[A-Za-z0-9_-]{16,64}$/)
  assert.equal(r.token, args.p_token)
  assert.deepEqual(loose(), [])
  const order = state.calls.map((c) => c.table)
  assert.ok(order.indexOf('rpc:propose_reschedule') < order.indexOf('refreshWindowStatus'))
  assert.deepEqual(state.calls.filter((c) => c.table === 'refreshWindowStatus').map((c) => c.ops[0].args[0]), [W, W2])
  assert.ok(order.includes('notifyRescheduleProposed'))
})

for (const [outcome, status] of [
  ['not_found', 404], ['forbidden', 403], ['not_pending', 409], ['same_range', 400],
  ['window_closed', 409], ['out_of_window', 409], ['past', 400], ['invalid', 400],
]) {
  test(`proponer: la RPC dice ${outcome} → ${status}, sin ventanas ni aviso`, async () => {
    reset({ propose: { data: [{ outcome, proposal_id: null }], error: null } })
    const r = await proposeReschedule(original, W2, '11:00', 'http://localhost')
    assert.equal(r.ok, false)
    assert.equal(r.status, status)
    assert.deepEqual(after(), [])
    assert.deepEqual(loose(), [])
  })
}

test('proponer: 23P01 → 409 franja ocupada; 23505 del crédito → 409 crédito ocupado; sin efectos', async () => {
  reset({ propose: { data: null, error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "reservations_no_overlap"' } } })
  let r = await proposeReschedule(original, W2, '11:00', 'http://localhost')
  assert.deepEqual([r.status, r.message], [409, realSlots.OVERLAP_MESSAGE])
  reset({ propose: { data: null, error: CREDIT_ERROR } })
  r = await proposeReschedule(original, W2, '11:00', 'http://localhost')
  assert.deepEqual([r.status, r.message], [409, realSlots.CREDIT_TAKEN_MESSAGE])
  assert.deepEqual(after(), [])
})

test('proponer: sin la 012 → 500 que lo dice (por código y por texto)', async () => {
  for (const error of [{ code: 'PGRST202', message: 'x' }, { code: '404', message: 'Could not find the function public.propose_reschedule in the schema cache' }]) {
    reset({ propose: { data: null, error } })
    const r = await proposeReschedule(original, W2, '11:00', 'http://localhost')
    assert.equal(r.status, 500)
    assert.match(r.message, /012/)
  }
})

test('proponer: comprobaciones rápidas antes de la RPC (no pendiente / misma franja) → sin RPC', async () => {
  reset()
  let r = await proposeReschedule({ ...original, status: 'confirmed' }, W2, '11:00', 'http://localhost')
  assert.equal(r.status, 409)
  r = await proposeReschedule(original, W, '10:00', 'http://localhost')
  assert.equal(r.status, 400)
  assert.ok(!state.calls.some((c) => c.table.startsWith('rpc:')))
})

test('mover (revivir) una reserva de paquete cuyo crédito ya respalda otra → 409, sin ventanas ni aviso', async () => {
  reset({ update: { data: null, error: CREDIT_ERROR } })
  const r = await moveReservation({ ...original, status: 'needs_reschedule' }, W2, '11:00')
  assert.deepEqual([r.ok, r.status, r.message], [false, 409, realSlots.CREDIT_TAKEN_MESSAGE])
  assert.deepEqual(after(), [])
})

test('agendar: 23505 del crédito → 409 crédito ocupado, sin refrescar la ventana', async () => {
  reset({ schedule: { data: null, error: CREDIT_ERROR } })
  const r = await schedulePackageSession(T, 'ps-1', W, '10:00', false)
  assert.deepEqual([r.ok, r.status, r.message], [false, 409, realSlots.CREDIT_TAKEN_MESSAGE])
  assert.deepEqual(after(), [])
})

test('isCreditTakenError: solo el 23505 de ESE índice', () => {
  assert.equal(realSlots.isCreditTakenError(CREDIT_ERROR), true)
  assert.equal(realSlots.isCreditTakenError({ code: '23505', message: 'duplicate key value violates unique constraint "reservations_proposal_token_key"' }), false)
  assert.equal(realSlots.isCreditTakenError({ code: '23P01', message: 'reservations_one_live_per_package_session' }), false)
  assert.equal(realSlots.isCreditTakenError(null), false)
})

const REVIVE_ERROR = { code: '23514', message: 'reservations_package_no_revive: una reserva de paquete cancelada o sin pista no se puede reactivar; agenda la sesión de nuevo desde el paquete' }

test('mover (revivir) una reserva de paquete muerta → 409 "agenda desde el paquete", sin ventanas ni aviso', async () => {
  reset({ update: { data: null, error: REVIVE_ERROR } })
  const r = await moveReservation({ ...original, status: 'needs_reschedule' }, W2, '11:00')
  assert.deepEqual([r.ok, r.status, r.message], [false, 409, realSlots.PACKAGE_REVIVE_MESSAGE])
  assert.deepEqual(after(), [])
})

test('isPackageReviveError: solo el 23514 de ESE trigger', () => {
  assert.equal(realSlots.isPackageReviveError(REVIVE_ERROR), true)
  assert.equal(realSlots.isPackageReviveError({ code: '23514', message: 'new row violates check constraint "reservations_status_check"' }), false)
  assert.equal(realSlots.isPackageReviveError({ code: 'P0001', message: 'reservations_package_no_revive' }), false)
  assert.equal(realSlots.isPackageReviveError(undefined), false)
})

const LEGACY_ERROR = { code: '23514', message: 'reservations_legacy_unclassified: reserva anterior a la 012b pendiente de clasificar (¿era de un paquete?); clasifícala con classify_legacy_reservation antes de reactivarla' }

test('mover (reactivar) una reserva histórica en cuarentena → 409 propio, sin ventanas ni aviso', async () => {
  reset({ update: { data: null, error: LEGACY_ERROR } })
  const r = await moveReservation({ ...original, status: 'cancelled' }, W2, '11:00')
  assert.deepEqual([r.ok, r.status, r.message], [false, 409, realSlots.LEGACY_UNCLASSIFIED_MESSAGE])
  assert.deepEqual(after(), [])
})

test('isLegacyUnclassifiedError: solo el 23514 de ESE trigger (y no confunde con el de paquete)', () => {
  assert.equal(realSlots.isLegacyUnclassifiedError(LEGACY_ERROR), true)
  assert.equal(realSlots.isPackageReviveError(LEGACY_ERROR), false)
  assert.equal(realSlots.isLegacyUnclassifiedError({ code: '23514', message: 'reservations_package_no_revive: …' }), false)
  assert.equal(realSlots.isLegacyUnclassifiedError(null), false)
})
