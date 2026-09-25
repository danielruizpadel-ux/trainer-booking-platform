#!/usr/bin/env node
// Regresiones de POST /api/reservations y GET /api/player/me ejecutando el
// código REAL de las rutas, sin servidor ni Supabase.
//
//   - 23P01 de reservations_no_overlap (migración 008) → 409, sin crear nada.
//   - Cualquier otro error del insert (incluido otro 23P01) → 500, no 409.
//   - Precio (A2): tabla del entrenador × duración × jugadores + descuento por
//     sesiones; el precio del navegador se ignora; sin precio → 409.
//   - Identidad: con cuenta, player_id / contacto / WhatsApp de la sesión;
//     invitado, player_id NULL. 401 / 409 / 503 bien separados.
//   - player_count, client_message y whatsapp_opt_in en CADA fila; `notes`
//     ya no lleva "WhatsApp: si/no"; ni el mensaje ni el contacto van a logs.
//
// Se cargan los .ts de verdad (route.ts, slots.ts, pricing.ts,
// trainer-prices.ts, client-message.ts, booking-contact.ts…). Solo se
// sustituyen por dobles: Supabase, la sesión (findBookingPlayer), la carga de
// ventanas (tiene sus propias pruebas) y las duraciones del entrenador.
//
//   node scripts/verify-reservations-route.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureConsole, fakeSupabase, load, mock } from './lib/ts-harness.mjs'

const TRAINER_ID = '11111111-1111-4111-8111-111111111111'
const WINDOW_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'

const DANI_PRICES = [
  [60, 1, 300], [60, 2, 300], [60, 3, 350], [60, 4, 350],
  [90, 1, 450], [90, 2, 450], [90, 3, 525], [90, 4, 525],
].map(([duration_minutes, player_count, price_rm]) => ({ duration_minutes, player_count, price_rm }))

let state

function reset() {
  state = {
    lookup: { status: 'anonymous' },
    durations: [60, 90],
    prices: DANI_PRICES,
    pricesError: null,
    insertResult: { data: [{ id: 'r-1' }], error: null },
    inserts: [],
    upserts: [],
  }
}
reset()

function respond(table, ops) {
  const has = (op) => ops.find((o) => o.op === op)
  if (table === 'reservations' && has('insert')) {
    state.inserts.push(has('insert').args[0])
    const rows = has('insert').args[0]
    return state.insertResult.error ? state.insertResult : { data: rows.map((_, i) => ({ id: `r-${i + 1}` })), error: null }
  }
  if (table === 'trainer_session_prices') return { data: state.pricesError ? null : state.prices, error: state.pricesError }
  if (table === 'player_trainers' && has('upsert')) {
    state.upserts.push({ row: has('upsert').args[0], options: has('upsert').args[1] })
    return { error: null }
  }
  // availability_slots (refreshWindowStatus) y el resto: nada → salen temprano.
  return { data: null, error: null }
}

mock('lib/supabase/client.ts', { getSupabaseServerClient: () => fakeSupabase(respond), supabaseClient: null })
mock('lib/auth/current-player.ts', { findBookingPlayer: async () => state.lookup })
mock('lib/availability/trainer-durations.ts', { getTrainerDurations: async () => state.durations })
mock('lib/availability/booking.ts', {
  loadOpenWindows: async () => [{ window: { id: WINDOW_ID, session_date: '2099-01-05' }, taken: [] }],
  findBookableWindow: (windows) => windows[0],
})

const route = load('app/api/reservations/route.ts')
const meRoute = load('app/api/player/me/route.ts')

