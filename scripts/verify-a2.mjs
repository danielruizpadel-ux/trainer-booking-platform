#!/usr/bin/env node
// Pruebas de la Fase A2 (checkout + precios editables), sin servidor ni
// Supabase. Ejecuta el código REAL (lib/**, rutas) con dobles solo para
// Supabase, la sesión del entrenador y la carga/ocupación de ventanas.
//
//   - precios: cálculo, tabla de Dani, descuentos, redondeo, validación del dashboard
//   - client_message: normalización, límites, Unicode, controles y bidi
//   - WhatsApp: columna primero, "WhatsApp: si/no" de notes solo en reservas antiguas
//   - borrador: TTL, entrenador, UUID, duración, jugadores, sin datos sensibles
//   - entrada: draft por el login sin redirecciones abiertas
//   - manual / paquete: precio de 1 jugador, player_id NULL, WhatsApp false
//   - propuesta de otra fecha: copia player_id, client_message, player_count, whatsapp_opt_in
//   - API de precios del dashboard: el entrenador sale de la sesión
//   - cliente de servidor: falla cerrado sin service role
//
//   node scripts/verify-a2.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { captureConsole, fakeSupabase, load, mock, read, root } from './lib/ts-harness.mjs'

const T = '11111111-1111-4111-8111-111111111111'
const W = '22222222-2222-4222-8222-222222222222'
const P = '33333333-3333-4333-8333-333333333333'
const DRAFT = '0b8f3a52-4c1e-4d7a-9a2b-5e6f7a8b9c0d'

const DANI_PRICES = [
  [60, 1, 300], [60, 2, 300], [60, 3, 350], [60, 4, 350],
  [90, 1, 450], [90, 2, 450], [90, 3, 525], [90, 4, 525],
].map(([duration_minutes, player_count, price_rm]) => ({ duration_minutes, player_count, price_rm }))

// Quita comentarios de línea y de bloque: la documentación puede nombrar lo prohibido.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

// ─── Dobles ─────────────────────────────────────────────────────────────────

const db = { prices: DANI_PRICES, inserts: [], updates: [], upserts: [], respond: null }
function resetDb() {
  Object.assign(db, { prices: DANI_PRICES, inserts: [], updates: [], upserts: [], respond: null })
}
function respond(table, ops) {
  if (db.respond) {
    const r = db.respond(table, ops)
    if (r !== undefined) return r
  }
  const has = (op) => ops.find((o) => o.op === op)
  if (table === 'trainer_session_prices' && has('upsert')) {
    db.upserts.push({ rows: has('upsert').args[0], options: has('upsert').args[1] })
    return { error: null }
  }
  if (table === 'trainer_session_prices') return { data: db.prices, error: null }
  if (has('insert')) {
    db.inserts.push({ table, row: has('insert').args[0] })
    return { data: { id: 'new-id' }, error: null }
  }
  if (has('update')) {
    db.updates.push({ table, row: has('update').args[0] })
    return { data: [{ id: 'x' }], error: null }
  }
  return { data: null, error: null }
}

let trainerSession = { id: T }
mock('lib/supabase/client.ts', { getSupabaseServerClient: () => fakeSupabase(respond), supabaseClient: null })
mock('lib/auth/current-trainer.ts', {
  requireTrainer: async () =>
    trainerSession ?? Response.json({ success: false, error: 'No autenticado' }, { status: 401 }),
})
mock('lib/availability/trainer-durations.ts', { getTrainerDurations: async () => [60, 90] })
mock('lib/reservations/slots.ts', {
  OVERLAP_MESSAGE: 'Esa franja se acaba de ocupar. Elige otra hora.',
  isOverlapError: (e) => e?.code === '23P01',
  lookupStatus: () => 409,
  refreshWindowStatus: async () => {},
  reservationRange: () => ({ start_time: '10:00', end_time: '11:00' }),
  loadOwnedOpenWindow: async (_s, slotId, _t, start, duration) => ({
    ok: true,
    window: { id: slotId, session_date: '2099-01-05', trainer_id: T },
    range: { start_time: start, end_time: `${String(Number(start.slice(0, 2)) + duration / 60).padStart(2, '0')}:${start.slice(3, 5)}` },
  }),
})

