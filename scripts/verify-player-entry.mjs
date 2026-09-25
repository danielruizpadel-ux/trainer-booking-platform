#!/usr/bin/env node
// Pruebas de la entrada de jugadores a /cuenta (Fase A1, revisión de Codex):
//
//   HIGH 1 — un usuario YA autenticado que abre /cuenta/entrar?trainer=<slug>
//            no debe perder el entrenador (proxy → /cuenta/auth/vincular), y
//            el vínculo es idempotente, solo con entrenadores activos y sin
//            reactivar relaciones archivadas.
//   HIGH 2 — la página pública de Mauri enlaza a /cuenta/entrar?trainer=<slug>.
//
// Y la integración con la reserva (REAL AUTH TEST, 24/09/2026):
//   A/B/C — destino tras entrar: con entrenador de origen se vuelve a su
//           reserva (pasando por bienvenida si falta); sin él, /cuenta.
//   D/F   — con cuenta, el contacto de la reserva sale de la sesión; el
//           navegador no puede elegir player_id ni datos de contacto.
//   G     — el contexto del entrenador no permite redirecciones abiertas.
//
// Sin Supabase ni servidor: transpila con `typescript` (ya en devDependencies)
// los módulos puros lib/players/entry.ts y lib/players/trainers.ts y usa un
// cliente de Supabase falso en memoria. No toca .env.local ni la base de datos.
//
//   node scripts/verify-player-entry.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-player-entry-'))
for (const name of ['entry', 'trainers', 'booking-contact']) {
  const source = fs.readFileSync(path.join(root, 'lib/players', `${name}.ts`), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  })
  fs.writeFileSync(path.join(outDir, `${name}.js`), outputText)
}
const entry = require(path.join(outDir, 'entry.js'))
const trainers = require(path.join(outDir, 'trainers.js'))
const bookingContact = require(path.join(outDir, 'booking-contact.js'))

const headers = (values) => ({ get: (name) => values[name.toLowerCase()] ?? null })

// ---------------------------------------------------------------------------
// HIGH 1 — reglas puras
// ---------------------------------------------------------------------------

test('slug: solo minúsculas, dígitos y guiones', () => {
  for (const ok of ['mauri', 'daniel-ruiz', 'a', 'x9']) assert.equal(entry.isValidTrainerSlug(ok), true, ok)
  for (const bad of [null, undefined, '', 'MAURI', 'mau ri', '../admin', '-mauri', 'mauri-', 'a/b', '%2e', 'x'.repeat(65)]) {
    assert.equal(entry.isValidTrainerSlug(bad), false, String(bad))
  }
})

test('proxy con sesión en /cuenta/entrar: con trainer válido va a vincular, si no a /cuenta', () => {
  assert.equal(entry.loggedInEntryRedirect('mauri'), '/cuenta/auth/vincular?trainer=mauri')
  assert.equal(entry.loggedInEntryRedirect('daniel-ruiz'), '/cuenta/auth/vincular?trainer=daniel-ruiz')
  assert.equal(entry.loggedInEntryRedirect(null), '/cuenta')
  assert.equal(entry.loggedInEntryRedirect(''), '/cuenta')
  assert.equal(entry.loggedInEntryRedirect('//evil.com'), '/cuenta')
  assert.equal(entry.loggedInEntryRedirect('mauri&next=//evil.com'), '/cuenta')
})

test('vínculo implícito solo desde nuestra web o abierto a mano (anti-CSRF)', () => {
  assert.equal(entry.allowsImplicitTrainerLink(headers({ 'sec-fetch-site': 'same-origin' })), true)
  assert.equal(entry.allowsImplicitTrainerLink(headers({ 'sec-fetch-site': 'none' })), true)
  assert.equal(entry.allowsImplicitTrainerLink(headers({})), true, 'navegador sin Fetch Metadata')
  assert.equal(entry.allowsImplicitTrainerLink(headers({ 'sec-fetch-site': 'cross-site' })), false)
  assert.equal(entry.allowsImplicitTrainerLink(headers({ 'sec-fetch-site': 'same-site' })), false)
  assert.equal(entry.allowsImplicitTrainerLink(headers({ 'sec-fetch-site': 'same-origin', 'next-router-prefetch': '1' })), false)
  assert.equal(entry.allowsImplicitTrainerLink(headers({ 'sec-fetch-site': 'same-origin', 'sec-purpose': 'prefetch' })), false)
})

