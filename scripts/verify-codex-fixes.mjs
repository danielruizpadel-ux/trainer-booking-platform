#!/usr/bin/env node
// Pruebas de los arreglos pedidos en la revisión de Codex (25/09/2026), sin
// servidor ni Supabase (dobles del harness):
//
//   1. Perfil público de entrenador: nunca `select('*')`; el DTO solo lleva
//      campos públicos aunque la fila traiga columnas internas; TrainerHero
//      (componente cliente) no recibe el objeto entero.
//   2. MiniCalendarOverlay: semántica y teclado (comprobación estática del
//      fuente; el comportamiento se prueba en navegador).
//   3. Borrador de reserva: se lee sin consumir (sobrevive a un refresco),
//      se actualiza sin alargar la caducidad ni meter datos personales, y se
//      borra al caducar, si no es válido o al reservar.
//
//   node scripts/verify-codex-fixes.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, mock, read, fakeSupabase } from './lib/ts-harness.mjs'

// Código sin comentarios: la documentación puede nombrar lo prohibido.
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

// ─── 1. DTO público de entrenador ────────────────────────────────────────────

const INTERNAL = ['user_id', 'auth_user_id', 'status', 'created_at', 'updated_at']
const FULL_ROW = {
  id: 't-1', user_id: 'u-1', slug: 'daniel-ruiz', name: 'Daniel Ruiz', email: 'd@x.com', phone: '+60 1',
  bio: 'Bio', image_url: 'https://x/y.jpg', specializations: ['técnica'], rating: 4.8, total_reviews: 127,
  status: 'active', created_at: '2026-01-01', updated_at: '2026-01-02', auth_user_id: 'a-1', class_durations: [60],
}

let lastOps = null
mock('lib/supabase/client.ts', {
  getSupabaseServerClient: () =>
    fakeSupabase((table, ops) => {
      lastOps = { table, ops }
      // Aunque la base devolviera la fila entera, el DTO no debe dejar pasar lo interno.
      const single = ops.some((o) => o.op === 'maybeSingle' || o.op === 'single')
      return { data: single ? FULL_ROW : [FULL_ROW], error: null }
    }),
})
const service = load('lib/services/trainers-data.service.ts')

test('DTO: el select es explícito, sin "*" ni columnas internas', () => {
  const cols = service.PUBLIC_TRAINER_COLUMNS.split(',').map((c) => c.trim())
  assert.ok(!cols.includes('*'))
  for (const c of INTERNAL) assert.ok(!cols.includes(c), `no pide ${c}`)
})

for (const [label, call] of [
  ['getTrainerBySlug', () => service.getTrainerBySlug('daniel-ruiz')],
  ['getTrainerById', () => service.getTrainerById('t-1')],
  ['getAllTrainers', async () => (await service.getAllTrainers())[0]],
]) {
  test(`DTO: ${label} pide PUBLIC_TRAINER_COLUMNS, filtra activos y no devuelve campos internos`, async () => {
    const t = await call()
    assert.equal(lastOps.table, 'trainers')
    const select = lastOps.ops.find((o) => o.op === 'select')
    assert.equal(select.args[0], service.PUBLIC_TRAINER_COLUMNS)
    assert.ok(lastOps.ops.some((o) => o.op === 'eq' && o.args[0] === 'status' && o.args[1] === 'active'))
    for (const c of INTERNAL) assert.equal(c in t, false, `${label} no expone ${c}`)
    assert.equal(t.name, 'Daniel Ruiz')
    assert.deepEqual(t.class_durations, [60])
  })
}

test('DTO: toPublicTrainer copia campo a campo (nada extra pasa)', () => {
  const t = service.toPublicTrainer({ ...FULL_ROW, password_hash: 'x', stripe_customer: 'y' })
  assert.deepEqual(
    Object.keys(t).sort(),
    ['bio', 'class_durations', 'email', 'id', 'image_url', 'name', 'phone', 'rating', 'slug', 'specializations', 'total_reviews']
  )
})

