#!/usr/bin/env node
// Idempotencia y límite de POST /api/reservations (migración 021) con el
// código REAL de la ruta y de lib/reservations/{idempotency,rate-limit,
// idempotency-client}.ts. Sin servidor, sin Supabase, sin .env.local: la base
// es un doble que registra cada llamada. La parte de PostgreSQL (transacción,
// esperas en el índice único, contadores bajo concurrencia) la prueba
// scripts/verify-booking-idempotency-db.sh.
//
//   node scripts/verify-booking-idempotency.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { captureConsole, fakeSupabase, load, mock, read } from './lib/ts-harness.mjs'

const TRAINER_ID = '11111111-1111-4111-8111-111111111111'
const WINDOW_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_PLAYER_ID = '44444444-4444-4444-8444-444444444444'
const KEY = '0f8b6d7e-1c2a-4b3c-9d4e-5f6a7b8c9d0e'
const PRICES = [60, 90].flatMap((d) => [1, 2, 3, 4].map((p) => ({ duration_minutes: d, player_count: p, price_rm: 300 })))

let state
function reset() {
  state = {
    lookup: { status: 'anonymous' },
    stored: new Map(), // `${scope}|${key}` → { request_hash, response }
    lookupError: null,
    rate: { data: [{ allowed: true, bucket: null, retry_after: 0 }], error: null },
    create: null, // null → comportamiento de la base (guarda y devuelve created/replayed/key_reused)
    createThrows: false,
    calls: [], // { name, params }
    windowsLoaded: 0,
  }
}
reset()

function respond(table, ops) {
  if (table === 'booking_requests') {
    const eq = Object.fromEntries(ops.filter((o) => o.op === 'eq').map((o) => o.args))
    state.calls.push({ name: 'lookup', params: eq })
    if (state.lookupError) return { data: null, error: state.lookupError }
    return { data: state.stored.get(`${eq.scope}|${eq.idempotency_key}`) ?? null, error: null }
  }
  if (table === 'rpc:rate_limit_consume') {
    state.calls.push({ name: 'rate', params: ops[0].args[0] })
    return state.rate
  }
  if (table === 'rpc:create_booking_request') {
    const p = ops[0].args[0]
    state.calls.push({ name: 'create', params: p })
    if (state.createThrows) throw new Error('fetch failed')
    if (state.create) return state.create
    // Lo mismo que hace la función SQL, en pequeño.
    const id = `${p.p_scope}|${p.p_key}`
    const existing = state.stored.get(id)
    if (existing) {
      return existing.request_hash === p.p_request_hash
        ? { data: [{ outcome: 'replayed', response: existing.response, reservation_ids: existing.response.reservationIds }], error: null }
        : { data: [{ outcome: 'key_reused', response: null, reservation_ids: null }], error: null }
    }
    const ids = p.p_rows.map((_, i) => `res-${state.stored.size + 1}-${i + 1}`)
    const response = { ...p.p_response, reservationIds: ids }
    state.stored.set(id, { request_hash: p.p_request_hash, response })
    return { data: [{ outcome: 'created', response, reservation_ids: ids }], error: null }
  }
  if (table === 'trainer_session_prices') return { data: PRICES, error: null }
  if (table === 'player_trainers') return { error: null }
  return { data: null, error: null }
}

mock('lib/supabase/client.ts', { getSupabaseServerClient: () => fakeSupabase(respond), supabaseClient: null })
mock('lib/auth/current-player.ts', { findBookingPlayer: async () => state.lookup })
mock('lib/availability/trainer-durations.ts', { getTrainerDurations: async () => [60, 90] })
mock('lib/availability/booking.ts', {
  loadOpenWindows: async () => {
    state.windowsLoaded++
    return [{ window: { id: WINDOW_ID, session_date: '2099-01-05' }, taken: [] }]
  },
  findBookableWindow: (windows) => windows[0],
})

const route = load('app/api/reservations/route.ts')
const rateLimit = load('lib/reservations/rate-limit.ts')
const client = load('lib/reservations/idempotency-client.ts')

