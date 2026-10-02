#!/usr/bin/env node
// Landing de Mauri (B v2, PR #35):
//
//   1. "Entrar" de la cabecera no pierde la selección: con horas elegidas
//      guarda el MISMO borrador no sensible que el checkout y añade &draft=;
//      sin horas, enlace normal. El borrador se puede recuperar tal cual.
//   2. La selección en vivo se comparte entre componentes sin persistir nada.
//   3. La página solo pinta secciones con datos aprobados: sin sponsors, club,
//      bio, redes ni paquetes; la variante editorial solo la activa /mauri.
//
// Sin navegador ni Supabase.
//
//   node scripts/verify-mauri-landing.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, read } from './lib/ts-harness.mjs'

const entry = load('lib/booking/account-entry.ts')
const draft = load('lib/booking/draft.ts')
const live = load('lib/booking/live-selection.ts')
const playerEntry = load('lib/players/entry.ts')

const NOW = Date.parse('2099-01-01T00:00:00Z')
const ID = '123e4567-e89b-42d3-a456-426614174000'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() {
      return map.size
    },
    key: (i) => [...map.keys()][i] ?? null,
    map,
  }
}

const SELECTION = { sessions: [{ date: '2099-01-05', time: '10:00:00' }, { date: '2099-01-06', time: '18:30' }], duration: 60, playerCount: 1 }

test('con horas elegidas: guarda borrador y añade &draft=', () => {
  const storage = memoryStorage()
  const url = entry.accountEntryUrl('/cuenta/entrar', 'mauri', SELECTION, { storage, newId: () => ID, now: NOW })
  assert.equal(url, `/cuenta/entrar?trainer=mauri&draft=${ID}`)
  assert.equal(playerEntry.isDraftId(ID), true)
  const saved = JSON.parse(storage.getItem(draft.draftKey('mauri', ID)))
  assert.deepEqual(Object.keys(saved).sort(), ['draftId', 'duration', 'expiresAt', 'playerCount', 'sessions', 'trainerSlug', 'version'])
  assert.deepEqual(saved.sessions, [{ date: '2099-01-05', time: '10:00' }, { date: '2099-01-06', time: '18:30' }], 'horas normalizadas a HH:MM')
})

test('el borrador de la cabecera se recupera al volver (mismo mecanismo que el checkout)', () => {
  const storage = memoryStorage()
  entry.accountEntryUrl('/cuenta/entrar', 'mauri', SELECTION, { storage, newId: () => ID, now: NOW })
  const back = draft.peekDraft(storage, { trainerSlug: 'mauri', draftId: ID, now: NOW + 60_000, allowedDurations: [60, 90] })
  assert.ok(back, 'borrador válido')
  assert.equal(back.sessions.length, 2)
  assert.equal(playerEntry.trainerReturnPath('mauri', ID), `/mauri?draft=${ID}#booking-section`)
})

test('completar perfil también conserva la selección', () => {
  const storage = memoryStorage()
  const url = entry.accountEntryUrl('/cuenta/bienvenida', 'mauri', SELECTION, { storage, newId: () => ID, now: NOW })
  assert.equal(url, `/cuenta/bienvenida?trainer=mauri&draft=${ID}`)
})

test('sin horas, sin almacenamiento o sin ids: enlace normal, sin borrador', () => {
  const storage = memoryStorage()
  const empty = { sessions: [], duration: 60, playerCount: 1 }
  assert.equal(entry.accountEntryUrl('/cuenta/entrar', 'mauri', empty, { storage, newId: () => ID, now: NOW }), '/cuenta/entrar?trainer=mauri')
  assert.equal(storage.length, 0)
  assert.equal(entry.accountEntryUrl('/cuenta/entrar', 'mauri', SELECTION, { storage: null, newId: () => ID, now: NOW }), '/cuenta/entrar?trainer=mauri')
  assert.equal(entry.accountEntryUrl('/cuenta/entrar', 'mauri', SELECTION, { storage, newId: null, now: NOW }), '/cuenta/entrar?trainer=mauri')
  assert.equal(entry.plainAccountEntryUrl('/cuenta/entrar', 'mauri'), '/cuenta/entrar?trainer=mauri')
})

test('almacenamiento lleno o bloqueado: enlace normal (no se rompe la entrada)', () => {
  const broken = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceeded') } }
  assert.equal(entry.accountEntryUrl('/cuenta/entrar', 'mauri', SELECTION, { storage: broken, newId: () => ID, now: NOW }), '/cuenta/entrar?trainer=mauri')
})

test('selección en vivo: publica y avisa, sin persistir', () => {
  let calls = 0
  const off = live.subscribeLiveSelection(() => calls++)
  live.publishLiveSelection(SELECTION)
  assert.equal(calls, 1)
  assert.equal(live.getLiveSelection(), SELECTION)
  off()
  live.publishLiveSelection(live.getEmptyLiveSelection())
  assert.equal(calls, 1, 'tras darse de baja no avisa')
  assert.ok(!read('lib/booking/live-selection.ts').includes('localStorage'))
})

test('página: sin secciones sin datos aprobados y variante solo en /mauri', () => {
  const page = read('app/mauri/page.tsx')
  assert.match(page, /variant="editorial"/)
  for (const absent of ['Sponsor', 'sponsor"', 'TikTok', 'Instagram', 'trainer.bio', 'Paquete']) {
    assert.ok(!page.replace(/\/\*\*[\s\S]*?\*\//, '').includes(absent), `no pinta ${absent}`)
  }
  assert.ok(!read('components/mauri/OfferSection.tsx').includes('Paquete'), 'la oferta no anuncia paquetes')
  assert.ok(!read('app/[trainerSlug]/page.tsx').includes('variant="editorial"'), 'la página genérica conserva la variante por defecto')
})

test('cabecera: los enlaces de cuenta pasan por el borrador', () => {
  const header = read('components/mauri/MauriHeader.tsx')
  assert.match(header, /onClick=\{goToAccount\('\/cuenta\/entrar'\)\}/)
  assert.match(header, /onClick=\{goToAccount\('\/cuenta\/bienvenida'\)\}/)
  assert.ok(!header.includes('supabase'), 'sin auth propia en la cabecera')
})