const pricing = load('lib/reservations/pricing.ts')
const trainerPrices = load('lib/reservations/trainer-prices.ts')
const clientMessage = load('lib/reservations/client-message.ts')
const whatsapp = load('lib/reservations/whatsapp.ts')
const notify = load('lib/notifications/notify.ts')
const draft = load('lib/booking/draft.ts')
const entry = load('lib/players/entry.ts')

// ─── Precios ────────────────────────────────────────────────────────────────

test('precios: tabla de Dani (60/90 × 1..4)', () => {
  const want = { '60/1': 300, '60/2': 300, '60/3': 350, '60/4': 350, '90/1': 450, '90/2': 450, '90/3': 525, '90/4': 525 }
  for (const [k, price] of Object.entries(want)) {
    const [d, p] = k.split('/').map(Number)
    assert.equal(pricing.basePriceFor(DANI_PRICES, d, p), price, k)
    assert.equal(pricing.quoteBooking(DANI_PRICES, 1, d, p).total, price, k)
  }
  assert.equal(pricing.basePriceFor(DANI_PRICES, 45, 1), null)
  assert.equal(pricing.basePriceFor(DANI_PRICES, 60, 5), null)
  assert.equal(pricing.quoteBooking([], 1, 60, 1), null, 'sin configuración no hay precio (ni RM300 fijo)')
})

test('precios: orden base → descuento por sesiones → precio por sesión → total; mismos resultados que antes con 300/450', () => {
  assert.deepEqual(pricing.quoteBooking(DANI_PRICES, 5, 60, 3), {
    durationMinutes: 60, playerCount: 3, pricePerSession: 350, discountPercent: 10, discountedPricePerSession: 315, subtotal: 1750, total: 1575,
  })
  assert.equal(pricing.quoteBooking(DANI_PRICES, 10, 90, 4).discountedPricePerSession, 446.25)
  // Igual que la regla anterior a la 010: 300 × 10 −15 % = 2550; 450 × 5 −10 % = 2025.
  assert.equal(pricing.quoteBooking(DANI_PRICES, 10, 60, 1).total, 2550)
  assert.equal(pricing.quoteBooking(DANI_PRICES, 5, 90, 1).total, 2025)
  assert.equal(pricing.discountPercentFor(4), 0)
  assert.equal(pricing.discountPercentFor(5), 10)
  assert.equal(pricing.discountPercentFor(10), 15)
})

test('precios: sum(precio por sesión) == total para cualquier precio del entrenador', () => {
  for (const base of [333.33, 299.99, 1, 0.01, 1234.56, 99999.99]) {
    for (const n of [1, 3, 5, 7, 10, 13, 20]) {
      const q = pricing.calculateBookingPrice(n, base)
      assert.equal(Math.round(n * q.discountedPricePerSession * 100) / 100, q.total, `${base} × ${n}`)
    }
  }
})

const grid = (overrides = {}) =>
  DANI_PRICES.map((r) => ({ ...r, price_rm: overrides[`${r.duration_minutes}/${r.player_count}`] ?? r.price_rm }))

test('precios del dashboard: rejilla completa válida; importes en texto con coma', () => {
  const ok = trainerPrices.parseTrainerPrices(grid({ '60/3': '350,50' }))
  assert.equal(ok.ok, true)
  assert.equal(ok.rows.find((r) => r.duration_minutes === 60 && r.player_count === 3).price_rm, 350.5)
})