const ANON = {
  trainer_id: TRAINER_ID,
  sessions: [{ date: '2099-01-05', time: '10:00' }],
  duration_minutes: 60,
  client_name: 'Ana',
  client_email: 'ana@example.com',
  client_phone: '0123456789',
}
const asPlayer = (id) => ({
  status: 'authenticated',
  user: { id: 'u' },
  player: { id },
  bookingPlayer: { full_name: 'Dani', email: 'dani@example.com', phone: '+60 12 345 6789', whatsapp_opt_in: true },
})
const PLAYER_BODY = { trainer_id: TRAINER_ID, sessions: ANON.sessions, duration_minutes: 60, as_player: true }

async function post(body, { key = KEY, headers = {}, handler = route.POST } = {}) {
  const h = { 'content-type': 'application/json', ...headers }
  if (key !== null) h['idempotency-key'] = key
  const response = await handler(new Request('http://localhost/api/reservations', { method: 'POST', headers: h, body: JSON.stringify(body) }))
  return { status: response.status, headers: response.headers, body: await response.json() }
}
const count = (name) => state.calls.filter((c) => c.name === name).length

// ─── Clave ──────────────────────────────────────────────────────────────────

test('sin clave o con una clave que no es UUID → 400, sin tocar la base', async () => {
  for (const key of [null, '', 'abc', '12345678-1234-1234-1234-1234567890'.slice(0, 30), `${KEY}x`]) {
    reset()
    const { status, body } = await post(ANON, { key })
    assert.equal(status, 400, String(key))
    assert.equal(body.code, 'idempotency_key_required')
    assert.equal(state.calls.length, 0)
  }
})

test('primera petición: una sola escritura atómica, con scope, clave y huella; respuesta con ids', async () => {
  reset()
  const { status, body } = await post(ANON, { key: KEY.toUpperCase() })
  assert.equal(status, 200)
  assert.equal(body.success, true)
  assert.deepEqual(body.reservationIds, ['res-1-1'])
  assert.equal(count('create'), 1)
  const p = state.calls.find((c) => c.name === 'create').params
  assert.equal(p.p_key, KEY, 'clave normalizada en minúsculas')
  assert.match(p.p_scope, /^guest:[0-9a-f]{64}$/, 'invitado: hash del email, no el email')
  assert.doesNotMatch(JSON.stringify(p.p_scope), /ana@example/)
  assert.match(p.p_request_hash, /^[0-9a-f]{64}$/)
  assert.equal(p.p_rows.length, 1)
  assert.equal('reservationIds' in p.p_response, false, 'los ids los pone la base')
  assert.doesNotMatch(JSON.stringify(p.p_response), /ana@example|0123456789/, 'la respuesta guardada no lleva contacto')
})

// ─── Respuesta perdida → repetir ────────────────────────────────────────────

test('se guardó pero la respuesta se perdió: repetir devuelve lo mismo, sin revalidar ni crear ni contar', async () => {
  reset()
  const first = await post(ANON)
  const before = { create: count('create'), rate: count('rate'), windows: state.windowsLoaded }
  const again = await post(ANON)
  assert.equal(again.status, 200)
  assert.deepEqual(again.body, first.body, 'la misma respuesta, los mismos ids')
  assert.equal(again.headers.get('idempotent-replayed'), 'true')
  assert.equal(count('create'), before.create, 'no se crea otra reserva')
  assert.equal(count('rate'), before.rate, 'la repetición no gasta el límite')
  assert.equal(state.windowsLoaded, before.windows, 'no se revalida (las horas ya las ocupa la propia reserva)')
})

test('la huella no depende del orden de las sesiones ni del formato de la hora', async () => {
  reset()
  const two = [{ date: '2099-01-05', time: '10:00' }, { date: '2099-01-05', time: '12:00' }]
  await post({ ...ANON, sessions: two })
  const again = await post({ ...ANON, sessions: [{ date: '2099-01-05', time: '12:00:00' }, { date: '2099-01-05', time: '10:00' }] })
  assert.equal(again.status, 200)
  assert.equal(again.headers.get('idempotent-replayed'), 'true')
})