const DONE = '2026-09-24T00:00:00Z'

test('A. usuario nuevo desde /mauri: bienvenida con el entrenador, y después su reserva', () => {
  assert.equal(entry.playerDestination(null, { trainerSlug: 'mauri' }), '/cuenta/bienvenida?trainer=mauri')
  // bienvenida calcula la vuelta con trainerReturnPath tras completar el onboarding
  assert.equal(entry.trainerReturnPath('mauri'), '/mauri#booking-section')
})

test('B. usuario con onboarding hecho desde /mauri: directo a la reserva de Mauri', () => {
  assert.equal(entry.playerDestination(DONE, { trainerSlug: 'mauri' }), '/mauri#booking-section')
  // el entrenador de origen gana a `next`
  assert.equal(entry.playerDestination(DONE, { trainerSlug: 'mauri', next: '/cuenta/x' }), '/mauri#booking-section')
})

test('C. sin entrenador: /cuenta (o bienvenida sin contexto)', () => {
  assert.equal(entry.playerDestination(null), '/cuenta/bienvenida')
  assert.equal(entry.playerDestination(null, { next: '/cuenta/x' }), '/cuenta/bienvenida')
  assert.equal(entry.playerDestination(DONE), '/cuenta')
  assert.equal(entry.playerDestination(DONE, { next: '/cuenta/x' }), '/cuenta/x')
  assert.equal(entry.playerDestination(DONE, { trainerSlug: null }), '/cuenta')
})

test('multi-entrenador: la vuelta es genérica por slug, nada fijo a Mauri', () => {
  assert.equal(entry.playerDestination(DONE, { trainerSlug: 'daniel-ruiz' }), '/daniel-ruiz#booking-section')
  assert.equal(entry.playerDestination(null, { trainerSlug: 'daniel-ruiz' }), '/cuenta/bienvenida?trainer=daniel-ruiz')
})

test('G. el contexto del entrenador no permite redirecciones abiertas', () => {
  const hostile = [
    '//evil.com', 'https://evil.com', 'http:evil.com', '/\\evil.com', 'evil.com/x', '..', '../cuenta',
    'mauri/../../x', 'mauri?x=1', 'mauri#x', 'mauri%2F', '@evil.com', 'MAURI', ' mauri', 'mauri\n',
  ]
  for (const slug of hostile) {
    for (const done of [null, DONE]) {
      const destination = entry.playerDestination(done, { trainerSlug: slug })
      assert.ok(['/cuenta', '/cuenta/bienvenida'].includes(destination), `${JSON.stringify(slug)} → ${destination}`)
    }
    assert.equal(entry.trainerReturnPath(slug), '/cuenta', JSON.stringify(slug))
  }
  // Todo destino válido es una ruta interna: empieza por "/" y no por "//".
  for (const slug of ['mauri', 'daniel-ruiz', 'a']) {
    for (const d of [entry.playerDestination(null, { trainerSlug: slug }), entry.playerDestination(DONE, { trainerSlug: slug })]) {
      assert.match(d, /^\/(?!\/)/)
      assert.equal(new URL(d, 'http://localhost:3001').origin, 'http://localhost:3001')
    }
  }
})

// ---------------------------------------------------------------------------
// HIGH 1 — vínculo contra un Supabase falso con semántica ON CONFLICT DO NOTHING
// ---------------------------------------------------------------------------

function fakeSupabase({ trainerRows }) {
  const links = new Map() // `${player_id}:${trainer_id}` -> fila
  const calls = { trainerLookups: 0, upserts: [] }

  const client = {
    from(table) {
      if (table === 'trainers') {
        const filters = {}
        const query = {
          select: () => query,
          eq: (column, value) => ((filters[column] = value), query),
          maybeSingle: async () => {
            calls.trainerLookups++
            const row = trainerRows.find((t) => Object.entries(filters).every(([k, v]) => t[k] === v))
            return { data: row ? { ...row } : null, error: null }
          },
        }
        return query
      }
      if (table === 'player_trainers') {
        return {
          upsert: async (row, options) => {
            calls.upserts.push({ row, options })
            assert.equal(options?.onConflict, 'player_id,trainer_id')
            const key = `${row.player_id}:${row.trainer_id}`
            if (links.has(key)) {
              if (!options?.ignoreDuplicates) links.set(key, { ...links.get(key), ...row })
            } else {
              links.set(key, { status: 'active', ...row })
            }
            return { error: null }
          },
        }
      }
      throw new Error(`tabla inesperada ${table}`)
    },
  }
  return { client, links, calls }
}