test('precios del dashboard: rechaza lo inválido (todo o nada)', () => {
  const bad = [
    ['falta una', grid().slice(1)],
    ['repetida', [...grid(), grid()[0]]],
    ['cero', grid({ '60/1': 0 })],
    ['negativo', grid({ '60/1': -10 })],
    ['más de 100 000', grid({ '60/1': 100001 })],
    ['3 decimales', grid({ '60/1': 300.001 })],
    ['texto', grid({ '60/1': 'gratis' })],
    ['vacío', grid({ '60/1': '' })],
    ['duración rara', [...grid().slice(1), { duration_minutes: 45, player_count: 1, price_rm: 1 }]],
    ['5 jugadores', [...grid().slice(1), { duration_minutes: 60, player_count: 5, price_rm: 1 }]],
    ['campo de más', grid().map((r, i) => (i === 0 ? { ...r, trainer_id: 'otro' } : r))],
    ['no es lista', { prices: grid() }],
  ]
  for (const [label, input] of bad) assert.equal(trainerPrices.parseTrainerPrices(input).ok, false, label)
})

// ─── Mensaje del cliente ────────────────────────────────────────────────────

test('client_message: vacío → NULL; 500 aceptado; 501 rechazado; Unicode por puntos de código', () => {
  assert.deepEqual(clientMessage.parseClientMessage(undefined), { ok: true, value: null })
  assert.deepEqual(clientMessage.parseClientMessage(null), { ok: true, value: null })
  assert.deepEqual(clientMessage.parseClientMessage('   \n\t '), { ok: true, value: null })
  assert.equal(clientMessage.parseClientMessage('a'.repeat(500)).ok, true)
  assert.equal(clientMessage.parseClientMessage('a'.repeat(501)).ok, false)
  // 500 emojis = 1000 unidades UTF-16 pero 500 puntos de código: se acepta, como en Postgres.
  assert.equal(clientMessage.parseClientMessage('🎾'.repeat(500)).ok, true)
  assert.equal(clientMessage.parseClientMessage('🎾'.repeat(501)).ok, false)
  assert.equal(clientMessage.parseClientMessage('ñandú — lesión leve 🙏').value, 'ñandú — lesión leve 🙏')
  assert.equal(clientMessage.parseClientMessage(42).ok, false)
})

test('client_message: CRLF → LF, sin controles ni marcas bidi, como mucho una línea en blanco', () => {
  const raw = '  Hola\r\nquiero\u0000 trabajar\u0007 la‮ bandeja⁦\r\n\r\n\r\n\r\nGracias‏  '
  assert.equal(clientMessage.parseClientMessage(raw).value, 'Hola\nquiero trabajar la bandeja\n\nGracias')
  assert.equal(clientMessage.parseClientMessage('<b>hola</b>').value, '<b>hola</b>', 'se guarda como texto; React lo escapa al pintar')
})

// ─── WhatsApp ───────────────────────────────────────────────────────────────

test('WhatsApp: la columna manda; notes solo para reservas antiguas (NULL); sin teléfono nunca', () => {
  const pref = whatsapp.whatsappPreference
  assert.equal(pref({ whatsapp_opt_in: true, notes: 'WhatsApp: no' }), true)
  assert.equal(pref({ whatsapp_opt_in: false, notes: 'WhatsApp: si' }), false, 'nueva reserva: el texto de notes no cuenta')
  assert.equal(pref({ whatsapp_opt_in: null, notes: 'WhatsApp: si' }), true, 'antigua')
  assert.equal(pref({ whatsapp_opt_in: null, notes: 'WhatsApp: no' }), false)
  assert.equal(pref({ whatsapp_opt_in: undefined, notes: null }), false)
  assert.equal(notify.wantsWhatsApp({ whatsapp_opt_in: true, notes: null, client_phone: null }), false)
  assert.equal(notify.wantsWhatsApp({ whatsapp_opt_in: true, notes: null, client_phone: '0123456789' }), true)
  assert.equal(notify.wantsWhatsApp({ whatsapp_opt_in: null, notes: 'WhatsApp: si', client_phone: '0123456789' }), true)
})