test('dos peticiones a la vez con la misma clave: la base resuelve (una crea, la otra recibe la misma respuesta)', async () => {
  reset()
  // Las dos pasan la búsqueda previa sin encontrar nada; la base serializa.
  const [a, b] = await Promise.all([post(ANON), post(ANON)])
  assert.equal(a.status, 200)
  assert.equal(b.status, 200)
  assert.deepEqual(a.body, b.body)
  assert.equal(state.stored.size, 1)
  const replayed = [a, b].filter((r) => r.headers.get('idempotent-replayed') === 'true')
  assert.equal(replayed.length, 1)
})

test('outcome replayed de la base → misma respuesta; key_reused → 422', async () => {
  reset()
  state.create = { data: [{ outcome: 'replayed', response: { success: true, reservationIds: ['x'] }, reservation_ids: ['x'] }], error: null }
  const r = await post(ANON)
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.reservationIds, ['x'])
  assert.equal(r.headers.get('idempotent-replayed'), 'true')

  reset()
  state.create = { data: [{ outcome: 'key_reused', response: null, reservation_ids: null }], error: null }
  const k = await post(ANON)
  assert.equal(k.status, 422)
  assert.equal(k.body.code, 'idempotency_key_reused')
})

// ─── Misma clave, otros datos / otro cliente ────────────────────────────────

test('misma clave con otros datos → 422, sin crear', async () => {
  for (const change of [
    { sessions: [{ date: '2099-01-05', time: '11:00' }] },
    { player_count: 2 },
    { duration_minutes: 90 },
    { client_message: 'hola' },
    { client_phone: '0999999999' },
    { client_name: 'Otra' },
    { client_whatsapp_opt_in: true },
  ]) {
    reset()
    await post(ANON)
    const r = await post({ ...ANON, ...change })
    assert.equal(r.status, 422, JSON.stringify(change))
    assert.equal(r.body.code, 'idempotency_key_reused')
    assert.equal(count('create'), 1, JSON.stringify(change))
    assert.equal(r.body.reservationIds, undefined, 'no enseña la respuesta original')
  }
})

test('la clave de un cliente no da la respuesta de otro (scope por jugador de la sesión o email)', async () => {
  reset()
  state.lookup = asPlayer(PLAYER_ID)
  const mine = await post(PLAYER_BODY)
  assert.equal(mine.status, 200)
  const scopes = new Set([state.calls.find((c) => c.name === 'create').params.p_scope])
  assert.deepEqual([...scopes], [`player:${PLAYER_ID}`])

  // Otro jugador con la MISMA clave y el mismo body: su propio scope → reserva nueva suya.
  state.lookup = asPlayer(OTHER_PLAYER_ID)
  const other = await post(PLAYER_BODY)
  assert.equal(other.status, 200)
  assert.equal(other.headers.get('idempotent-replayed'), null)
  assert.notDeepEqual(other.body.reservationIds, mine.body.reservationIds)

  // Un invitado con el email del jugador y la misma clave: scope de invitado, no el del jugador.
  state.lookup = { status: 'anonymous' }
  const guest = await post({ ...ANON, client_email: 'dani@example.com' })
  assert.equal(guest.status, 200)
  assert.equal(guest.headers.get('idempotent-replayed'), null)
  assert.notDeepEqual(guest.body.reservationIds, mine.body.reservationIds)

  // Cada búsqueda previa filtró por su scope.
  const lookups = state.calls.filter((c) => c.name === 'lookup').map((c) => c.params.scope)
  assert.deepEqual(lookups.slice(0, 2), [`player:${PLAYER_ID}`, `player:${OTHER_PLAYER_ID}`])
  assert.match(lookups[2], /^guest:/)
  assert.equal(state.stored.size, 3)
})

test('el body no puede elegir el scope (player_id del body se ignora)', async () => {
  reset()
  state.lookup = asPlayer(PLAYER_ID)
  await post(PLAYER_BODY)
  state.lookup = { status: 'anonymous' }
  const r = await post({ ...ANON, player_id: PLAYER_ID, as_player: false })
  assert.equal(r.headers.get('idempotent-replayed'), null)
  assert.match(state.calls.filter((c) => c.name === 'lookup').at(-1).params.scope, /^guest:/)
})