const TRAINERS = [
  { id: 't-mauri', slug: 'mauri', name: 'Mauricio Martin', status: 'active' },
  { id: 't-legacy', slug: 'legacy', name: 'Legado', status: null }, // filas antiguas sin status: activo por defecto
  { id: 't-off', slug: 'retirado', name: 'Retirado', status: 'inactive' },
]

test('findActiveTrainerBySlug: solo activos; slug malo o inexistente → null sin romper', async () => {
  const db = fakeSupabase({ trainerRows: TRAINERS })
  assert.deepEqual(await trainers.findActiveTrainerBySlug(db.client, 'mauri'), {
    ok: true,
    trainer: { id: 't-mauri', slug: 'mauri', name: 'Mauricio Martin' },
  })
  assert.equal((await trainers.findActiveTrainerBySlug(db.client, 'legacy')).trainer?.id, 't-legacy')
  assert.equal((await trainers.findActiveTrainerBySlug(db.client, 'retirado')).trainer, null)
  assert.equal((await trainers.findActiveTrainerBySlug(db.client, 'no-existe')).trainer, null)
  const lookups = db.calls.trainerLookups
  assert.equal((await trainers.findActiveTrainerBySlug(db.client, '//evil.com')).trainer, null)
  assert.equal((await trainers.findActiveTrainerBySlug(db.client, null)).trainer, null)
  assert.equal(db.calls.trainerLookups, lookups, 'un slug malo no llega a la base de datos')
})

test('vincula con un entrenador activo, con el player_id que le pasa el servidor', async () => {
  const db = fakeSupabase({ trainerRows: TRAINERS })
  const result = await trainers.linkPlayerToTrainerBySlug(db.client, 'p-1', 'mauri', 'self_signup')
  assert.deepEqual(result, { ok: true, trainerId: 't-mauri' })
  assert.equal(db.calls.upserts.length, 1)
  const { row, options } = db.calls.upserts[0]
  assert.deepEqual(row, { player_id: 'p-1', trainer_id: 't-mauri', source: 'self_signup' })
  assert.equal('status' in row, false, 'el insert no manda status: no puede reactivar')
  assert.equal(options.ignoreDuplicates, true)
  assert.equal(db.links.get('p-1:t-mauri').status, 'active')
})

test('entrenador sin status (legado) cuenta como activo', async () => {
  const db = fakeSupabase({ trainerRows: TRAINERS })
  const result = await trainers.linkPlayerToTrainerBySlug(db.client, 'p-1', 'legacy', 'self_signup')
  assert.equal(result.ok, true)
})

test('entrenador inexistente o inactivo: no se crea nada', async () => {
  for (const slug of ['no-existe', 'retirado']) {
    const db = fakeSupabase({ trainerRows: TRAINERS })
    const result = await trainers.linkPlayerToTrainerBySlug(db.client, 'p-1', slug, 'self_signup')
    assert.equal(result.ok, false, slug)
    assert.equal(db.calls.upserts.length, 0, slug)
  }
})

test('slug mal formado: ni siquiera consulta la base de datos', async () => {
  const db = fakeSupabase({ trainerRows: TRAINERS })
  const result = await trainers.linkPlayerToTrainerBySlug(db.client, 'p-1', '../mauri', 'self_signup')
  assert.equal(result.ok, false)
  assert.equal(db.calls.trainerLookups, 0)
  assert.equal(db.calls.upserts.length, 0)
})

test('entrar dos veces no duplica la relación ni cambia su source', async () => {
  const db = fakeSupabase({ trainerRows: TRAINERS })
  await trainers.linkPlayerToTrainer(db.client, 'p-1', 't-mauri', 'booking')
  await trainers.linkPlayerToTrainerBySlug(db.client, 'p-1', 'mauri', 'self_signup')
  await trainers.linkPlayerToTrainerBySlug(db.client, 'p-1', 'mauri', 'self_signup')
  assert.equal(db.links.size, 1)
  assert.equal(db.links.get('p-1:t-mauri').source, 'booking')
})

test('una relación archivada NO se reactiva al volver a entrar', async () => {
  const db = fakeSupabase({ trainerRows: TRAINERS })
  db.links.set('p-1:t-mauri', { player_id: 'p-1', trainer_id: 't-mauri', source: 'self_signup', status: 'archived' })
  const result = await trainers.linkPlayerToTrainerBySlug(db.client, 'p-1', 'mauri', 'self_signup')
  assert.equal(result.ok, true)
  assert.equal(db.links.get('p-1:t-mauri').status, 'archived')
  assert.equal(db.links.size, 1)
})