test('notificaciones: registran whatsapp_logs según la columna y no escriben el contacto en el log', async () => {
  resetDb()
  const logs = await captureConsole(() =>
    notify.notifyReservationConfirmed({ id: 'r1', client_name: 'Ana', client_email: 'ana@example.com', client_phone: '0123456789', whatsapp_opt_in: true, notes: null })
  )
  assert.deepEqual(db.inserts.map((i) => i.table), ['email_logs', 'whatsapp_logs'])
  assert.doesNotMatch(logs, /ana@example\.com|0123456789/)

  resetDb()
  await captureConsole(() =>
    notify.notifyReservationConfirmed({ id: 'r2', client_name: 'Ana', client_email: 'a@b.com', client_phone: '0123456789', whatsapp_opt_in: false, notes: 'WhatsApp: si' })
  )
  assert.deepEqual(db.inserts.map((i) => i.table), ['email_logs'])
})

// ─── Borrador ───────────────────────────────────────────────────────────────

function memoryStorage() {
  const map = new Map()
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get length() {
      return map.size
    },
    key: (i) => [...map.keys()][i] ?? null,
  }
}

const NOW = 1_800_000_000_000
const baseDraft = () =>
  draft.createDraft({ draftId: DRAFT, trainerSlug: 'mauri', sessions: [{ date: '2099-01-05', time: '10:00' }], duration: 60, playerCount: 3 }, NOW)
const expected = { trainerSlug: 'mauri', draftId: DRAFT, now: NOW, allowedDurations: [60, 90] }

test('borrador: solo campos no sensibles, clave versionada y aislada por entrenador + id', () => {
  const d = baseDraft()
  assert.deepEqual(Object.keys(d).sort(), ['draftId', 'duration', 'expiresAt', 'playerCount', 'sessions', 'trainerSlug', 'version'])
  assert.equal(d.expiresAt, NOW + 30 * 60 * 1000)
  assert.equal(draft.draftKey('mauri', DRAFT), `tb:booking-draft:v1:mauri:${DRAFT}`)
  // Aunque el llamador pase datos de más, createDraft no los copia.
  const leaky = draft.createDraft({ ...baseDraft(), name: 'Ana', email: 'a@b.com', client_message: 'x', player_id: P, sessions: [{ date: '2099-01-05', time: '10:00', note: 'x' }] }, NOW)
  assert.equal(JSON.stringify(leaky).match(/Ana|a@b\.com|client_message|player_id|note/), null)
})

test('borrador: parseDraft rechaza caducado, otro entrenador, otro id, UUID inválido, duración o jugadores inválidos, campos sensibles', () => {
  const d = baseDraft()
  assert.ok(draft.parseDraft(d, expected))
  const cases = {
    caducado: [d, { ...expected, now: d.expiresAt }],
    'caducidad demasiado lejana': [{ ...d, expiresAt: NOW + 31 * 60 * 1000 }, expected],
    'otro entrenador': [d, { ...expected, trainerSlug: 'daniel-ruiz' }],
    'otro draftId': [d, { ...expected, draftId: '1b8f3a52-4c1e-4d7a-9a2b-5e6f7a8b9c0d' }],
    'UUID inválido': [{ ...d, draftId: 'nope' }, { ...expected, draftId: 'nope' }],
    'versión': [{ ...d, version: 2 }, expected],
    'duración no ofrecida': [{ ...d, duration: 90 }, { ...expected, allowedDurations: [60] }],
    'duración rara': [{ ...d, duration: 45 }, expected],
    'jugadores 0': [{ ...d, playerCount: 0 }, expected],
    'jugadores 5': [{ ...d, playerCount: 5 }, expected],
    'jugadores 2.5': [{ ...d, playerCount: 2.5 }, expected],
    'con email': [{ ...d, email: 'a@b.com' }, expected],
    'con mensaje': [{ ...d, client_message: 'hola' }, expected],
    'con player_id': [{ ...d, player_id: P }, expected],
    'con precio': [{ ...d, price: 1 }, expected],
    'sesión con campo de más': [{ ...d, sessions: [{ date: '2099-01-05', time: '10:00', price: 1 }] }, expected],
    'sesión mal formada': [{ ...d, sessions: [{ date: '5/1/2099', time: '10:00' }] }, expected],
    'hora mal formada': [{ ...d, sessions: [{ date: '2099-01-05', time: '25:00' }] }, expected],
    'sesiones repetidas': [{ ...d, sessions: [d.sessions[0], d.sessions[0]] }, expected],
    'sin sesiones': [{ ...d, sessions: [] }, expected],
    'más de 20 sesiones': [{ ...d, sessions: Array.from({ length: 21 }, (_, i) => ({ date: `2099-01-${String(i + 1).padStart(2, '0')}`, time: '10:00' })) }, expected],
    'no es objeto': ['hola', expected],
  }
  for (const [label, [raw, exp]] of Object.entries(cases)) assert.equal(draft.parseDraft(raw, exp), null, label)
})

