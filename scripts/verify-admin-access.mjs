#!/usr/bin/env node
// Acceso a /admin y /api/admin (bloqueante 3 de docs/ANTES_DE_PUBLICAR.md).
//
// Código REAL de las páginas, rutas, proxy.ts y lib/auth/current-admin.ts con
// dobles de la sesión de Supabase Auth y de la base (tabla `admins`,
// migración 020). Cuatro sesiones: sin sesión, jugador, entrenador normal y
// administrador; y la tabla sin crear (020 sin aplicar).
//
//   1. requireAdmin (API): 401 / 403 / 403 / ok; tabla sin crear → 403.
//   2. POST /api/admin/setup-mauri llamado directamente: 401/403 SIN escribir
//      nada; el admin sí; en producción 404 para todos.
//   3. Páginas /admin y /admin/dashboard: sin sesión → login de /admin (con
//      next); jugador / entrenador → 404; admin → se pinta.
//   4. Login y callback: sin credenciales de demo; `next` solo a /admin/*.
//   5. proxy.ts: /admin/** sin sesión → login; /admin/login y /admin/auth públicos.
//   6. Inventario: toda página de app/admin (salvo login y auth) llama a
//      requireAdminPage y toda ruta de app/api/admin a requireAdmin.
//
// Sin servidor, sin .env.local y sin Supabase.
//
//   node scripts/verify-admin-access.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { load, mock, read, root, require } from './lib/ts-harness.mjs'

const USERS = {
  anon: null,
  player: { id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'jugador@example.com' },
  trainer: { id: 'aaaaaaaa-0000-4000-8000-000000000002', email: 'entrenador@example.com' },
  admin: { id: 'aaaaaaaa-0000-4000-8000-000000000003', email: 'admin@example.com' },
}
const ADMIN_IDS = new Set([USERS.admin.id])

const state = { user: null, adminsError: null, writes: [] }
const as = (who, adminsError = null) => Object.assign(state, { user: USERS[who], adminsError, writes: [] })

// Sesión: createSessionClient().auth.getUser()
mock('lib/supabase/server.ts', {
  createSessionClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
      signOut: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ error: null }),
      verifyOtp: async () => ({ error: null }),
    },
  }),
})

// Base (service role): `admins` para el permiso; cualquier otra tabla registra la escritura.
function fakeBuilder(table) {
  const ops = []
  const builder = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve) => {
            if (table === 'admins') {
              if (state.adminsError) return resolve({ data: null, error: state.adminsError })
              const id = ops.find((o) => o.op === 'eq' && o.args[0] === 'auth_user_id')?.args[1]
              return resolve({ data: ADMIN_IDS.has(id) ? { auth_user_id: id } : null, error: null })
            }
            const write = ops.find((o) => ['insert', 'upsert', 'update', 'delete'].includes(o.op))
            if (write) state.writes.push({ table, op: write.op })
            return resolve({ data: { id: 'row-1' }, error: null, count: 0 })
          }
        }
        return (...args) => {
          ops.push({ op: prop, args })
          return builder
        }
      },
    }
  )
  return builder
}
mock('lib/supabase/client.ts', { getSupabaseServerClient: () => ({ from: (table) => fakeBuilder(table) }) })

const { requireAdmin, isAdminUser } = load('lib/auth/current-admin.ts')
const digestOf = async (fn) => {
  try {
    await fn()
    return 'rendered'
  } catch (e) {
    if (typeof e?.digest === 'string') return e.digest
    throw e
  }
}

// ─── 1. requireAdmin ─────────────────────────────────────────────────────────

test('requireAdmin: sin sesión 401, jugador 403, entrenador 403, admin pasa', async () => {
  for (const [who, expected] of [['anon', 401], ['player', 403], ['trainer', 403]]) {
    as(who)
    const r = await requireAdmin()
    assert.ok(r instanceof Response, who)
    assert.equal(r.status, expected, who)
    assert.equal((await r.json()).success, false)
  }
  as('admin')
  const r = await requireAdmin()
  assert.equal(r instanceof Response, false)
  assert.equal(r.id, USERS.admin.id)
})