// ---------------------------------------------------------------------------
// D/F — contacto de la reserva con cuenta de jugador
// ---------------------------------------------------------------------------

const PROFILE = { full_name: 'Dani Ruiz', phone: '+60 12 345 6789', whatsapp_opt_in: true, onboarding_completed_at: DONE }

test('D. el contacto sale del perfil y el email de la identidad autenticada', () => {
  const player = bookingContact.bookingPlayerFromProfile({ ...PROFILE, email: 'viejo@x.com' }, ' Dani@Example.com ')
  assert.deepEqual(player, { full_name: 'Dani Ruiz', email: 'dani@example.com', phone: '+60 12 345 6789', whatsapp_opt_in: true })
  assert.deepEqual(bookingContact.bookingContactFromPlayer(player), {
    client_name: 'Dani Ruiz',
    client_email: 'dani@example.com',
    client_phone: '+60 12 345 6789',
    client_whatsapp_opt_in: true,
  })
})

test('D. sin perfil completo no hay reserva con cuenta (vuelve el formulario)', () => {
  assert.equal(bookingContact.bookingPlayerFromProfile({ ...PROFILE, onboarding_completed_at: null }, 'a@b.com'), null)
  assert.equal(bookingContact.bookingPlayerFromProfile({ ...PROFILE, full_name: null }, 'a@b.com'), null)
  assert.equal(bookingContact.bookingPlayerFromProfile({ ...PROFILE, phone: null }, 'a@b.com'), null)
  assert.equal(bookingContact.bookingPlayerFromProfile(PROFILE, null), null)
})

test('F. POST /api/reservations con as_player toma el contacto de la sesión, nunca del body', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/reservations/route.ts'), 'utf8')
  assert.doesNotMatch(route, /body\.player_id|player_id\s*[:=]\s*body|playerId\s*=\s*body/)
  const block = route.slice(route.indexOf('if (body.as_player === true)'), route.indexOf("if (!client_name || !client_email"))
  assert.match(block, /await findBookingPlayer\(\)/)
  assert.match(block, /const contact = bookingContactFromPlayer\(lookup\.bookingPlayer\)/)
  assert.match(block, /playerId = lookup\.player\.id/)
  assert.match(block, /whatsappOptIn = contact\.client_whatsapp_opt_in/)
  assert.match(block, /, 401\)/)
  assert.match(block, /, 409\)/)
  assert.match(block, /, 503\)/)
  // El comportamiento real de la ruta (401/409/503, 23P01→409) lo ejecuta
  // scripts/verify-reservations-route.mjs.
})

test('paso 4: error de Auth por red/caída ≠ sin sesión', () => {
  const infra = bookingContact.isAuthInfraError
  assert.equal(infra(null), false)
  assert.equal(infra({ name: 'AuthSessionMissingError', status: 400 }), false, 'sin sesión')
  assert.equal(infra({ name: 'AuthApiError', status: 401 }), false, 'token caducado')
  assert.equal(infra({ name: 'AuthApiError', status: 403 }), false, 'token inválido')
  assert.equal(infra({ name: 'AuthInvalidJwtError', status: 400 }), false)
  assert.equal(infra({ name: 'AuthRetryableFetchError', status: 0 }), true, 'red')
  assert.equal(infra({ name: 'AuthRetryableFetchError', status: 503 }), true)
  assert.equal(infra({ name: 'AuthUnknownError' }), true)
  assert.equal(infra({ name: 'AuthApiError', status: 500 }), true, 'Auth caído')
})