test('DTO: TrainerHero (cliente) recibe solo los campos de la cabecera, no el objeto entero', () => {
  const page = read('app/[trainerSlug]/page.tsx')
  assert.doesNotMatch(page, /<TrainerHero\s+trainer=\{trainer\}/)
  const hero = page.slice(page.indexOf('<TrainerHero'), page.indexOf('/>', page.indexOf('<TrainerHero')))
  for (const c of [...INTERNAL, 'email', 'phone', 'id:']) assert.doesNotMatch(hero, new RegExp(`\\b${c}`), `TrainerHero no recibe ${c}`)
  assert.doesNotMatch(code('lib/services/trainers-data.service.ts'), /select\('\*'\)/)
})

// ─── 2. MiniCalendarOverlay (estático) ───────────────────────────────────────

test('MiniCalendar: diálogo no modal etiquetado, foco gestionado, Escape y teclado', () => {
  const src = code('components/trainer/calendar/MiniCalendarOverlay.tsx')
  assert.match(src, /role="dialog"/)
  assert.doesNotMatch(src, /aria-modal/, 'se cierra al clic fuera: no es modal')
  assert.match(src, /aria-labelledby=\{titleId\}/)
  assert.match(src, /event\.key === 'Escape'/)
  assert.match(src, /onBlur=\{handleBlur\}/, 'salir con Tab cierra')
  assert.match(src, /tabIndex=\{day === activeDay \? 0 : -1\}/, 'roving tabindex')
  for (const k of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown']) assert.match(src, new RegExp(`'${k}'`))
  assert.doesNotMatch(src, /toISOString/)
  const nav = read('components/trainer/calendar/CalendarNavbar.tsx')
  assert.match(nav, /triggerRef=\{miniTriggerRef\}/)
})

// ─── 3. Borrador que sobrevive al refresco ───────────────────────────────────

const draft = load('lib/booking/draft.ts')
const NOW = Date.UTC(2099, 0, 1, 10)
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const expected = { trainerSlug: 'daniel-ruiz', draftId: ID, now: NOW, allowedDurations: [60] }

function memStorage() {
  const map = new Map()
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() { return map.size },
    key: (i) => [...map.keys()][i] ?? null,
  }
}
const base = () =>
  draft.createDraft({ draftId: ID, trainerSlug: 'daniel-ruiz', sessions: [{ date: '2099-01-05', time: '10:00' }], duration: 60, playerCount: 1 }, NOW)

test('borrador: peekDraft NO lo consume (un refresco lo vuelve a encontrar)', () => {
  const s = memStorage()
  draft.saveDraft(s, base(), NOW)
  assert.ok(draft.peekDraft(s, expected))
  assert.ok(draft.peekDraft(s, { ...expected, now: NOW + 60_000 }), 'segundo acceso (refresco) dentro del TTL')
  assert.ok(s.getItem(draft.draftKey('daniel-ruiz', ID)))
})

test('borrador: peekDraft borra el caducado y el inválido; no mira otro entrenador', () => {
  const s = memStorage()
  draft.saveDraft(s, base(), NOW)
  assert.equal(draft.peekDraft(s, { ...expected, now: NOW + draft.DRAFT_TTL_MS + 1 }), null)
  assert.equal(s.getItem(draft.draftKey('daniel-ruiz', ID)), null, 'caducado borrado')
  s.setItem(draft.draftKey('daniel-ruiz', ID), '{roto')
  assert.equal(draft.peekDraft(s, expected), null)
  assert.equal(s.getItem(draft.draftKey('daniel-ruiz', ID)), null, 'inválido borrado')
  draft.saveDraft(s, base(), NOW)
  assert.equal(draft.peekDraft(s, { ...expected, trainerSlug: 'mauri' }), null)
  assert.ok(s.getItem(draft.draftKey('daniel-ruiz', ID)), 'el de otro entrenador no se toca')
})