test('falla cerrado: tabla admins sin crear (020 sin aplicar) o error de lectura → nadie es admin', async () => {
  for (const err of [{ code: 'PGRST205', message: 'Could not find the table public.admins' }, { code: '', message: 'fetch failed' }]) {
    as('admin', err)
    const r = await requireAdmin()
    assert.ok(r instanceof Response)
    assert.equal(r.status, 403)
    assert.equal(await isAdminUser(USERS.admin.id), false)
  }
})

// ─── 2. API llamada directamente ─────────────────────────────────────────────

test('POST /api/admin/setup-mauri directo: 401/403 sin escribir nada; el admin sí escribe', async () => {
  const { POST } = load('app/api/admin/setup-mauri/route.ts')
  const call = () => POST(new Request('http://localhost/api/admin/setup-mauri', { method: 'POST' }))
  for (const [who, status] of [['anon', 401], ['player', 403], ['trainer', 403]]) {
    as(who)
    const res = await call()
    assert.equal(res.status, status, who)
    assert.deepEqual(state.writes, [], `${who}: ninguna escritura`)
  }
  as('admin')
  const res = await call()
  assert.notEqual(res.status, 401)
  assert.notEqual(res.status, 403)
  assert.ok(state.writes.some((w) => w.table === 'trainers'), 'el admin llega a escribir')
})

test('POST /api/admin/setup-mauri en producción: 404 para todos, también el admin, sin escribir', async () => {
  const { POST } = load('app/api/admin/setup-mauri/route.ts')
  const saved = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    for (const who of ['anon', 'player', 'trainer', 'admin']) {
      as(who)
      const res = await POST(new Request('http://localhost/api/admin/setup-mauri', { method: 'POST' }))
      assert.equal(res.status, 404, who)
      assert.deepEqual(state.writes, [])
    }
  } finally {
    process.env.NODE_ENV = saved
  }
})

// ─── 3. Páginas ──────────────────────────────────────────────────────────────

test('páginas /admin/dashboard y /admin: sin sesión → login con next; jugador/entrenador → 404; admin → sí', async () => {
  const Dashboard = load('app/admin/dashboard/page.tsx').default
  const Index = load('app/admin/page.tsx').default
  as('anon')
  assert.equal(await digestOf(Dashboard), 'NEXT_REDIRECT;replace;/admin/login?next=%2Fadmin%2Fdashboard;307;')
  assert.equal(await digestOf(Index), 'NEXT_REDIRECT;replace;/admin/login?next=%2Fadmin;307;')
  for (const who of ['player', 'trainer']) {
    as(who)
    assert.equal(await digestOf(Dashboard), 'NEXT_HTTP_ERROR_FALLBACK;404', who)
    assert.equal(await digestOf(Index), 'NEXT_HTTP_ERROR_FALLBACK;404', who)
  }
  as('admin', { code: 'PGRST205', message: 'missing' })
  assert.equal(await digestOf(Dashboard), 'NEXT_HTTP_ERROR_FALLBACK;404', 'tabla sin crear: 404 también para el admin')
  as('admin')
  assert.equal(await digestOf(Dashboard), 'rendered')
  assert.equal(await digestOf(Index), 'NEXT_REDIRECT;replace;/admin/dashboard;307;')
})

// ─── 4. Login y callback ─────────────────────────────────────────────────────

test('login de /admin: sin credenciales de demo ni formulario de contraseña; usa el login de la app con su callback', () => {
  const code = read('app/admin/login/page.tsx')
  assert.doesNotMatch(code, /Demo credentials|admin@example\.com|type="password"|password/i)
  assert.doesNotMatch(code, /^'use client'/m, 'componente de servidor')
  assert.match(code, /<LoginForm [^>]*callbackPath="\/admin\/auth\/callback"/)
})

