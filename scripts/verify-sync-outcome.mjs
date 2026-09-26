#!/usr/bin/env node
// Resultado de una sincronización cuando algo falla (revisión de Codex):
//
//   1. generate.ts real: un error con código de Postgres/PostgREST = no se
//      aplicó; un error SIN código después de mandar el plan (o una
//      excepción de la llamada) = no se sabe; un fallo antes de mandarlo
//      (lecturas) = no se aplicó.
//   2. syncWindows: `outcome` y un mensaje que no afirma "no ha cambiado"
//      cuando no se sabe.
//   3. callApi (navegador): red caída o respuesta que no es nuestro JSON =
//      desconocido; error JSON = failed; success = ok.
//   4. «Sincronizar huecos»: en serie (limpieza solo tras sincronizar), y el
//      informe dice exactamente qué se completó en cada combinación.
//
// Dobles; sin base ni Supabase reales.
//
//   node scripts/verify-sync-outcome.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase, load, read } from './lib/ts-harness.mjs'

const T = '11111111-1111-4111-8111-111111111111'
const { generateSlotsForTrainer, WindowSyncError, isDatabaseErrorCode } = load('lib/availability/generate.ts')
const { syncWindows } = load('lib/availability/sync-response.ts')
const { callApi, UNKNOWN_SYNC_MESSAGE, UNKNOWN_PURGE_MESSAGE, UNKNOWN_SAVE_MESSAGE } = load('components/dashboard/availability/api.ts')
const { describeSync } = load('components/dashboard/availability/sync-report.ts')

function supa({ rpc, revisionError = null } = {}) {
  const client = fakeSupabase((table) => {
    if (table === 'trainers') return revisionError ? { data: null, error: revisionError } : { data: { availability_revision: 1 }, error: null }
    return { data: [], error: null }
  })
  client.rpc = rpc ?? (async () => ({ data: { created: 0 }, error: null }))
  return client
}
const errorOf = async (client) => {
  try {
    await generateSlotsForTrainer(client, T, 1)
  } catch (e) {
    return e
  }
  return null
}

// ─── 1. Clasificación ────────────────────────────────────────────────────────

test('isDatabaseErrorCode: SQLSTATE y PGRST sí; vacío, null o texto no', () => {
  for (const c of ['23P01', '42883', 'P0001', '57014', 'PGRST202', 'PGRST301']) assert.equal(isDatabaseErrorCode(c), true, c)
  for (const c of ['', null, undefined, 'fetch failed', '500']) assert.equal(isDatabaseErrorCode(c), false, String(c))
})

test('generate.ts: con código de la base → no aplicado; sin código tras mandar el plan → desconocido', async () => {
  let e = await errorOf(supa({ rpc: async () => ({ data: null, error: { code: '23503', message: 'fk' } }) }))
  assert.ok(e instanceof WindowSyncError)
  assert.equal(e.outcomeUnknown, false)
  e = await errorOf(supa({ rpc: async () => ({ data: null, error: { code: '', message: 'TypeError: fetch failed' } }) }))
  assert.equal(e.outcomeUnknown, true, 'supabase-js sin código: la red')
  e = await errorOf(supa({ rpc: async () => { throw new Error('socket hang up') } }))
  assert.equal(e.outcomeUnknown, true, 'la llamada lanza')
  e = await errorOf(supa({ revisionError: { code: '', message: 'TypeError: fetch failed' } }))
  assert.equal(e.outcomeUnknown, false, 'falla antes de mandar el plan: nada escrito')
})

// ─── 2. syncWindows ──────────────────────────────────────────────────────────

test('syncWindows: desconocido → outcome unknown y el mensaje no dice que no cambió', async () => {
  const r = await syncWindows(supa({ rpc: async () => ({ data: null, error: { code: '', message: 'fetch failed' } }) }), T, true)
  assert.equal(r.ok, false)
  const body = await r.response.json()
  assert.equal(body.outcome, 'unknown')
  assert.equal(body.saved, true)
  assert.match(body.error, /no hemos podido confirmar si tu disponibilidad publicada se ha actualizado/)
  assert.doesNotMatch(body.error, /no ha cambiado|sigue exactamente como antes|NO se ha actualizado/)
  const manual = await (await syncWindows(supa({ rpc: async () => ({ data: null, error: { message: 'x' } }) }), T, false)).response.json()
  assert.match(manual.error, /No hemos podido confirmar si la sincronización se ha aplicado/)
})

test('syncWindows: rechazada por la base → outcome not_applied y sí dice que no cambió', async () => {
  const body = await (await syncWindows(supa({ rpc: async () => ({ data: null, error: { code: '23503', message: 'fk' } }) }), T, false)).response.json()
  assert.equal(body.outcome, 'not_applied')
  assert.match(body.error, /no ha cambiado/)
})

// ─── 3. callApi ──────────────────────────────────────────────────────────────

