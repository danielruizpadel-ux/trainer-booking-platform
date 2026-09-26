#!/usr/bin/env node
// R2 — el código REAL (lib/packages/queries.ts, schedule.ts,
// lib/reservations/proposal.ts, edit.ts) contra un PostgREST v12 LOCAL.
// Lo lanza scripts/verify-package-credit-postgrest.sh, que levanta Postgres +
// PostgREST en Docker y pasa POSTGREST_URL (127.0.0.1). Nunca Supabase.
//
// Sustituye getSupabaseServerClient por un PostgrestClient contra esa URL (la
// misma API .from/.rpc que usa supabase-js) y las notificaciones por no-ops.
//
//   PHASE=before  011 + 012a aplicadas, sin 012b: los embeds con la pista
//                  reservations!reservation_id funcionan, agendar por RPC.
//   PHASE=after    012b aplicada (FK reservations.package_session_id): sin la
//                  pista el embed da PGRST201; con ella, todo sigue. Proponer,
//                  rechazar, reagendar, revivir (409) y desagendar por la API real.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, mock, require } from './lib/ts-harness.mjs'

const URL = process.env.POSTGREST_URL
const PHASE = process.env.PHASE
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(URL ?? '')) throw new Error('POSTGREST_URL debe ser http://127.0.0.1:<puerto> (solo local)')
if (PHASE !== 'before' && PHASE !== 'after') throw new Error('fase: before | after')

const { PostgrestClient } = require('@supabase/postgrest-js')
const client = new PostgrestClient(URL)
mock('lib/supabase/client.ts', { getSupabaseServerClient: () => client, supabaseClient: null })
const noop = async () => {}
mock('lib/notifications/notify.ts', {
  notifyReservationConfirmed: noop, notifyReservationNeedsReschedule: noop, notifyRescheduleProposed: noop,
  notifyProposalResponded: noop, notifyReservationCancelled: noop, notifyReservationMoved: noop, wantsWhatsApp: () => false,
})

const { listTrainerPackages, getPackageDetail } = load('lib/packages/queries.ts')
const { schedulePackageSession, unschedulePackageSession } = load('lib/packages/schedule.ts')
const { proposeReschedule, respondToProposal, SELECT_FOR_PROPOSAL } = load('lib/reservations/proposal.ts')
const { moveReservation, SELECT_FOR_EDIT } = load('lib/reservations/edit.ts')
const slots = load('lib/reservations/slots.ts')