test('paso 3: con sesión y perfil incompleto no se enseña el formulario anónimo', () => {
  const section = fs.readFileSync(path.join(root, 'components/mauri/BookingSection.tsx'), 'utf8')
  assert.match(section, /\? \{ kind: 'player', player: account\.player \}\s*: \{ kind: 'incomplete', completeProfileHref \}/)
  assert.match(section, /`\/cuenta\/bienvenida\?trainer=\$\{encodeURIComponent\(trainerSlug\)\}`/)
  // un fallo al comprobar la cuenta se dice (no se hace pasar por anónimo en silencio)
  assert.match(section, /setAccount\(\{ status: 'error' \}\)/)
  assert.match(section, /No hemos podido comprobar tu cuenta de jugador/)

  // Checkout A2: solo el invitado (anonymous) ve el formulario; incompleto
  // pide completar el perfil; sin cuenta lista (loading/incomplete) no se confirma.
  const checkout = fs.readFileSync(path.join(root, 'components/booking/checkout/BookingCheckout.tsx'), 'utf8')
  assert.match(checkout, /const isGuest = account\.kind === 'anonymous'/)
  assert.match(checkout, /\(account\.kind === 'player' \|\| \(isGuest && guestValid\)\)/)
  assert.match(checkout, /account\.kind === 'incomplete' && \(/)
  assert.match(checkout, /goToAccount\('\/cuenta\/bienvenida'\)/)
  assert.match(checkout, /\{isGuest && \(/)
})

test('D/E. el widget con cuenta manda as_player sin datos de contacto; sin cuenta, el body de siempre', () => {
  const flow = fs.readFileSync(path.join(root, 'components/booking/BookingFlow.tsx'), 'utf8')
  assert.match(flow, /account\.kind === 'player'\s*\? \{ \.\.\.common, as_player: true \}/)
  assert.match(flow, /client_name: guest\?\.name \?\? '',\s+client_email: guest\?\.email \?\? '',\s+client_phone: guest\?\.phone \?\? '',\s+client_whatsapp_opt_in: guest\?\.whatsapp \?\? false/)
  const code = flow.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(code, /player_id/, 'el navegador nunca manda player_id')
})

test('WhatsApp de la reserva = avisos operativos, no tips', () => {
  const checkout = fs.readFileSync(path.join(root, 'components/booking/checkout/BookingCheckout.tsx'), 'utf8')
  assert.doesNotMatch(checkout, /tips/i)
  assert.match(checkout, /Receive booking updates on WhatsApp/)
  assert.match(checkout, /Confirmation and changes to this booking only\./)
})

test('/api/player/me es de solo lectura y no acepta parámetros', () => {
  const me = fs.readFileSync(path.join(root, 'app/api/player/me/route.ts'), 'utf8')
  assert.match(me, /findBookingPlayer\(\)/)
  assert.doesNotMatch(me, /ensurePlayerForUser|getPlayerSession|request\.|searchParams/)
})

// ---------------------------------------------------------------------------
// Comprobaciones estáticas del código de rutas
// ---------------------------------------------------------------------------

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(full) : [full]
  })
}

test('ninguna ruta de /cuenta ni /api/player lee player_id de la petición', () => {
  const files = [...filesUnder(path.join(root, 'app/cuenta')), ...filesUnder(path.join(root, 'app/api/player'))]
  for (const file of files) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /player_id|playerId/, path.relative(root, file))
  }
})

test('proxy usa loggedInEntryRedirect para /cuenta/entrar con sesión', () => {
  const proxy = fs.readFileSync(path.join(root, 'proxy.ts'), 'utf8')
  assert.match(proxy, /loggedInEntryRedirect\(request\.nextUrl\.searchParams\.get\('trainer'\), request\.nextUrl\.searchParams\.get\('draft'\)\)/)
})

test('vincular usa finishPlayerEntry con la comprobación de origen', () => {
  const route = fs.readFileSync(path.join(root, 'app/cuenta/(public)/auth/vincular/route.ts'), 'utf8')
  assert.match(route, /allowsImplicitTrainerLink\(request\.headers\)/)
  assert.match(route, /finishPlayerEntry\(user, \{ trainerSlug, draftId, linkTrainer \}\)/)
})

// ---------------------------------------------------------------------------
// HIGH 2 — acceso desde la página pública
// ---------------------------------------------------------------------------

test('la página de Mauri pasa el slug y BookingSection enlaza a /cuenta/entrar?trainer=', () => {
  const page = fs.readFileSync(path.join(root, 'app/mauri/page.tsx'), 'utf8')
  assert.match(page, /trainerSlug=\{trainer\.slug\}/)
  const section = fs.readFileSync(path.join(root, 'components/mauri/BookingSection.tsx'), 'utf8')
  assert.match(section, /`\/cuenta\/entrar\?trainer=\$\{encodeURIComponent\(trainerSlug\)\}`/)
  assert.match(section, /href=\{entryHref\}/)
  assert.doesNotMatch(section, /<Link\s/, 'sin prefetch de /cuenta/entrar')
})

process.on('exit', () => fs.rmSync(outDir, { recursive: true, force: true }))