test('borrador: takeDraft lo consume una vez; barrido de caducados; máximo 5; almacenamiento roto no rompe', () => {
  const storage = memoryStorage()
  assert.equal(draft.saveDraft(storage, baseDraft(), NOW), true)
  assert.ok(draft.takeDraft(storage, expected))
  assert.equal(draft.takeDraft(storage, expected), null, 'consumido')

  // JSON corrupto o de otra pestaña → null, sin excepción
  storage.setItem(draft.draftKey('mauri', DRAFT), '{not json')
  assert.equal(draft.takeDraft(storage, expected), null)

  const many = memoryStorage()
  many.setItem('otra-app', 'x')
  many.setItem(`tb:booking-draft:v1:mauri:old`, JSON.stringify({ expiresAt: NOW - 1 }))
  for (let i = 0; i < 7; i++) {
    const id = `${i}b8f3a52-4c1e-4d7a-9a2b-5e6f7a8b9c0d`
    draft.saveDraft(many, { ...baseDraft(), draftId: id, expiresAt: NOW + 1000 + i }, NOW)
  }
  const drafts = [...many.map.keys()].filter((k) => k.startsWith('tb:booking-draft:'))
  assert.ok(drafts.length <= 6, `como mucho 5 + el recién guardado (${drafts.length})`)
  assert.equal(many.getItem('otra-app'), 'x', 'no toca claves ajenas')
  assert.equal(many.getItem('tb:booking-draft:v1:mauri:old'), null, 'caducado borrado')

  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') }, removeItem() {}, length: 0, key: () => null }
  assert.equal(draft.saveDraft(broken, baseDraft(), NOW), false)
  assert.equal(draft.takeDraft(broken, expected), null)
})

test('borrador: lo restaurado nunca salta la validación del servidor (el checkout no manda precio ni identidad)', () => {
  const flow = read('components/booking/BookingFlow.tsx')
  const body = flow.slice(flow.indexOf('const handleConfirmReservation'), flow.indexOf('return (\n    <div'))
  assert.doesNotMatch(body, /price|total|player_id|discount/i)
  const checkout = read('components/booking/checkout/BookingCheckout.tsx')
  const draftCall = checkout.slice(checkout.indexOf('createDraft('), checkout.indexOf('Date.now()\n      )'))
  assert.doesNotMatch(draftCall, /message|guest|name|email|phone|whatsapp|player_id/i)
  assert.match(draftCall, /sessions: sessions\.map\(\(s\) => \(\{ date: s\.date, time: s\.time\.slice\(0, 5\) \}\)\)/)
})

// ─── Entrada con borrador ───────────────────────────────────────────────────

test('entrada: el draft viaja login → callback/vincular → bienvenida → /<entrenador>?draft=…', () => {
  assert.equal(entry.loggedInEntryRedirect('mauri', DRAFT), `/cuenta/auth/vincular?trainer=mauri&draft=${DRAFT}`)
  assert.equal(entry.playerDestination(null, { trainerSlug: 'mauri', draftId: DRAFT }), `/cuenta/bienvenida?trainer=mauri&draft=${DRAFT}`)
  assert.equal(entry.playerDestination('2026-09-24', { trainerSlug: 'mauri', draftId: DRAFT }), `/mauri?draft=${DRAFT}#booking-section`)
  assert.equal(entry.trainerReturnPath('mauri', DRAFT), `/mauri?draft=${DRAFT}#booking-section`)
})