async function post(body) {
  const response = await route.POST(
    new Request('http://localhost/api/reservations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
  return { status: response.status, body: await response.json() }
}

const SESSIONS = [{ date: '2099-01-05', time: '10:00' }]
const sessions = (n) => Array.from({ length: n }, (_, i) => ({ date: '2099-01-05', time: `${String(8 + i).padStart(2, '0')}:00` }))
const ANON = {
  trainer_id: TRAINER_ID,
  sessions: SESSIONS,
  duration_minutes: 60,
  client_name: 'Ana Anónima',
  client_email: 'ana@example.com',
  client_phone: '0123456789',
  client_whatsapp_opt_in: false,
}
const PLAYER_ROW = { id: PLAYER_ID }
const BOOKING_PLAYER = { full_name: 'Dani Ruiz', email: 'dani@example.com', phone: '+60 12 345 6789', whatsapp_opt_in: true }
const AS_PLAYER = { status: 'authenticated', user: { id: 'u' }, player: PLAYER_ROW, bookingPlayer: BOOKING_PLAYER }
const OVERLAP = {
  code: '23P01',
  message: 'conflicting key value violates exclusion constraint "reservations_no_overlap"',
  details: 'Key (trainer_id, tsrange(...))=(...) conflicts with existing key (...).',
}

// ─── Precio ─────────────────────────────────────────────────────────────────

test('precio: tabla de Dani, 60/90 min × 1..4 jugadores (una sesión)', async () => {
  const expected = { '60/1': 300, '60/2': 300, '60/3': 350, '60/4': 350, '90/1': 450, '90/2': 450, '90/3': 525, '90/4': 525 }
  for (const [key, price] of Object.entries(expected)) {
    reset()
    const [duration, players] = key.split('/').map(Number)
    const { status, body } = await post({ ...ANON, duration_minutes: duration, player_count: players })
    assert.equal(status, 200, key)
    assert.equal(body.total, price, key)
    const [row] = state.inserts[0]
    assert.equal(row.price, price, key)
    assert.equal(row.player_count, players, key)
    assert.equal(row.duration_minutes, duration, key)
  }
})

test('precio: el servidor ignora price / total / discount del navegador', async () => {
  reset()
  const { body } = await post({ ...ANON, player_count: 3, price: 1, total: 1, pricePerSession: 1, discount_percent: 99 })
  assert.equal(body.total, 350)
  assert.equal(state.inserts[0][0].price, 350)
})

test('precio: descuento por sesiones sobre la base (3 jugadores, 60 min) y sum(price) == total', async () => {
  for (const [n, pct, per] of [[4, 0, 350], [5, 10, 315], [10, 15, 297.5]]) {
    reset()
    const { status, body } = await post({ ...ANON, sessions: sessions(n), player_count: 3 })
    assert.equal(status, 200, `${n} sesiones`)
    assert.equal(body.discountPercent, pct)
    const rows = state.inserts[0]
    assert.equal(rows.length, n)
    assert.ok(rows.every((r) => r.price === per && r.player_count === 3), `${n} sesiones: ${per} y 3 jugadores en cada fila`)
    assert.equal(Math.round(rows.reduce((s, r) => s + r.price, 0) * 100) / 100, body.total)
  }
})

test('precio: combinación sin configurar → 409 claro, sin insert (nunca RM300 fijo)', async () => {
  reset()
  state.prices = DANI_PRICES.filter((p) => !(p.duration_minutes === 90 && p.player_count === 4))
  const { status, body } = await post({ ...ANON, duration_minutes: 90, player_count: 4 })
  assert.equal(status, 409)
  assert.match(body.error, /hasn't set a price/)
  assert.equal(state.inserts.length, 0)

  reset()
  state.prices = []
  assert.equal((await post(ANON)).status, 409)
  assert.equal(state.inserts.length, 0)
})

test('precio: error leyendo la tabla → 500, sin insert', async () => {
  reset()
  state.pricesError = { code: 'XX000', message: 'boom' }
  const logs = await captureConsole(async () => assert.equal((await post(ANON)).status, 500))
  assert.equal(state.inserts.length, 0)
  assert.match(logs, /precios/)
})

test('player_count fuera de 1..4 o no entero → 400', async () => {
  for (const player_count of [0, 5, 2.5, '2', null]) {
    reset()
    assert.equal((await post({ ...ANON, player_count })).status, 400, JSON.stringify(player_count))
    assert.equal(state.inserts.length, 0)
  }
})

// ─── Mensaje ────────────────────────────────────────────────────────────────

test('mensaje: vacío → NULL; 500 aceptado; 501 → 400; normalizado', async () => {
  reset()
  await post({ ...ANON, client_message: '   \n  ' })
  assert.equal(state.inserts[0][0].client_message, null)

  reset()
  const emojis = '🎾'.repeat(500)
  assert.equal((await post({ ...ANON, client_message: emojis })).status, 200)
  assert.equal(state.inserts[0][0].client_message, emojis)

  reset()
  assert.equal((await post({ ...ANON, client_message: 'a'.repeat(501) })).status, 400)
  assert.equal(state.inserts.length, 0)

  reset()
  await post({ ...ANON, client_message: '  Hola\r\n‮trabajar\u0007 bandeja  ' })
  assert.equal(state.inserts[0][0].client_message, 'Hola\ntrabajar bandeja')
})

test('mensaje y contacto nunca van a los logs (tampoco error.details)', async () => {
  reset()
  state.insertResult = {
    data: null,
    error: { code: '23514', message: 'new row violates check constraint', details: 'Failing row contains (SECRETO-DETALLE, ana@example.com)' },
  }
  const logs = await captureConsole(async () => {
    const { status } = await post({ ...ANON, client_message: 'MENSAJE-PRIVADO lesión de rodilla' })
    assert.equal(status, 500)
  })
  assert.doesNotMatch(logs, /MENSAJE-PRIVADO|SECRETO-DETALLE|ana@example\.com|0123456789|Ana Anónima/)
  assert.match(logs, /23514/)

  reset()
  const okLogs = await captureConsole(() => post({ ...ANON, client_message: 'MENSAJE-PRIVADO' }))
  assert.doesNotMatch(okLogs, /MENSAJE-PRIVADO|ana@example\.com/)
})

// ─── 23P01 ──────────────────────────────────────────────────────────────────

test('23P01 de reservations_no_overlap → 409, en inglés, con rastro en el log', async () => {
  reset()
  state.insertResult = { data: null, error: OVERLAP }
  let result
  const logs = await captureConsole(async () => {
    result = await post(ANON)
  })
  assert.equal(result.status, 409)
  assert.match(result.body.error, /just booked/)
  assert.equal(state.inserts.length, 1, 'un solo insert con todas las sesiones')
  assert.match(logs, /reservations_no_overlap/)
})

test('23P01 con cuenta de jugador → 409 igual, y no se crea la relación', async () => {
  reset()
  state.lookup = AS_PLAYER
  state.insertResult = { data: null, error: OVERLAP }
  await captureConsole(async () => assert.equal((await post({ trainer_id: TRAINER_ID, sessions: SESSIONS, as_player: true })).status, 409))
  assert.equal(state.upserts.length, 0)
})

test('otros errores del insert siguen siendo 500 (no se disfrazan de 409)', async () => {
  for (const dbError of [
    { code: '23P01', message: 'conflicting key value violates exclusion constraint "otra_exclusion"' },
    { code: '23505', message: 'duplicate key value violates unique constraint' },
    { code: '42703', message: 'column "x" does not exist' },
    { message: 'fetch failed' },
  ]) {
    reset()
    state.insertResult = { data: null, error: dbError }
    await captureConsole(async () => {
      const { status, body } = await post(ANON)
      assert.equal(status, 500, JSON.stringify(dbError))
      assert.match(body.error, /couldn't create your booking/)
    })
  }
})

// ─── Invitado ───────────────────────────────────────────────────────────────

test('invitado: contacto del body, player_id NULL, WhatsApp de la casilla, notes sin "WhatsApp:"', async () => {
  for (const optIn of [false, true]) {
    reset()
    state.lookup = { status: 'error', message: 'no debería consultarse' }
    const { status } = await post({ ...ANON, client_whatsapp_opt_in: optIn, player_id: PLAYER_ID })
    assert.equal(status, 200)
    const [row] = state.inserts[0]
    assert.equal(row.client_name, 'Ana Anónima')
    assert.equal(row.client_email, 'ana@example.com')
    assert.equal(row.player_id, null, 'un player_id del body se ignora')
    assert.equal(row.whatsapp_opt_in, optIn)
    assert.equal('notes' in row, false)
    assert.equal(row.status, 'pending_confirmation')
    assert.equal(state.upserts.length, 0)
  }
})

test('invitado: sin casilla → whatsapp_opt_in false (nunca NULL en reservas nuevas)', async () => {
  reset()
  const { client_whatsapp_opt_in, ...noOptIn } = ANON
  void client_whatsapp_opt_in
  await post(noOptIn)
  assert.equal(state.inserts[0][0].whatsapp_opt_in, false)
})

test('invitado sin contacto → 400, sin insert', async () => {
  reset()
  assert.equal((await post({ trainer_id: TRAINER_ID, sessions: SESSIONS })).status, 400)
  assert.equal(state.inserts.length, 0)
})

// ─── Con cuenta ─────────────────────────────────────────────────────────────

test('con cuenta: player_id, contacto y WhatsApp de la sesión; body ignorado', async () => {
  reset()
  state.lookup = AS_PLAYER
  const { status } = await post({
    ...ANON,
    sessions: sessions(2),
    as_player: true,
    player_count: 4,
    client_message: 'Quiero trabajar la bandeja',
    player_id: '99999999-9999-4999-8999-999999999999',
    client_name: 'Suplantador',
    client_email: 'otro@evil.com',
    client_whatsapp_opt_in: false,
  })
  assert.equal(status, 200)
  const rows = state.inserts[0]
  assert.equal(rows.length, 2)
  for (const row of rows) {
    assert.equal(row.player_id, PLAYER_ID)
    assert.equal(row.client_name, 'Dani Ruiz')
    assert.equal(row.client_email, 'dani@example.com')
    assert.equal(row.client_phone, '+60 12 345 6789')
    assert.equal(row.whatsapp_opt_in, true, 'del perfil, no del body')
    assert.equal(row.player_count, 4)
    assert.equal(row.client_message, 'Quiero trabajar la bandeja')
    assert.equal(row.price, 350)
    assert.equal('notes' in row, false)
  }
  assert.deepEqual(state.upserts, [
    {
      row: { player_id: PLAYER_ID, trainer_id: TRAINER_ID, source: 'booking' },
      options: { onConflict: 'player_id,trainer_id', ignoreDuplicates: true },
    },
  ])
})

test('as_player sin sesión → 401, sin insert', async () => {
  reset()
  assert.equal((await post({ ...ANON, as_player: true })).status, 401)
  assert.equal(state.inserts.length, 0)
})

test('as_player con sesión pero sin fila o sin perfil completo → 409, sin insert', async () => {
  for (const lookup of [
    { status: 'authenticated', user: { id: 'u' }, player: null, bookingPlayer: null },
    { status: 'authenticated', user: { id: 'u' }, player: PLAYER_ROW, bookingPlayer: null },
  ]) {
    reset()
    state.lookup = lookup
    const { status, body } = await post({ ...ANON, as_player: true })
    assert.equal(status, 409)
    assert.match(body.error, /Complete your player profile/)
    assert.equal(state.inserts.length, 0)
  }
})

test('as_player con fallo de Supabase → 503, no 401 ni 409, sin insert', async () => {
  reset()
  state.lookup = { status: 'error', message: 'No se pudo cargar tu cuenta de jugador' }
  assert.equal((await post({ ...ANON, as_player: true })).status, 503)
  assert.equal(state.inserts.length, 0)
})

test('selección inválida: sin sesiones, más de 20, fecha mal formada, duración no ofrecida → 400', async () => {
  for (const body of [
    { ...ANON, sessions: [] },
    { ...ANON, sessions: sessions(21) },
    { ...ANON, sessions: [{ date: '05/01/2099', time: '10:00' }] },
    { ...ANON, duration_minutes: 45 },
  ]) {
    reset()
    assert.equal((await post(body)).status, 400)
    assert.equal(state.inserts.length, 0)
  }
  reset()
  state.durations = [60]
  assert.equal((await post({ ...ANON, duration_minutes: 90 })).status, 400)
})

// ─── GET /api/player/me ─────────────────────────────────────────────────────

test('GET /api/player/me: anónimo 200, con cuenta 200, fallo real 503', async () => {
  reset()
  state.lookup = { status: 'anonymous' }
  let res = await meRoute.GET()
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { authenticated: false })

  state.lookup = AS_PLAYER
  res = await meRoute.GET()
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { authenticated: true, player: BOOKING_PLAYER })

  state.lookup = { status: 'authenticated', user: { id: 'u' }, player: null, bookingPlayer: null }
  res = await meRoute.GET()
  assert.deepEqual(await res.json(), { authenticated: true, player: null })

  state.lookup = { status: 'error', message: 'No se pudo comprobar tu sesión' }
  res = await meRoute.GET()
  assert.equal(res.status, 503)
  assert.equal(res.headers.get('cache-control'), 'private, no-store')
})