test('callApi: red caída o respuesta ilegible = desconocido; error JSON = failed; success = ok', async () => {
  const saved = globalThis.fetch
  try {
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
    assert.deepEqual(await callApi('/x', {}, 'err'), { kind: 'unknown' })
    globalThis.fetch = async () => new Response('<html>502 Bad Gateway</html>', { status: 502 })
    assert.deepEqual(await callApi('/x', {}, 'err'), { kind: 'unknown' })
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, code: 'sync_failed', outcome: 'not_applied', error: 'no se aplicó' }), { status: 500 })
    const failed = await callApi('/x', {}, 'err')
    assert.equal(failed.kind, 'failed')
    assert.equal(failed.message, 'no se aplicó')
    assert.equal(failed.data.outcome, 'not_applied')
    globalThis.fetch = async () => new Response(JSON.stringify({ success: true, summary: { created: 1 } }), { status: 200 })
    assert.equal((await callApi('/x', {}, 'err')).kind, 'ok')
  } finally {
    globalThis.fetch = saved
  }
})

// ─── 4. «Sincronizar huecos» ─────────────────────────────────────────────────

const OK_SYNC = { kind: 'ok', data: { success: true, summary: { created: 2, removed: 1, closed: 0, reopened: 0, keptReferenced: 1 } } }
const OK_PURGE = { kind: 'ok', data: { success: true, removed: 3, skippedWithHistory: 1, skippedReferenced: 0 } }

test('informe: las dos bien', () => {
  const r = describeSync(OK_SYNC, OK_PURGE)
  assert.deepEqual(r.sync, { tone: 'ok', text: 'Huecos sincronizados: 2 creados, 1 eliminados, 1 conservados porque tienen reservas.' })
  assert.deepEqual(r.purge, { tone: 'ok', text: 'Limpieza de huecos antiguos: 3 eliminados, 1 conservados porque tienen reservas.' })
})

test('informe: sincronización hecha y limpieza fallida o sin respuesta → lo dice por separado, "puede haberse hecho en parte"', () => {
  for (const purge of [{ kind: 'failed', data: {}, message: 'x' }, { kind: 'unknown' }]) {
    const r = describeSync(OK_SYNC, purge)
    assert.equal(r.sync.tone, 'ok')
    assert.deepEqual(r.purge, { tone: 'warning', text: UNKNOWN_PURGE_MESSAGE })
    assert.match(UNKNOWN_PURGE_MESSAGE, /puede haberse hecho en parte/)
  }
})

test('informe: sincronización no aplicada → su mensaje; la limpieza no se hizo', () => {
  const r = describeSync({ kind: 'failed', data: { outcome: 'not_applied' }, message: 'No se ha sincronizado: tu disponibilidad publicada no ha cambiado.' }, null)
  assert.deepEqual(r.sync, { tone: 'error', text: 'No se ha sincronizado: tu disponibilidad publicada no ha cambiado.' })
  assert.match(r.purge.text, /No se ha hecho la limpieza/)
})

test('informe: sincronización sin respuesta → "no hemos podido confirmar"; nunca "no ha cambiado"', () => {
  const r = describeSync({ kind: 'unknown' }, null)
  assert.deepEqual(r.sync, { tone: 'error', text: UNKNOWN_SYNC_MESSAGE })
  assert.doesNotMatch(r.sync.text, /no ha cambiado/)
  assert.match(r.purge.text, /No se ha hecho la limpieza/)
})

test('botón: en serie, la limpieza solo si la sincronización se confirmó', () => {
  const code = read('components/dashboard/availability/SyncAvailabilityButton.tsx')
  assert.doesNotMatch(code, /Promise\.all/)
  assert.match(code, /const sync = await callApi\('\/api\/dashboard\/availability\/generate'[\s\S]{0,120}\n\s+const purge =\s+sync\.kind === 'ok' \? await callApi\('\/api\/dashboard\/availability\/purge-legacy'[\s\S]{0,80}: null/)
  assert.match(code, /setReport\(describeSync\(sync, purge\)\)/)
})

test('horario y excepciones: una respuesta perdida no se presenta como guardada ni como no guardada', () => {
  assert.match(UNKNOWN_SAVE_MESSAGE, /No hemos podido confirmar si el cambio se ha guardado/)
  const weekly = read('components/dashboard/availability/WeeklySchedule.tsx')
  assert.match(weekly, /if \(result\.kind === 'unknown'\) throw new UnknownOutcomeError\(UNKNOWN_SAVE_MESSAGE\)/)
  assert.match(weekly, /setError\(err\.outcome === 'unknown' \? err\.message : SAVED_NOT_PUBLISHED\)/)
  const add = read('components/dashboard/availability/AddOverrideDialog.tsx')
  assert.match(add, /result\.kind === 'unknown' \|\| \(result\.kind === 'failed' && result\.data\.code === 'sync_failed' && result\.data\.saved\)/)
  const panel = read('components/dashboard/availability/DateOverridesPanel.tsx')
  assert.match(panel, /if \(result\.kind === 'unknown'\) \{\s+\/\/[^\n]*\n\s+onChanged\(\)\s+throw new Error\(UNKNOWN_SAVE_MESSAGE\)/)
})