test('entrada: draft inválido se descarta; sin entrenador no hay draft; nunca redirección abierta', () => {
  for (const bad of ['nope', `${DRAFT}#//evil.com`, `${DRAFT}&next=//evil.com`, '//evil.com', DRAFT.toUpperCase(), null]) {
    assert.equal(entry.loggedInEntryRedirect('mauri', bad), '/cuenta/auth/vincular?trainer=mauri', String(bad))
    assert.equal(entry.trainerReturnPath('mauri', bad), '/mauri#booking-section', String(bad))
    assert.equal(entry.playerDestination(null, { trainerSlug: 'mauri', draftId: bad }), '/cuenta/bienvenida?trainer=mauri', String(bad))
  }
  assert.equal(entry.loggedInEntryRedirect(null, DRAFT), '/cuenta')
  assert.equal(entry.playerDestination('2026-09-24', { draftId: DRAFT }), '/cuenta')
  assert.equal(entry.playerDestination(null, { draftId: DRAFT }), '/cuenta/bienvenida')
  assert.equal(entry.isDraftId(DRAFT), true)
})

// ─── Manual y paquetes ──────────────────────────────────────────────────────

test('reserva manual: precio de 1 jugador del entrenador; player_id NULL, 1 jugador, WhatsApp false, sin mensaje', async () => {
  const { createManualReservation } = load('lib/reservations/manual.ts')
  for (const [duration, price] of [[60, 300], [90, 450]]) {
    resetDb()
    const result = await createManualReservation(T, {
      slot_id: W, start_time: '10:00', duration_minutes: duration,
      client_name: 'Ana', client_email: 'ana@example.com', notes: 'Viene con su hermano',
      // Aunque el body lo intente, nada de esto se acepta:
      player_id: P, client_message: 'x', whatsapp_opt_in: true, player_count: 4, price: 1,
    })
    assert.equal(result.ok, true)
    const { row } = db.inserts.find((i) => i.table === 'reservations')
    assert.equal(row.price, price)
    assert.equal(row.player_count, 1)
    assert.equal(row.whatsapp_opt_in, false)
    assert.equal(row.player_id ?? null, null)
    assert.equal(row.client_message ?? null, null)
    assert.equal(row.notes, 'Viene con su hermano', 'notas internas intactas')
  }
})

test('reserva manual / paquete sin precio de 1 jugador → 409 claro, sin insert', async () => {
  const { createManualReservation } = load('lib/reservations/manual.ts')
  const { createClientPackage } = load('lib/packages/create.ts')
  resetDb()
  db.prices = DANI_PRICES.filter((p) => !(p.player_count === 1 && p.duration_minutes === 60))
  const manual = await createManualReservation(T, { slot_id: W, start_time: '10:00', duration_minutes: 60, client_name: 'Ana', client_email: 'ana@example.com' })
  assert.equal(manual.ok, false)
  assert.equal(manual.status, 409)
  assert.match(manual.message, /Perfil → Public pricing/)
  const pkg = await createClientPackage(T, { sessions_total: 5, duration_minutes: 60, client_name: 'Ana', client_email: 'ana@example.com' })
  assert.equal(pkg.ok, false)
  assert.equal(pkg.status, 409)
  assert.equal(db.inserts.length, 0)
})

test('paquete: precio de 1 jugador del entrenador con el descuento de siempre', async () => {
  const { createClientPackage } = load('lib/packages/create.ts')
  resetDb()
  db.prices = grid({ '90/1': 480 })
  const result = await createClientPackage(T, { sessions_total: 10, duration_minutes: 90, client_name: 'Ana', client_email: 'ana@example.com' })
  assert.equal(result.ok, true)
  const { row } = db.inserts.find((i) => i.table === 'client_packages')
  assert.equal(row.price_per_session_normal, 480)
  assert.equal(row.discount_percent, 15)
  assert.equal(row.price_per_session_discounted, 408)
  assert.equal(row.price_total, 4080)
})