// ─── Límite ─────────────────────────────────────────────────────────────────

test('límite agotado → 429 con Retry-After, sin crear', async () => {
  reset()
  state.rate = { data: [{ allowed: false, bucket: 'email:x', retry_after: 125 }], error: null }
  const r = await post(ANON)
  assert.equal(r.status, 429)
  assert.equal(r.headers.get('retry-after'), '125')
  assert.equal(r.body.code, 'rate_limited')
  assert.equal(r.body.retryAfter, 125)
  assert.match(r.body.error, /3 minutes/)
  assert.equal(count('create'), 0)
  assert.equal(state.windowsLoaded, 0)
})

test('si no se puede comprobar el límite → 503 (falla cerrado), sin crear', async () => {
  for (const rate of [{ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }, { data: [], error: null }]) {
    reset()
    state.rate = rate
    await captureConsole(async () => assert.equal((await post(ANON)).status, 503))
    assert.equal(count('create'), 0)
  }
  reset()
  state.lookupError = { code: '42P01', message: 'relation "booking_requests" does not exist' }
  await captureConsole(async () => assert.equal((await post(ANON)).status, 503))
  assert.equal(count('create'), 0)
})

test('cubos: jugador por sesión; invitado por email y teléfono con hash; el del entrenador el último', async () => {
  reset()
  state.lookup = asPlayer(PLAYER_ID)
  await post({ ...PLAYER_BODY, client_email: 'otro@x.com' })
  let p = state.calls.find((c) => c.name === 'rate').params
  assert.deepEqual(p.p_buckets, [`player:${PLAYER_ID}`, `trainer:${TRAINER_ID}`])
  assert.deepEqual(p.p_limits, [rateLimit.RATE_LIMITS.player, rateLimit.RATE_LIMITS.trainer])
  assert.equal(p.p_window_seconds, rateLimit.RATE_WINDOW_SECONDS)

  reset()
  await post({ ...ANON, client_email: ' Ana@Example.com ', client_phone: '+60 (12) 3' })
  p = state.calls.find((c) => c.name === 'rate').params
  assert.equal(p.p_buckets.length, 3)
  assert.match(p.p_buckets[0], /^email:[0-9a-f]{64}$/)
  assert.match(p.p_buckets[1], /^phone:[0-9a-f]{64}$/)
  assert.equal(p.p_buckets[2], `trainer:${TRAINER_ID}`)
  assert.doesNotMatch(p.p_buckets.join(), /ana|example|60123/i, 'nada en claro')
  // El mismo email con otras mayúsculas/espacios cae en el mismo cubo.
  assert.deepEqual(rateLimit.rateLimitBuckets({ guestEmail: 'ana@example.com', trainerId: 't' }).buckets[0], p.p_buckets[0])
})

