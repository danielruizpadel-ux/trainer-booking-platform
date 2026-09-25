#!/usr/bin/env node
// Regresión de seguridad: "Your bookings" en /cuenta (revisión 25/09/2026).
//
// El fallo: PlayerReservationsCard.tsx llevaba 'use server', así que Next la
// registraba como Server Action. Cualquiera con sesión podía hacer POST /cuenta
// con `Next-Action: <id>` y body [{"playerKey":"<uuid de otro>"}] y recibir
// las reservas de esa cuenta (consulta con service role, sin RLS).
//
// Aquí se ejecuta el componente REAL con dobles de la sesión y de Supabase y
// se reproduce esa llamada: aunque llegue un playerKey (o cualquier otro
// argumento), el filtro es SIEMPRE el jugador de la sesión. Sin servidor ni
// Supabase reales.
//
//   node scripts/verify-player-reservations.mjs

import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase, load, mock, read, root } from './lib/ts-harness.mjs'

const SESSION_PLAYER = '11111111-1111-4111-8111-111111111111'
const OTHER_PLAYER = '22222222-2222-4222-8222-222222222222'

const state = { session: null, queries: [] }
mock('lib/auth/current-player.ts', {
  getPlayerSession: async () => ({ user: state.session ? { id: 'auth-a' } : null, player: state.session }),
})
mock('lib/supabase/client.ts', {
  getSupabaseServerClient: () =>
    fakeSupabase((table, ops) => {
      state.queries.push({ table, ops })
      return { data: [], error: null }
    }),
})

const { PlayerReservationsCard } = load('components/player/PlayerReservationsCard.tsx')
const { listPlayerReservations, PLAYER_RESERVATION_COLUMNS } = load('lib/players/reservations.ts')

const reset = (session) => {
  state.session = session
  state.queries = []
}
const playerFilter = () => {
  const q = state.queries.find((x) => x.table === 'reservations')
  return q?.ops.find((o) => o.op === 'eq' && o.args[0] === 'player_id')?.args[1]
}

// Código sin comentarios: la documentación puede nombrar lo prohibido.
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

test('uso normal: filtra por el jugador de la SESIÓN', async () => {
  reset({ id: SESSION_PLAYER })
  await PlayerReservationsCard()
  assert.equal(playerFilter(), SESSION_PLAYER)
})

test('ataque reproducido: un playerKey de otra cuenta en los argumentos se IGNORA', async () => {
  reset({ id: SESSION_PLAYER })
  // Mismo argumento que mandaba el POST de la Server Action.
  await PlayerReservationsCard({ playerKey: OTHER_PLAYER })
  assert.equal(playerFilter(), SESSION_PLAYER)
  assert.notEqual(playerFilter(), OTHER_PLAYER)
  // Otras formas de colar el id tampoco cambian el filtro.
  for (const arg of [OTHER_PLAYER, { player_id: OTHER_PLAYER }, { playerId: OTHER_PLAYER }]) {
    reset({ id: SESSION_PLAYER })
    await PlayerReservationsCard(arg)
    assert.equal(playerFilter(), SESSION_PLAYER)
  }
})

test('sin sesión: no pinta nada y NO consulta reservas (ni con un playerKey)', async () => {
  reset(null)
  const out = await PlayerReservationsCard({ playerKey: OTHER_PLAYER })
  assert.equal(out, null)
  assert.equal(state.queries.length, 0)
})

test('el componente no es Server Action ni acepta el jugador por props', () => {
  const src = code('components/player/PlayerReservationsCard.tsx')
  assert.doesNotMatch(src, /['"]use server['"]/)
  assert.match(src, /export async function PlayerReservationsCard\(\)/, 'sin parámetros')
  assert.doesNotMatch(src, /playerKey/)
  const page = code('app/cuenta/(protected)/page.tsx')
  assert.match(page, /<PlayerReservationsCard \/>/, 'la página no le pasa ningún id')
})

test("ningún componente ni página declara 'use server' (sería invocable desde el navegador)", () => {
  const offenders = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(rel)
      else if (/\.tsx$/.test(entry.name) && /^\s*['"]use server['"]/m.test(code(rel))) offenders.push(rel)
    }
  }
  walk('components')
  walk('app')
  assert.deepEqual(offenders, [])
})

test('la consulta solo pide columnas de la cuenta (nada de contacto, notas, precio ni token)', async () => {
  for (const c of ['client_email', 'client_phone', 'client_name', 'notes', 'price', 'proposal_token', 'client_message']) {
    assert.doesNotMatch(PLAYER_RESERVATION_COLUMNS, new RegExp(`\\b${c}\\b`), c)
  }
  const ops = []
  const fake = { from: (t) => { const b = new Proxy({}, { get: (_, p) => (p === 'then' ? (res) => res({ data: [], error: null }) : (...a) => { ops.push({ t, p, a }); return b }) }); return b } }
  const r = await listPlayerReservations(fake, SESSION_PLAYER)
  assert.equal(r.ok, true)
  assert.deepEqual(ops.find((o) => o.p === 'eq').a, ['player_id', SESSION_PLAYER])
})

test('si hay un build de desarrollo, el manifiesto de Server Actions no incluye la tarjeta', () => {
  const manifest = path.join(root, '.next/dev/server/server-reference-manifest.json')
  if (!fs.existsSync(manifest)) return
  assert.doesNotMatch(fs.readFileSync(manifest, 'utf8'), /PlayerReservationsCard/)
})

test('estados en la cuenta: todos los de status.ts, completed incluido; lo desconocido no pasa por pendiente', () => {
  const { statusLabel } = load('components/player/PlayerReservationsCard.tsx')
  assert.equal(statusLabel('completed'), 'Completada')
  assert.equal(statusLabel('confirmed'), 'Confirmada')
  assert.equal(statusLabel('pending_confirmation'), 'Pendiente de confirmar')
  assert.equal(statusLabel('cancelled'), 'Cancelada')
  assert.equal(statusLabel('needs_reschedule'), 'Sin pista: elige otra hora')
  assert.equal(statusLabel('reschedule_proposed'), 'Nueva hora propuesta')
  assert.notEqual(statusLabel('algo_nuevo'), 'Pendiente de confirmar')
  const { RESERVATION_STATUS } = load('lib/reservations/status.ts')
  for (const value of Object.values(RESERVATION_STATUS).filter((v) => !['available', 'pending', 'full'].includes(v))) {
    assert.notEqual(statusLabel(value), 'Estado desconocido', `falta etiqueta para ${value}`)
  }
})