test('paquete al agendar: 1 jugador y WhatsApp false (estático)', () => {
  const src = stripComments(read('lib/packages/schedule.ts'))
  const insert = src.slice(src.indexOf(".from('reservations')\n    .insert({"), src.indexOf(".select('id')", src.indexOf(".from('reservations')\n    .insert({")))
  assert.match(insert, /player_count: 1,/)
  assert.match(insert, /whatsapp_opt_in: false,/)
  assert.doesNotMatch(insert, /player_id|client_message/)
})

// ─── Propuesta de otra fecha ────────────────────────────────────────────────

test('proponer otra fecha: la reserva nueva copia player_id, client_message, player_count y whatsapp_opt_in', async () => {
  const { proposeReschedule } = load('lib/reservations/proposal.ts')
  resetDb()
  db.respond = (table, ops) => {
    const update = ops.find((o) => o.op === 'update')
    if (table === 'reservations' && update && update.args[0].status === 'needs_reschedule') return { data: [{ id: 'orig' }], error: null }
    return undefined
  }
  const original = {
    id: 'orig', trainer_id: T, availability_slot_id: W, status: 'pending_confirmation',
    client_name: 'Dani', client_email: 'dani@example.com', client_phone: '0123456789', notes: 'interna', price: 350,
    start_time: '10:00', end_time: '11:00', duration_minutes: 60,
    player_id: P, client_message: 'Quiero trabajar la bandeja', player_count: 3, whatsapp_opt_in: true,
  }
  const result = await captureConsole(() => proposeReschedule(original, W, '12:00', 'http://localhost:3001'))
  void result
  const { row } = db.inserts.find((i) => i.table === 'reservations')
  assert.equal(row.player_id, P)
  assert.equal(row.client_message, 'Quiero trabajar la bandeja')
  assert.equal(row.player_count, 3)
  assert.equal(row.whatsapp_opt_in, true)
  assert.equal(row.price, 350)
  assert.equal(row.status, 'reschedule_proposed')
  assert.equal(row.rescheduled_from_id, 'orig')
})

test('mover / cancelar / confirmar mantienen los campos (no los escriben) y los selects traen whatsapp_opt_in', () => {
  const edit = read('lib/reservations/edit.ts')
  assert.match(edit, /SELECT_FOR_EDIT =\s*'[^']*whatsapp_opt_in'/)
  const parse = edit.slice(edit.indexOf('export function parseDetails'), edit.indexOf('export async function updateReservationDetails'))
  assert.doesNotMatch(parse, /player_id|client_message|player_count|whatsapp_opt_in/, 'el PUT del dashboard no puede tocarlos')
  const move = edit.slice(edit.indexOf('export async function moveReservation'), edit.indexOf('export async function cancelReservation'))
  assert.doesNotMatch(move, /player_id|client_message|player_count|whatsapp_opt_in/)
  for (const f of ['lib/reservations/confirmation.ts', 'lib/reservations/edit.ts']) {
    assert.doesNotMatch(read(f).replace(/SELECT_FOR_EDIT =[^\n]*\n[^\n]*/, ''), /player_id:/, f)
  }
  assert.match(read('lib/reservations/proposal.ts'), /SELECT_FOR_PROPOSAL =\s*'[^']*player_id, client_message, player_count, whatsapp_opt_in'/)
})

// ─── API de precios del dashboard ───────────────────────────────────────────