test('IP: X-Forwarded-For se ignora salvo que TRUSTED_CLIENT_IP_HEADER nombre la cabecera de la plataforma', async () => {
  const saved = process.env.TRUSTED_CLIENT_IP_HEADER
  try {
    delete process.env.TRUSTED_CLIENT_IP_HEADER
    reset()
    await post(ANON, { headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' } })
    assert.ok(!state.calls.find((c) => c.name === 'rate').params.p_buckets.some((b) => b.startsWith('ip:')), 'sin variable no hay cubo de IP')

    process.env.TRUSTED_CLIENT_IP_HEADER = 'x-real-ip'
    reset()
    await post(ANON, { headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' } })
    const buckets = state.calls.find((c) => c.name === 'rate').params.p_buckets
    const ipBuckets = buckets.filter((b) => b.startsWith('ip:'))
    assert.equal(ipBuckets.length, 1)
    assert.equal(ipBuckets[0], rateLimit.rateLimitBuckets({ clientIp: '5.6.7.8', trainerId: 't' }).buckets[0], 'la IP de x-real-ip, no la de x-forwarded-for')
    assert.equal(buckets.at(-1), `trainer:${TRAINER_ID}`, 'el del entrenador sigue el último')
  } finally {
    if (saved === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER
    else process.env.TRUSTED_CLIENT_IP_HEADER = saved
  }
  const req = (h) => new Request('http://x', { headers: h })
  assert.equal(rateLimit.trustedClientIp(req({ 'x-forwarded-for': '1.1.1.1' }), undefined), null)
  assert.equal(rateLimit.trustedClientIp(req({ 'x-forwarded-for': '1.1.1.1' }), 'x-real-ip'), null)
  assert.equal(rateLimit.trustedClientIp(req({ 'x-vercel-forwarded-for': '9.9.9.9, 1.1.1.1' }), 'X-Vercel-Forwarded-For'), '9.9.9.9')
})

// ─── Resultado desconocido ──────────────────────────────────────────────────

test('la escritura sale y no vuelve (excepción) → 500 outcome_unknown, sin decir que no se creó', async () => {
  reset()
  state.createThrows = true
  const r = await post(ANON)
  assert.equal(r.status, 500)
  assert.equal(r.body.code, 'outcome_unknown')
  assert.match(r.body.error, /won't book twice/)
  assert.doesNotMatch(r.body.error, /couldn't create|not created|wasn't created/)
})

test('errores sin evidencia de rechazo → outcome_unknown; 23P01 de la 008 → 409; falta la función (PGRST202 con su nombre) → 503', async () => {
  for (const error of [
    { message: 'fetch failed' },
    { code: '57014', message: 'canceling statement due to statement timeout' },
    { code: 'PGRST202', message: 'Could not find the function public.otra_funcion' },
    { code: '08006', message: 'connection failure' },
  ]) {
    reset()
    state.create = { data: null, error }
    await captureConsole(async () => {
      const r = await post(ANON)
      assert.equal(r.status, 500, JSON.stringify(error))
      assert.equal(r.body.code, 'outcome_unknown', JSON.stringify(error))
    })
  }
  reset()
  state.create = {
    data: null,
    error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "reservations_no_overlap"' },
  }
  await captureConsole(async () => assert.equal((await post(ANON)).status, 409))

  reset()
  state.create = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.create_booking_request(p_key, …) in the schema cache' } }
  await captureConsole(async () => assert.equal((await post(ANON)).status, 503))

  for (const data of [[], [{ outcome: 'created', response: null, reservation_ids: [] }], [{ outcome: 'otro' }]]) {
    reset()
    state.create = { data, error: null }
    const r = await post(ANON)
    assert.equal(r.status, 500, JSON.stringify(data))
    assert.equal(r.body.code, 'outcome_unknown')
  }
})

test('un fallo después de la escritura (p. ej. al vincular) no se presenta como "no se creó"', async () => {
  const src = read('app/api/reservations/route.ts')
  const tail = src.slice(src.indexOf('} catch (error) {', src.indexOf('writeSent = true')))
  assert.match(tail, /if \(writeSent\) return bad\(UNCONFIRMED_EN, 500, \{ code: 'outcome_unknown' \}\)/)
  assert.ok(src.indexOf('writeSent = true') < src.indexOf('await supabase.rpc(CREATE_FUNCTION'))
})

// ─── Navegador ──────────────────────────────────────────────────────────────

test('cliente: la misma clave mientras la petición no cambie; nueva si cambia', () => {
  let n = 0
  const gen = () => `k${++n}`
  const a = client.attemptKeyFor(null, 'body-1', gen)
  assert.equal(a.key, 'k1')
  assert.equal(client.attemptKeyFor(a, 'body-1', gen), a)
  const b = client.attemptKeyFor(a, 'body-2', gen)
  assert.equal(b.key, 'k2')
  assert.match(client.newIdempotencyKey(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('cliente: clasificación del resultado (red / ilegible / outcome_unknown → no confirmado)', async () => {
  const json = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  assert.equal((await client.readCheckoutOutcome(async () => { throw new TypeError('Failed to fetch') })).kind, 'unconfirmed')
  assert.equal((await client.readCheckoutOutcome(async () => new Response('<html>502</html>', { status: 502 }))).kind, 'unconfirmed')
  assert.equal((await client.readCheckoutOutcome(json(504, { message: 'gateway' }))).kind, 'unconfirmed')
  assert.equal((await client.readCheckoutOutcome(json(500, { success: false, error: 'x', code: 'outcome_unknown' }))).kind, 'unconfirmed')
  assert.equal((await client.readCheckoutOutcome(json(200, { success: true, total: 1 }))).kind, 'ok')
  const f = await client.readCheckoutOutcome(json(409, { success: false, error: 'taken' }))
  assert.deepEqual(f, { kind: 'failed', status: 409, message: 'taken', code: undefined })
  const rl = await client.readCheckoutOutcome(json(429, { success: false, error: 'Too many', code: 'rate_limited' }))
  assert.equal(rl.kind, 'failed')
  assert.equal(rl.status, 429)
  assert.doesNotMatch(client.UNCONFIRMED_BOOKING_MESSAGE, /couldn't create|not created|failed/i)
})

test('BookingFlow manda la clave, la conserva si no hay confirmación y solo la suelta al confirmarse', () => {
  const src = read('components/booking/BookingFlow.tsx')
  const fn = src.slice(src.indexOf('const payload = JSON.stringify(body)'), src.indexOf('onBooked?.()') + 12)
  assert.match(fn, /attemptKeyFor\(attemptKeyRef\.current, payload\)/)
  assert.match(fn, /'Idempotency-Key': attempt\.key/)
  assert.match(fn, /body: payload/)
  assert.match(fn, /outcome\.kind === 'unconfirmed'\) throw new CheckoutError\(UNCONFIRMED_BOOKING_MESSAGE, 0\)/)
  // La clave solo se borra después de un ok (las dos ramas de error lanzan antes).
  assert.ok(fn.indexOf('attemptKeyRef.current = null') > fn.indexOf("outcome.kind === 'failed'"))
  assert.doesNotMatch(src, /fetch\('\/api\/reservations'[\s\S]{0,200}\n\s*\}\)\n\s*const data = await response\.json/)
  // El otro formulario que llamaba a la ruta no se usa en ninguna página.
  const legacyUsers = ['app', 'components'].flatMap((dir) => listFiles(dir)).filter((f) => /from ['"]@\/components\/trainer\/BookingForm['"]|from ['"]\.\/BookingForm['"]/.test(read(f)))
  assert.deepEqual(legacyUsers.filter((f) => !f.endsWith('components/trainer/BookingSection.tsx')), [])
  const sectionUsers = ['app', 'components'].flatMap((dir) => listFiles(dir)).filter((f) => /components\/trainer\/BookingSection['"]/.test(read(f)))
  assert.deepEqual(sectionUsers, [], 'components/trainer/BookingSection no se importa')
})

function listFiles(dir) {
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const out = []
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(rootDir, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name)
      if (e.isDirectory()) walk(r)
      else if (/\.tsx?$/.test(e.name)) out.push(r)
    }
  }
  walk(dir)
  return out
}

// ─── Mutación: ¿las pruebas detectan que falte la repetición? ───────────────

test('mutación: sin la búsqueda previa, la repetición revalida y gasta el límite (la prueba lo detecta)', async () => {
  const src = read('app/api/reservations/route.ts')
  const start = src.indexOf('    const stored = await findStoredBooking(')
  const end = src.indexOf('    // trainer_id puede venir como uuid o como slug.')
  assert.ok(start > 0 && end > start)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idem-mut-'))
  const file = path.join(dir, 'route.ts')
  fs.writeFileSync(file, src.slice(0, start) + src.slice(end))
  try {
    const mutant = (await import('node:module')).createRequire(import.meta.url)(file)
    reset()
    await post(ANON, { handler: mutant.POST })
    const rateBefore = count('rate')
    const windowsBefore = state.windowsLoaded
    await post(ANON, { handler: mutant.POST })
    assert.ok(count('rate') > rateBefore || state.windowsLoaded > windowsBefore, 'el mutante revalida o cuenta: las aserciones de arriba fallarían')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