const T = '11111111-1111-4111-8111-111111111111'
const PKG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const S = (n) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`
const W = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const session = async (n) => (await getPackageDetail(T, PKG)).sessions.find((s) => s.session_number === n)
const raw = (select) => fetch(`${URL}/client_packages?select=${encodeURIComponent(select)}`).then((r) => r.json())

if (PHASE === 'before') {
  test('before: embed SIN pista funciona (una sola relación) — control', async () => {
    const body = await raw('id,package_sessions(status,reservations(status))')
    assert.ok(Array.isArray(body), JSON.stringify(body))
  })

  test('before: listTrainerPackages / getPackageDetail con la pista', async () => {
    const list = await listTrainerPackages(T)
    assert.equal(list.length, 1)
    assert.equal(list[0].sessions_scheduled, 0)
    const detail = await getPackageDetail(T, PKG)
    assert.equal(detail.sessions.length, 3)
  })

  test('before: agendar por la RPC real (parámetro time) y leerlo por el embed', async () => {
    const r = await schedulePackageSession(T, S(1), W(1), '10:00', false)
    assert.equal(r.ok, true, JSON.stringify(r))
    const s1 = await session(1)
    assert.equal(s1.reservation.id, r.reservationId)
    assert.equal(s1.reservation.status, 'pending_confirmation')
    assert.equal(s1.reservation.start_time, '10:00:00')
    assert.ok(s1.reservation.slot?.session_date)
    assert.equal((await listTrainerPackages(T))[0].sessions_scheduled, 1)
  })
}

if (PHASE === 'after') {
  test('after: embed SIN pista → PGRST201 (por eso queries.ts lleva la pista)', async () => {
    const body = await raw('id,package_sessions(status,reservations(status))')
    assert.equal(body.code, 'PGRST201', JSON.stringify(body))
  })

  test('after: listTrainerPackages / getPackageDetail siguen funcionando con la pista', async () => {
    const list = await listTrainerPackages(T)
    assert.equal(list[0].sessions_scheduled, 1)
    const s1 = await session(1)
    assert.equal(s1.reservation.status, 'pending_confirmation')
  })

  test('after: R2 por la API real — proponer ocupa el crédito; rechazar lo libera; revivir → 409; desagendar', async () => {
    const s1 = await session(1)
    const { data: original } = await client.from('reservations').select(SELECT_FOR_PROPOSAL).eq('id', s1.reservation.id).single()

    const proposed = await proposeReschedule(original, W(2), '11:00', 'http://localhost')
    assert.equal(proposed.ok, true, JSON.stringify(proposed))
    let now = await session(1)
    assert.equal(now.reservation.id, proposed.proposalId, 'el crédito apunta a la propuesta')
    assert.equal(now.reservation.status, 'reschedule_proposed')
    assert.equal((await listTrainerPackages(T))[0].sessions_scheduled, 1)

    const third = await schedulePackageSession(T, S(1), W(3), '12:00', false)
    assert.deepEqual([third.ok, third.status], [false, 409], JSON.stringify(third))

    const rejected = await respondToProposal(proposed.token, false)
    assert.equal(rejected.ok, true, JSON.stringify(rejected))
    assert.equal((await listTrainerPackages(T))[0].sessions_scheduled, 0)

    const again = await schedulePackageSession(T, S(1), W(3), '12:00', false)
    assert.equal(again.ok, true, JSON.stringify(again))

    const { data: dead } = await client.from('reservations').select(SELECT_FOR_EDIT).eq('id', proposed.proposalId).single()
    const moved = await moveReservation(dead, W(4), '10:00')
    assert.deepEqual([moved.ok, moved.status, moved.message], [false, 409, slots.PACKAGE_REVIVE_MESSAGE], JSON.stringify(moved))

    const un = await unschedulePackageSession(T, S(1))
    assert.equal(un.ok, true, JSON.stringify(un))
    now = await session(1)
    assert.deepEqual([now.status, now.reservation_id], ['not_scheduled', null])
  })

  test('after: una reserva histórica en cuarentena → 409 propio; clasificada como no-paquete, se mueve', async () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-0000000000c1'
    const { data: row } = await client.from('reservations').select(SELECT_FOR_EDIT).eq('id', id).single()
    const blocked = await moveReservation(row, W(6), '12:00')
    assert.deepEqual([blocked.ok, blocked.status, blocked.message], [false, 409, slots.LEGACY_UNCLASSIFIED_MESSAGE], JSON.stringify(blocked))
    const { data: outcome, error } = await client.rpc('classify_legacy_reservation', {
      p_reservation_id: id, p_package_session_id: null, p_decided_by: 'test', p_reason: 'reserva web cobrada aparte',
    })
    assert.equal(error, null)
    assert.equal(outcome, 'classified')
    const moved = await moveReservation(row, W(6), '12:00')
    assert.equal(moved.ok, true, JSON.stringify(moved))
  })

  test('after: una reserva SIN paquete muerta se sigue pudiendo mover (reactivar)', async () => {
    const { data: row, error } = await client
      .from('reservations')
      .insert({ trainer_id: T, availability_slot_id: W(5), client_name: 'Leo', client_email: 'leo@example.com', status: 'needs_reschedule', start_time: '10:00', end_time: '11:00' })
      .select(SELECT_FOR_EDIT)
      .single()
    assert.equal(error, null)
    const moved = await moveReservation(row, W(6), '10:00')
    assert.equal(moved.ok, true, JSON.stringify(moved))
  })
}
