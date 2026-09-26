#!/usr/bin/env node
// Sincronización de ventanas que falla (revisión de Codex, 26/09/2026):
//
//   1. Las 7 rutas que sincronizan (horario semanal, día, excepciones y
//      «Sincronizar huecos») responden 500 { code: 'sync_failed', saved }
//      con un mensaje que dice que la disponibilidad publicada NO cambió;
//      `saved` es true cuando el cambio de horario ya se había guardado.
//      Con la 014 sin aplicar, el mensaje lo dice. Si va bien, `summary`.
//   2. Interfaz (estático): ni «Guardado» ni el resumen de sincronización
//      cuando la sincronización falla.
//
// Código real de las rutas con dobles (sesión, horario, generador). La
// atomicidad y los fallos inyectados por fase se prueban en
// scripts/verify-window-plan-db.sh (Postgres aislado).
//
//   node scripts/verify-window-sync.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, mock, read } from './lib/ts-harness.mjs'

const T = '11111111-1111-4111-8111-111111111111'
const state = { fail: null }

class WindowSyncError extends Error {
  constructor(missingMigration) {
    super('apply_window_plan falló')
    this.missingMigration = missingMigration
  }
}
const SUMMARY = { created: 1, removed: 0, keptOccupied: 0, closed: 0, reopened: 0, keptReferenced: 0 }

mock('lib/supabase/client.ts', { getSupabaseServerClient: () => ({}) })
mock('lib/auth/current-trainer.ts', { requireTrainer: async () => ({ id: T, class_durations: [60] }) })
mock('lib/availability/generate.ts', {
  WindowSyncError,
  generateSlotsForTrainer: async () => {
    if (state.fail === 'sync') throw new WindowSyncError(false)
    if (state.fail === 'migration') throw new WindowSyncError(true)
    if (state.fail === 'other') throw new Error('socket hang up')
    return SUMMARY
  },
})
const ok = async () => ({ ok: true, id: 'new' })
mock('lib/availability/weekly.ts', { addWeeklyRange: ok, updateWeeklyRange: ok, deleteWeeklyRange: ok, setDayEnabled: ok })
mock('lib/availability/overrides.ts', { addOverride: ok, deleteOverride: ok })
mock('lib/reservations/slots.ts', { refreshAllWindows: async () => 0 })

const json = (body) => new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) })
const ctx = (params) => ({ params: Promise.resolve(params) })
const ROUTES = [
  ['POST range', () => load('app/api/dashboard/availability/schedule/range/route.ts').POST(json({ day_of_week: 1 })), true],
  ['PUT range', () => load('app/api/dashboard/availability/schedule/range/[id]/route.ts').PUT(json({ start_time: '09:00' }), ctx({ id: 'r1' })), true],
  ['DELETE range', () => load('app/api/dashboard/availability/schedule/range/[id]/route.ts').DELETE(json({}), ctx({ id: 'r1' })), true],
  ['PATCH day', () => load('app/api/dashboard/availability/schedule/day/[day]/route.ts').PATCH(json({ enabled: false }), ctx({ day: '2' })), true],
  ['POST override', () => load('app/api/dashboard/availability/overrides/route.ts').POST(json({ override_date: '2099-01-01', is_blocked: true })), true],
  ['DELETE override', () => load('app/api/dashboard/availability/overrides/[id]/route.ts').DELETE(json({}), ctx({ id: 'o1' })), true],
  ['POST generate', () => load('app/api/dashboard/availability/generate/route.ts').POST(), false],
]

test('rutas: si la sincronización falla, 500 sync_failed con saved correcto y mensaje claro', async () => {
  for (const [name, call, saved] of ROUTES) {
    for (const fail of ['sync', 'other']) {
      state.fail = fail
      const res = await call()
      const body = await res.json()
      assert.equal(res.status, 500, `${name} ${fail}`)
      assert.equal(body.success, false, name)
      assert.equal(body.code, 'sync_failed', name)
      assert.equal(body.saved, saved, name)
      assert.match(body.error, saved ? /se ha guardado, pero tu disponibilidad publicada NO se ha actualizado/ : /No se ha sincronizado: tu disponibilidad publicada no ha cambiado/, name)
      assert.doesNotMatch(body.error, /socket|apply_window_plan/, `${name}: sin detalles internos`)
      assert.equal(body.summary, undefined, name)
    }
  }
})