test('PUT /api/dashboard/pricing: guarda con el trainer_id de la SESIÓN; trainer_id del body → 400; sin sesión → 401', async () => {
  const route = load('app/api/dashboard/pricing/route.ts')
  const put = (body) =>
    route.PUT(new Request('http://localhost/api/dashboard/pricing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

  resetDb()
  trainerSession = { id: T }
  let res = await put({ prices: grid({ '60/1': 320 }) })
  assert.equal(res.status, 200)
  assert.equal(db.upserts.length, 1)
  assert.ok(db.upserts[0].rows.every((r) => r.trainer_id === T))
  assert.equal(db.upserts[0].rows.find((r) => r.duration_minutes === 60 && r.player_count === 1).price_rm, 320)
  assert.deepEqual(db.upserts[0].options, { onConflict: 'trainer_id,duration_minutes,player_count' })

  resetDb()
  res = await put({ prices: grid(), trainer_id: 'otro-entrenador' })
  assert.equal(res.status, 400)
  assert.equal(db.upserts.length, 0)

  resetDb()
  res = await put({ prices: grid().map((r) => ({ ...r, trainer_id: 'otro' })) })
  assert.equal(res.status, 400)

  resetDb()
  res = await put({ prices: grid({ '90/4': -1 }) })
  assert.equal(res.status, 400)
  assert.equal(db.upserts.length, 0)

  resetDb()
  trainerSession = null
  res = await put({ prices: grid() })
  assert.equal(res.status, 401)
  assert.equal(db.upserts.length, 0)
  trainerSession = { id: T }
})

test('GET /api/pricing (público): solo las duraciones ofrecidas, sin datos del entrenador', async () => {
  const route = load('app/api/pricing/route.ts')
  resetDb()
  const res = await route.GET(Object.assign(new Request(`http://localhost/api/pricing?trainer_id=${T}`), { nextUrl: new URL(`http://localhost/api/pricing?trainer_id=${T}`) }))
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.prices.length, 8)
  assert.deepEqual(Object.keys(body).sort(), ['discounts', 'durations', 'prices', 'success'])
})

// ─── Cliente de servidor ────────────────────────────────────────────────────

test('getSupabaseServerClient falla cerrado sin SUPABASE_SERVICE_ROLE_KEY (nunca cae a anon)', () => {
  // supabase-js necesita un WebSocket global al crear el cliente; Next lo da, Node 20 no.
  const script = `
    globalThis.WebSocket ??= class {}
    import('${path.join(root, 'scripts/lib/ts-harness.mjs')}').then(({ load }) => {
      const { getSupabaseServerClient } = load('lib/supabase/client.ts')
      try { getSupabaseServerClient(); console.log('NO-THROW') } catch (e) { console.log('THROW:' + e.message) }
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'
      const c = getSupabaseServerClient(); console.log(typeof c.from === 'function' ? 'CLIENT' : 'NO-CLIENT')
    })`
  const env = { ...process.env }
  delete env.SUPABASE_SERVICE_ROLE_KEY
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' })
  assert.match(out.stdout, /THROW:SUPABASE_SERVICE_ROLE_KEY no está configurada/)
  assert.match(out.stdout, /CLIENT/)
  assert.doesNotMatch(read('lib/supabase/client.ts'), /return supabaseClient;/)
})

// ─── Estático ───────────────────────────────────────────────────────────────

function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name)
    return e.isDirectory() ? walk(rel) : /\.(ts|tsx)$/.test(e.name) ? [rel] : []
  })
}

test('estático: sin dangerouslySetInnerHTML; client_message nunca en console.*; sin RM300 fijo en el código', () => {
  const files = [...walk('app'), ...walk('components'), ...walk('lib')]
  for (const f of files) {
    const src = stripComments(read(f))
    assert.doesNotMatch(src, /dangerouslySetInnerHTML/, f)
    for (const line of src.split('\n').filter((l) => /console\.(log|warn|error|info)/.test(l))) {
      assert.doesNotMatch(line, /client_message|clientMessage|message\.value|client_email|client_phone/, `${f}: ${line.trim()}`)
    }
  }
  assert.doesNotMatch(stripComments(read('lib/reservations/pricing.ts')), /PRICE_PER_SESSION_RM|\b300\b/)
  assert.doesNotMatch(read('lib/availability/durations.ts'), /durationMultiplier/)
})
