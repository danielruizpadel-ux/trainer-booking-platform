#!/usr/bin/env node
// Resultado de una sincronización cuando algo falla (revisión de Codex):
//
//   1. generate.ts real: después de mandar el plan, solo un rechazo con
//      evidencia fiable (identificador de nuestra función + su código) es
//      "no se aplicó"; cualquier otro error — también un código con formato
//      válido enviado por un proxy — es "resultado no confirmado". Un fallo
//      antes de mandarlo (lecturas) = no se aplicó.
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
const { generateSlotsForTrainer, WindowSyncError } = load('lib/availability/generate.ts')
const { isConfirmedRejection } = load('lib/supabase/error-codes.ts')
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

// Cuerpos con código de formato válido que podría devolver un proxy o una pasarela.
const PROXY_ERRORS = [
  { code: '23503', message: 'Bad Gateway' },
  { code: '23P01', message: 'upstream connect error' },
  { code: 'PGRST301', message: 'Gateway Timeout' },
  { code: '57014', message: 'request timeout' },
]

test('isConfirmedRejection: exige código Y el identificador de nuestra función; el formato no basta', () => {
  const ev = [{ code: 'P0001', marker: 'window_plan_stale' }]
  assert.equal(isConfirmedRejection({ code: 'P0001', message: 'window_plan_stale' }, ev), true)
  assert.equal(isConfirmedRejection({ code: 'P0001', message: 'x', details: 'window_plan_stale' }, ev), true, 'también en details')
  assert.equal(isConfirmedRejection({ code: 'P0001', message: 'otra cosa' }, ev), false, 'código válido sin identificador')
  assert.equal(isConfirmedRejection({ code: '22023', message: 'window_plan_stale' }, ev), false, 'identificador con otro código')
  for (const e of PROXY_ERRORS) assert.equal(isConfirmedRejection(e, ev), false, JSON.stringify(e))
  assert.equal(isConfirmedRejection(null, ev), false)
  assert.equal(isConfirmedRejection({ message: 'window_plan_stale' }, ev), false, 'sin código')
})

test('generate.ts: tras mandar el plan, solo los rechazos con evidencia son "no aplicado"; el resto, no confirmado', async () => {
  let e = await errorOf(supa({ rpc: async () => ({ data: null, error: { code: '42501', message: 'window_plan_foreign_row' } }) }))
  assert.ok(e instanceof WindowSyncError)
  assert.equal(e.outcomeUnknown, false, 'rechazo de nuestra función')
  e = await errorOf(supa({ rpc: async () => ({ data: null, error: { code: 'P0001', message: 'window_plan_stale' } }) }))
  assert.equal(e.outcomeUnknown, false)
  assert.equal(e.stale, true)
  e = await errorOf(supa({ rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.apply_window_plan' } }) }))
  assert.equal(e.outcomeUnknown, false)
  assert.equal(e.missingMigration, true)
  for (const proxy of PROXY_ERRORS) {
    e = await errorOf(supa({ rpc: async () => ({ data: null, error: proxy }) }))
    assert.equal(e.outcomeUnknown, true, `proxy ${JSON.stringify(proxy)}`)
    assert.equal(e.stale, false)
    assert.equal(e.missingMigration, false)
  }
  e = await errorOf(supa({ rpc: async () => ({ data: null, error: { code: 'P0001', message: 'otra excepción' } }) }))
  assert.equal(e.outcomeUnknown, true, 'P0001 sin identificador no es window_plan_stale')
  assert.equal(e.stale, false, 'y no se reintenta como plan viejo')
  e = await errorOf(supa({ rpc: async () => ({ data: null, error: { code: '', message: 'TypeError: fetch failed' } }) }))
  assert.equal(e.outcomeUnknown, true, 'supabase-js sin código: la red')
  e = await errorOf(supa({ rpc: async () => { throw new Error('socket hang up') } }))
  assert.equal(e.outcomeUnknown, true, 'la llamada lanza')
  e = await errorOf(supa({ revisionError: { code: '', message: 'TypeError: fetch failed' } }))
  assert.equal(e.outcomeUnknown, false, 'falla antes de mandar el plan: nada escrito')
})

// ─── 2. syncWindows ──────────────────────────────────────────────────────────

test('syncWindows: un proxy con código válido → resultado no confirmado (nunca "no ha cambiado")', async () => {
  for (const proxy of PROXY_ERRORS) {
    const body = await (await syncWindows(supa({ rpc: async () => ({ data: null, error: proxy }) }), T, false)).response.json()
    assert.equal(body.outcome, 'unknown', JSON.stringify(proxy))
    assert.match(body.error, /^Resultado no confirmado/)
    assert.doesNotMatch(body.error, /no ha cambiado/)
  }
})

test('syncWindows: desconocido → outcome unknown y el mensaje no dice que no cambió', async () => {
  const r = await syncWindows(supa({ rpc: async () => ({ data: null, error: { code: '', message: 'fetch failed' } }) }), T, true)
  assert.equal(r.ok, false)
  const body = await r.response.json()
  assert.equal(body.outcome, 'unknown')
  assert.equal(body.saved, true)
  assert.match(body.error, /el resultado de la sincronización no está confirmado/)
  assert.doesNotMatch(body.error, /no ha cambiado|sigue exactamente como antes|NO se ha actualizado/)
  const manual = await (await syncWindows(supa({ rpc: async () => ({ data: null, error: { message: 'x' } }) }), T, false)).response.json()
  assert.match(manual.error, /^Resultado no confirmado: no sabemos si la sincronización se ha aplicado/)
})

test('syncWindows: rechazada con evidencia (identificador de la función) → not_applied y sí dice que no cambió', async () => {
  const body = await (await syncWindows(supa({ rpc: async () => ({ data: null, error: { code: '42501', message: 'window_plan_foreign_row' } }) }), T, false)).response.json()
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
    // JSON de un proxy con código "válido" pero sin nuestra forma → no confirmado.
    globalThis.fetch = async () => new Response(JSON.stringify({ code: '23503', message: 'Bad Gateway' }), { status: 502 })
    assert.deepEqual(await callApi('/x', {}, 'err'), { kind: 'unknown' })
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false }), { status: 500 })
    assert.deepEqual(await callApi('/x', {}, 'err'), { kind: 'unknown' }, 'success:false sin error de texto')
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
  assert.match(UNKNOWN_SAVE_MESSAGE, /^Resultado no confirmado: no sabemos si el cambio se ha guardado/)
  const weekly = read('components/dashboard/availability/WeeklySchedule.tsx')
  assert.match(weekly, /if \(result\.kind === 'unknown'\) throw new UnknownOutcomeError\(UNKNOWN_SAVE_MESSAGE\)/)
  assert.match(weekly, /setError\(err\.outcome === 'unknown' \? err\.message : SAVED_NOT_PUBLISHED\)/)
  const add = read('components/dashboard/availability/AddOverrideDialog.tsx')
  assert.match(add, /result\.kind === 'unknown' \|\| \(result\.kind === 'failed' && result\.data\.code === 'sync_failed' && result\.data\.saved\)/)
  const panel = read('components/dashboard/availability/DateOverridesPanel.tsx')
  assert.match(panel, /if \(result\.kind === 'unknown'\) \{\s+\/\/[^\n]*\n\s+onChanged\(\)\s+throw new Error\(UNKNOWN_SAVE_MESSAGE\)/)
})