test('borrador: updateDraftSelection guarda la selección nueva SIN alargar la caducidad ni datos personales', () => {
  const s = memStorage()
  const d = base()
  draft.saveDraft(s, d, NOW)
  const next = draft.updateDraftSelection(
    s,
    d,
    // Aunque llegue algo de más, solo se copian sesiones/duración/jugadores.
    { sessions: [{ date: '2099-01-06', time: '11:00:00', name: 'Ana' }], duration: 60, playerCount: 3, email: 'a@b.c' },
    { now: NOW + 5 * 60_000, allowedDurations: [60] }
  )
  assert.ok(next)
  assert.equal(next.expiresAt, d.expiresAt, 'misma caducidad')
  assert.deepEqual(next.sessions, [{ date: '2099-01-06', time: '11:00' }])
  assert.equal(next.playerCount, 3)
  const stored = JSON.parse(s.getItem(draft.draftKey('daniel-ruiz', ID)))
  assert.deepEqual(Object.keys(stored).sort(), ['draftId', 'duration', 'expiresAt', 'playerCount', 'sessions', 'trainerSlug', 'version'])
  assert.doesNotMatch(JSON.stringify(stored), /Ana|a@b\.c|name|email|phone|message|player_id/)
  assert.deepEqual(draft.peekDraft(s, { ...expected, now: NOW + 6 * 60_000 }).sessions, [{ date: '2099-01-06', time: '11:00' }])
})

test('borrador: selección vacía, caducada o duración no ofrecida → se borra', () => {
  for (const [label, sel, now] of [
    ['vacía', { sessions: [], duration: 60, playerCount: 1 }, NOW],
    ['caducada', { sessions: [{ date: '2099-01-05', time: '10:00' }], duration: 60, playerCount: 1 }, NOW + draft.DRAFT_TTL_MS + 1],
    ['duración', { sessions: [{ date: '2099-01-05', time: '10:00' }], duration: 90, playerCount: 1 }, NOW],
  ]) {
    const s = memStorage()
    const d = base()
    draft.saveDraft(s, d, NOW)
    assert.equal(draft.updateDraftSelection(s, d, sel, { now, allowedDurations: [60] }), null, label)
    assert.equal(s.getItem(draft.draftKey('daniel-ruiz', ID)), null, `${label}: borrado`)
  }
})

test('borrador: discardDraft lo borra y no rompe sin almacenamiento', () => {
  const s = memStorage()
  draft.saveDraft(s, base(), NOW)
  draft.discardDraft(s, 'daniel-ruiz', ID)
  assert.equal(s.getItem(draft.draftKey('daniel-ruiz', ID)), null)
  const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') }, length: 0, key: () => null }
  assert.doesNotThrow(() => draft.discardDraft(broken, 'daniel-ruiz', ID))
  assert.equal(draft.peekDraft(broken, expected), null)
})

test('borrador: el flujo deja ?draft= mientras vive, lo quita al reservar/caducar y no guarda datos personales', () => {
  const section = read('components/mauri/BookingSection.tsx')
  assert.match(section, /peekDraft\(/)
  assert.doesNotMatch(section, /takeDraft\(/, 'ya no se consume al volver')
  assert.match(section, /discardDraft\(/)
  assert.match(section, /onBooked=\{handleBooked\}/)
  const flow = read('components/booking/BookingFlow.tsx')
  assert.match(flow, /if \(!restoreDone\) return/, 'no informa hasta haber restaurado')
  assert.match(flow, /onBooked\?\.\(\)/)
  // Lo que se envía al borrador: solo selección.
  const report = flow.slice(flow.indexOf('onSelectionChangeRef.current?.('), flow.indexOf('})', flow.indexOf('onSelectionChangeRef.current?.(')))
  assert.doesNotMatch(report, /guest|name|email|phone|whatsapp|message|player_id/i)
})