test('rutas: con la 014 sin aplicar, el mensaje lo dice', async () => {
  state.fail = 'migration'
  for (const [name, call] of ROUTES) {
    const body = await (await call()).json()
    assert.equal(body.code, 'sync_failed', name)
    assert.match(body.error, /Falta aplicar la migración 014/, name)
  }
})

test('rutas: si va bien, success con el resumen', async () => {
  state.fail = null
  for (const [name, call] of ROUTES) {
    const res = await call()
    const body = await res.json()
    assert.equal(res.status, 200, name)
    assert.equal(body.success, true, name)
    assert.deepEqual({ ...body.summary, refreshedWindows: undefined }, { ...SUMMARY, refreshedWindows: undefined }, name)
  }
})

test('rutas: ninguna llama al generador por su cuenta (todas por syncWindows)', () => {
  for (const rel of [
    'app/api/dashboard/availability/schedule/range/route.ts',
    'app/api/dashboard/availability/schedule/range/[id]/route.ts',
    'app/api/dashboard/availability/schedule/day/[day]/route.ts',
    'app/api/dashboard/availability/overrides/route.ts',
    'app/api/dashboard/availability/overrides/[id]/route.ts',
    'app/api/dashboard/availability/generate/route.ts',
  ]) {
    const code = read(rel)
    assert.doesNotMatch(code, /generateSlotsForTrainer/, rel)
    assert.match(code, /syncWindows\(supabase, trainer\.id, (true|false)\)\s+if \(!sync\.ok\) return sync\.response/, rel)
  }
})

test('generador: una sola llamada a apply_window_plan; ninguna escritura directa ni camino no atómico', () => {
  const code = read('lib/availability/generate.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.equal((code.match(/\.rpc\(/g) ?? []).length, 1)
  assert.doesNotMatch(code, /\.(insert|update|delete|upsert)\(/, 'sin escrituras sueltas')
  assert.doesNotMatch(code, /deleteEmptyWindows/)
})

test('interfaz: un fallo de sincronización no se presenta como guardado/sincronizado', () => {
  const strip = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const weekly = strip('components/dashboard/availability/WeeklySchedule.tsx')
  // El paso final (generate) NO tolera el fallo: lanza SyncFailedError antes de setSavedMessage.
  assert.match(weekly, /const generateResult = await call\('\/api\/dashboard\/availability\/generate', \{ method: 'POST' \}\)\n/)
  assert.ok(weekly.indexOf("call('/api/dashboard/availability/generate'") < weekly.indexOf('setSavedMessage(parts.length'), 'el mensaje de guardado va después del generate')
  assert.match(weekly, /if \(options\.tolerateSyncFailure && data\.saved\) return data\s+throw new SyncFailedError/)
  assert.match(weekly, /catch \(err\) \{\s+if \(err instanceof SyncFailedError\) \{\s+setDirty\(false\)\s+onSaved\(\)\s+setError\(SAVED_NOT_PUBLISHED\)\s+return\s+\}/)
  assert.match(weekly, /Tu horario se ha guardado, pero tu disponibilidad publicada NO se ha actualizado/)
  const sync = strip('components/dashboard/availability/SyncAvailabilityButton.tsx')
  assert.ok(sync.indexOf('if (!genRes.success) throw') < sync.indexOf('setResult({'), 'sin resumen si la sincronización falló')
  assert.match(sync, /\{result && !error && \(/)
  assert.match(sync, /role="alert"/)
  const add = strip('components/dashboard/availability/AddOverrideDialog.tsx')
  assert.match(add, /if \(data\.code === 'sync_failed' && data\.saved\) \{\s+onCreated\(\)\s+setSavedNotSynced\(true\)[\s\S]{0,80}setError\(data\.error\)/)
  assert.match(add, /disabled=\{sending \|\| savedNotSynced\}/, 'no se puede volver a enviar (duplicaría la excepción)')
  const panel = strip('components/dashboard/availability/DateOverridesPanel.tsx')
  assert.match(panel, /if \(data\.code === 'sync_failed' && data\.saved\) onChanged\(\)\s+throw new Error\(data\.error/)
})