test('callback y next: solo vuelve a /admin/*; nada de redirecciones abiertas', async () => {
  const { safeAdminNext } = load('lib/auth/admin-paths.ts')
  for (const [input, out] of [
    [null, '/admin/dashboard'], ['/admin', '/admin'], ['/admin/dashboard', '/admin/dashboard'], ['/admin?x=1', '/admin?x=1'],
    ['//evil.example', '/admin/dashboard'], ['/admin.evil.example', '/admin/dashboard'], ['/administrador', '/admin/dashboard'],
    ['https://evil.example/admin', '/admin/dashboard'], ['/dashboard', '/admin/dashboard'], ['/admin/\\evil', '/admin/dashboard'],
  ]) assert.equal(safeAdminNext(input), out, String(input))

  const { GET } = load('app/admin/auth/callback/route.ts')
  const { NextRequest } = require('next/server')
  let res = await GET(new NextRequest('http://localhost:3001/admin/auth/callback?code=abc&next=//evil.example'))
  assert.equal(res.headers.get('location'), 'http://localhost:3001/admin/dashboard')
  res = await GET(new NextRequest('http://localhost:3001/admin/auth/callback?code=abc&next=%2Fadmin%2Fdashboard'))
  assert.equal(res.headers.get('location'), 'http://localhost:3001/admin/dashboard')
  res = await GET(new NextRequest('http://localhost:3001/admin/auth/callback?error_description=expired'))
  assert.equal(res.headers.get('location'), 'http://localhost:3001/admin/login?error=expired')
})

// ─── 5. proxy.ts ─────────────────────────────────────────────────────────────

test('proxy: /admin/** sin sesión → /admin/login con next; login y auth públicos; con sesión deja pasar (el permiso va en la página)', async () => {
  const ssr = path.relative(root, require.resolve('@supabase/ssr'))
  mock(ssr, { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) })
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://example.supabase.co'
  const { proxy, config } = load('proxy.ts')
  const { NextRequest } = require('next/server')
  assert.ok(config.matcher.includes('/admin/:path*'))
  as('anon')
  let res = await proxy(new NextRequest('http://localhost:3001/admin/dashboard'))
  assert.equal(res.status, 307)
  assert.equal(res.headers.get('location'), 'http://localhost:3001/admin/login?next=%2Fadmin%2Fdashboard')
  res = await proxy(new NextRequest('http://localhost:3001/admin'))
  assert.equal(res.headers.get('location'), 'http://localhost:3001/admin/login', '/admin (raíz) también')
  for (const p of ['/admin/login', '/admin/auth/callback?code=x']) {
    res = await proxy(new NextRequest(`http://localhost:3001${p}`))
    assert.equal(res.headers.get('location'), null, p)
  }
  as('trainer')
  res = await proxy(new NextRequest('http://localhost:3001/admin/dashboard'))
  assert.equal(res.headers.get('location'), null, 'la sesión pasa; requireAdminPage decide')
})

// ─── 6. Inventario ───────────────────────────────────────────────────────────

test('inventario: toda página de /admin (salvo login y auth) y toda ruta de /api/admin comprueban el permiso', () => {
  const files = (dir) => {
    const out = []
    const walk = (d) => {
      for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
        const rel = path.join(d, e.name)
        if (e.isDirectory()) walk(rel)
        else out.push(rel)
      }
    }
    walk(dir)
    return out
  }
  const pages = files('app/admin').filter((f) => /page\.tsx?$/.test(f) && !f.startsWith(path.join('app/admin/login')))
  assert.ok(pages.length >= 2, 'al menos /admin y /admin/dashboard')
  for (const f of pages) assert.match(read(f), /await requireAdminPage\(/, f)
  const adminRoutes = files('app/admin').filter((f) => /route\.ts$/.test(f))
  for (const f of adminRoutes) assert.ok(f.startsWith(path.join('app/admin/auth')), `${f}: solo login/sesión, sin datos`)
  const apis = files('app/api/admin').filter((f) => /route\.ts$/.test(f))
  assert.ok(apis.length >= 1)
  for (const f of apis) {
    const code = read(f)
    assert.match(code, /const admin = await requireAdmin\(\)\s+if \(admin instanceof Response\) return admin/, f)
    // La comprobación va antes de cualquier acceso a la base.
    assert.ok(code.indexOf('requireAdmin()') < code.indexOf('getSupabaseServerClient()', code.indexOf('export async function')), `${f}: permiso antes de la base`)
  }
})
