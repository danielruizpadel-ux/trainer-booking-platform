#!/usr/bin/env node
// Prueba de migrations/010_checkout_a2.sql sobre un Postgres REAL en memoria
// (PGlite, Postgres compilado a WASM, con btree_gist para la 008). No toca
// Supabase ni la red.
//
// Emula lo que importa de Supabase: roles anon / authenticated / service_role
// (BYPASSRLS), auth.users + auth.uid(), y los GRANT ALL por defecto que
// Supabase da a anon y authenticated en `public`. Crea el esquema base que
// describe docs/DATABASE.md y aplica las migraciones REALES 002–009 del repo
// antes de la 010.
//
// Comprueba:
//   - la 010 aborta sin la 008 o sin la 009;
//   - aplicada DOS veces, termina igual (idempotente) y no pisa precios editados;
//   - anon / authenticated no pueden INSERT/UPDATE/DELETE/TRUNCATE (ni con una
//     política permisiva preexistente); la service role sí;
//   - las políticas históricas y las de escritura se borran; una SELECT ajena se conserva;
//   - columnas, defaults, CHECKs, FK ON DELETE SET NULL e índice parcial;
//   - reservas existentes intactas (sin backfill);
//   - una restricción previa con otra definición queda con la de la 010;
//   - datos existentes inválidos → error claro antes de crear restricciones;
//   - reservations_no_overlap (008) sigue funcionando;
//   - trainer_session_prices: 8 precios por entrenador con la tabla de Dani.
//
// PGlite no está en package.json (solo hace falta para esta prueba):
//
//   npm i --no-save @electric-sql/pglite     # o: PGLITE_DIR=<carpeta con node_modules>
//   node scripts/verify-migration-010.mjs

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const resolver = createRequire(path.join(process.env.PGLITE_DIR ?? root, 'noop.js'))
let PGlite, btree_gist
try {
  ;({ PGlite } = await import(resolver.resolve('@electric-sql/pglite')))
  ;({ btree_gist } = await import(resolver.resolve('@electric-sql/pglite/contrib/btree_gist')))
} catch {
  console.error('Falta @electric-sql/pglite: npm i --no-save @electric-sql/pglite (o PGLITE_DIR=...)')
  process.exit(1)
}

const migration = (name) => fs.readFileSync(path.join(root, 'migrations', name), 'utf8')
const M = Object.fromEntries(
  fs
    .readdirSync(path.join(root, 'migrations'))
    .filter((f) => /^0(0[2-9]|10)_.*\.sql$/.test(f))
    .map((f) => [f.slice(0, 3), migration(f)])
)

const T1 = '11111111-1111-4111-8111-111111111111'
const T2 = '22222222-2222-4222-8222-222222222222'
const W1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const U1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

/** Supabase mínimo + esquema base (docs/DATABASE.md) + datos + extras previos. */
async function freshDb({ upTo = '009', skip = [], before010 = '' } = {}) {
  const db = new PGlite({ extensions: { btree_gist } })
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema extensions;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    -- Lo que hace Supabase: todo para los tres roles, también en tablas futuras.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

    create table public.trainers (
      id uuid primary key default gen_random_uuid(),
      slug text not null, name text not null, email text not null,
      status text default 'active',
      created_at timestamp default now(), updated_at timestamp default now()
    );
    create table public.availability_slots (
      id uuid primary key default gen_random_uuid(),
      trainer_id uuid references public.trainers (id),
      session_date date not null, start_time time not null, end_time time not null,
      class_type text default 'private', max_capacity int default 1, current_bookings int default 0,
      status text default 'available',
      created_at timestamptz default now(), updated_at timestamptz default now(),
      unique (trainer_id, session_date, start_time, end_time)
    );
    create table public.reservations (
      id uuid primary key default gen_random_uuid(),
      trainer_id uuid references public.trainers (id),
      availability_slot_id uuid references public.availability_slots (id),
      client_name text, client_email text, client_phone text,
      price numeric, status text default 'pending', notes text,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    alter table public.trainers enable row level security;
    alter table public.availability_slots enable row level security;
    alter table public.reservations enable row level security;

    -- Las políticas históricas de migrations/001, más una de escritura con
    -- otro nombre y una SELECT ajena, para ver qué borra la 010.
    create policy "Anyone can create reservations" on public.reservations for insert with check (true);
    create policy "Can read own reservations" on public.reservations for select using (true);
    create policy "legacy_update_all" on public.reservations for update using (true);
    create policy "keep_me_select" on public.reservations for select to authenticated using (false);

    insert into auth.users values ('${U1}', 'dani@example.com');
    insert into public.trainers (id, slug, name, email) values
      ('${T1}', 'mauri', 'Mauricio Martin', 'm@example.com'),
      ('${T2}', 'daniel-ruiz', 'Daniel Ruiz', 'd@example.com');
    insert into public.availability_slots (id, trainer_id, session_date, start_time, end_time) values
      ('${W1}', '${T1}', '2099-01-05', '09:00', '17:00');
    insert into public.reservations (trainer_id, availability_slot_id, client_name, client_email, client_phone, price, status, notes) values
      ('${T1}', '${W1}', 'Ana', 'ana@example.com', '0123456789', 300, 'confirmed', 'WhatsApp: si'),
      ('${T1}', '${W1}', 'Luis', 'luis@example.com', null, 300, 'cancelled', 'WhatsApp: no');
  `)
  // Horas de las reservas antiguas, para que la 007/008 tengan rango.
  for (const key of Object.keys(M).sort()) {
    if (key === '010' || key > upTo || skip.includes(key)) continue
    await db.exec(M[key])
    if (key === '007') {
      await db.exec(`
        update public.reservations set start_time = '09:00', end_time = '10:00', duration_minutes = 60 where client_name = 'Ana';
        update public.reservations set start_time = '10:00', end_time = '11:00', duration_minutes = 60 where client_name = 'Luis';
      `)
    }
  }
  if (before010) await db.exec(before010)
  return db
}

const q = async (db, sql, params) => (await db.query(sql, params)).rows

async function asRole(db, role, sql) {
  await db.exec(`set role ${role}`)
  try {
    return await db.query(sql)
  } finally {
    await db.exec('reset role')
  }
}

async function sqlState(promise) {
  try {
    await promise
    return 'ok'
  } catch (error) {
    return error.code ?? error.message
  }
}

// ─── Requisitos ─────────────────────────────────────────────────────────────

test('010 aborta sin la 009 (players)', async () => {
  const db = await freshDb({ upTo: '008' })
  await assert.rejects(db.exec(M['010']), /010 requiere la 009/)
  await db.exec('rollback').catch(() => {})
  assert.equal((await q(db, `select to_regclass('public.trainer_session_prices') as t`))[0].t, null, 'nada a medias')
})

test('010 aborta sin la 008 (reservations_no_overlap)', async () => {
  const db = await freshDb({ skip: ['008'] })
  await assert.rejects(db.exec(M['010']), /010 requiere la 008/)
})

// ─── Aplicación normal, dos veces ───────────────────────────────────────────

let db
test('010 se aplica y se vuelve a aplicar sin errores (idempotente)', async () => {
  db = await freshDb()
  await db.exec(M['010'])
  await db.exec(`update public.trainer_session_prices set price_rm = 320 where trainer_id = '${T1}' and duration_minutes = 60 and player_count = 1`)
  await db.exec(M['010'])
})

test('políticas: se borran las históricas y las de escritura; la SELECT ajena se queda', async () => {
  const rows = await q(db, `select policyname, cmd from pg_policies where tablename = 'reservations' order by 1`)
  assert.deepEqual(rows, [{ policyname: 'keep_me_select', cmd: 'SELECT' }])
})

test('GRANTs: anon y authenticated solo conservan SELECT en reservations y trainer_session_prices', async () => {
  for (const table of ['reservations', 'trainer_session_prices']) {
    const rows = await q(
      db,
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = $1 and grantee in ('anon', 'authenticated')
        order by 1, 2`,
      [table]
    )
    assert.deepEqual(rows, [
      { grantee: 'anon', privilege_type: 'SELECT' },
      { grantee: 'authenticated', privilege_type: 'SELECT' },
    ], table)
  }
})

test('anon / authenticated no pueden escribir reservations (ni con una política permisiva)', async () => {
  // Aunque alguien añadiera mañana un INSERT abierto, sin GRANT no hay escritura.
  await db.exec(`create policy "oops_insert" on public.reservations for insert with check (true)`)
  for (const role of ['anon', 'authenticated']) {
    assert.equal(
      await sqlState(asRole(db, role, `insert into public.reservations (trainer_id, availability_slot_id, client_name, client_email, player_id) values ('${T1}', '${W1}', 'x', 'x@x.com', null)`)),
      '42501', `${role} INSERT`
    )
    assert.equal(await sqlState(asRole(db, role, `update public.reservations set client_name = 'x'`)), '42501', `${role} UPDATE`)
    assert.equal(await sqlState(asRole(db, role, `delete from public.reservations`)), '42501', `${role} DELETE`)
    assert.equal(await sqlState(asRole(db, role, `truncate public.reservations`)), '42501', `${role} TRUNCATE`)
    assert.equal(await sqlState(asRole(db, role, `insert into public.trainer_session_prices values ('${T1}', 60, 1, 1)`)), '42501', `${role} precios`)
    // SELECT: permitido por GRANT, pero RLS no devuelve filas (sin política para anon).
    if (role === 'anon') assert.equal((await asRole(db, role, `select id from public.reservations`)).rows.length, 0)
  }
  await db.exec(`drop policy "oops_insert" on public.reservations`)
})

test('la service role sigue escribiendo (rutas de servidor)', async () => {
  const res = await asRole(
    db,
    'service_role',
    `insert into public.reservations (trainer_id, availability_slot_id, client_name, client_email, start_time, end_time, duration_minutes, status, player_count, whatsapp_opt_in)
     values ('${T1}', '${W1}', 'Srv', 's@example.com', '12:00', '13:00', 60, 'pending_confirmation', 2, true) returning player_count, whatsapp_opt_in, session_date`
  )
  assert.deepEqual(res.rows[0], { player_count: 2, whatsapp_opt_in: true, session_date: new Date('2099-01-05T00:00:00.000Z') })
})

test('reservas existentes intactas: sin backfill (player_id/mensaje/whatsapp NULL, player_count 1, notes igual)', async () => {
  const rows = await q(db, `select client_name, player_id, client_message, player_count, whatsapp_opt_in, notes from public.reservations where client_name in ('Ana', 'Luis') order by 1`)
  assert.deepEqual(rows, [
    { client_name: 'Ana', player_id: null, client_message: null, player_count: 1, whatsapp_opt_in: null, notes: 'WhatsApp: si' },
    { client_name: 'Luis', player_id: null, client_message: null, player_count: 1, whatsapp_opt_in: null, notes: 'WhatsApp: no' },
  ])
})

test('columnas: tipos, NULL/NOT NULL y default', async () => {
  const rows = await q(db, `select column_name, data_type, is_nullable, column_default from information_schema.columns
    where table_name = 'reservations' and column_name in ('player_id', 'client_message', 'player_count', 'whatsapp_opt_in') order by 1`)
  assert.deepEqual(rows, [
    { column_name: 'client_message', data_type: 'text', is_nullable: 'YES', column_default: null },
    { column_name: 'player_count', data_type: 'smallint', is_nullable: 'NO', column_default: '1' },
    { column_name: 'player_id', data_type: 'uuid', is_nullable: 'YES', column_default: null },
    { column_name: 'whatsapp_opt_in', data_type: 'boolean', is_nullable: 'YES', column_default: null },
  ])
})

test('restricciones: player_count 1..4, mensaje ≤ 500 code points, FK a players', async () => {
  const base = `insert into public.reservations (trainer_id, availability_slot_id, client_name, client_email, status`
  assert.equal(await sqlState(db.query(`${base}, player_count) values ('${T1}', '${W1}', 'x', 'x@x.com', 'cancelled', 5)`)), '23514')
  assert.equal(await sqlState(db.query(`${base}, player_count) values ('${T1}', '${W1}', 'x', 'x@x.com', 'cancelled', 0)`)), '23514')
  // 500 emojis (fuera del BMP): 500 code points, 1000 unidades UTF-16 → se acepta.
  assert.equal(await sqlState(db.query(`${base}, client_message) values ('${T1}', '${W1}', 'x', 'x@x.com', 'cancelled', $1)`, ['🎾'.repeat(500)])), 'ok')
  assert.equal(await sqlState(db.query(`${base}, client_message) values ('${T1}', '${W1}', 'x', 'x@x.com', 'cancelled', $1)`, ['a'.repeat(501)])), '23514')
  assert.equal(await sqlState(db.query(`${base}, player_id) values ('${T1}', '${W1}', 'x', 'x@x.com', 'cancelled', gen_random_uuid())`)), '23503')
})

test('ON DELETE SET NULL: borrar el jugador conserva la reserva sin atribución', async () => {
  const [{ id: playerId }] = await q(db, `insert into public.players (auth_user_id, email) values ('${U1}', 'dani@example.com') returning id`)
  const [{ id }] = await q(db, `insert into public.reservations (trainer_id, availability_slot_id, client_name, client_email, status, player_id)
    values ('${T1}', '${W1}', 'Dani', 'dani@example.com', 'cancelled', '${playerId}') returning id`)
  await db.exec(`delete from public.players where id = '${playerId}'`)
  const [row] = await q(db, `select player_id, client_name from public.reservations where id = '${id}'`)
  assert.deepEqual(row, { player_id: null, client_name: 'Dani' })
})

test('índice parcial reservations_player_idx (player_id, created_at desc) where player_id is not null', async () => {
  const [row] = await q(db, `select indexdef from pg_indexes where indexname = 'reservations_player_idx'`)
  assert.match(row.indexdef, /\(player_id, created_at DESC\) WHERE \(player_id IS NOT NULL\)/)
})

test('008 intacta: dos reservas vivas solapadas siguen dando 23P01', async () => {
  const ins = (start, end) =>
    db.query(`insert into public.reservations (trainer_id, availability_slot_id, client_name, client_email, start_time, end_time, duration_minutes, status)
      values ('${T1}', '${W1}', 'x', 'x@x.com', '${start}', '${end}', 60, 'pending_confirmation')`)
  assert.equal(await sqlState(ins('14:00', '15:00')), 'ok')
  assert.equal(await sqlState(ins('14:30', '15:30')), '23P01')
})

test('precios: 8 por entrenador con la tabla de Dani; volver a aplicar no pisa un precio editado', async () => {
  const rows = await q(db, `select t.slug, p.duration_minutes, p.player_count, p.price_rm::text as price
    from public.trainer_session_prices p join public.trainers t on t.id = p.trainer_id order by 1, 2, 3`)
  const table = (slug) => rows.filter((r) => r.slug === slug).map((r) => `${r.duration_minutes}/${r.player_count}=${r.price}`)
  assert.deepEqual(table('daniel-ruiz'), ['60/1=300.00', '60/2=300.00', '60/3=350.00', '60/4=350.00', '90/1=450.00', '90/2=450.00', '90/3=525.00', '90/4=525.00'])
  assert.deepEqual(table('mauri'), ['60/1=320.00', '60/2=300.00', '60/3=350.00', '60/4=350.00', '90/1=450.00', '90/2=450.00', '90/3=525.00', '90/4=525.00'])
})

test('precios: CHECKs de duración, nº de jugadores e importe', async () => {
  const ins = (d, p, price) => db.query(`insert into public.trainer_session_prices (trainer_id, duration_minutes, player_count, price_rm) values ('${T2}', ${d}, ${p}, ${price})
    on conflict (trainer_id, duration_minutes, player_count) do update set price_rm = excluded.price_rm`)
  assert.equal(await sqlState(ins(45, 1, 100)), '23514')
  assert.equal(await sqlState(ins(60, 5, 100)), '23514')
  assert.equal(await sqlState(ins(60, 1, 0)), '23514')
  assert.equal(await sqlState(ins(60, 1, -1)), '23514')
  assert.equal(await sqlState(ins(60, 1, 310.5)), 'ok')
})

// ─── Estados previos raros ──────────────────────────────────────────────────

test('una restricción previa con otra definición queda con la de la 010', async () => {
  const other = await freshDb({
    before010: `
      alter table public.reservations add column player_count smallint;
      alter table public.reservations add constraint reservations_player_count_range check (player_count between 1 and 10);
      alter table public.reservations add column player_id uuid;`,
  })
  await other.exec(M['010'])
  const [row] = await q(other, `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'reservations_player_count_range'`)
  assert.match(row.def, /BETWEEN 1 AND 4|>= 1\) AND \(player_count <= 4/)
  const [fk] = await q(other, `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'reservations_player_id_fkey'`)
  assert.match(fk.def, /REFERENCES players\(id\) ON DELETE SET NULL/)
})

test('datos existentes inválidos → error claro y nada a medias', async () => {
  const bad = await freshDb({
    before010: `
      alter table public.reservations add column player_count smallint;
      update public.reservations set player_count = 7 where client_name = 'Ana';`,
  })
  await assert.rejects(bad.exec(M['010']), /player_count fuera de 1\.\.4/)
  await bad.exec('rollback').catch(() => {})
  assert.equal((await q(bad, `select to_regclass('public.trainer_session_prices') as t`))[0].t, null)
  const [{ n }] = await q(bad, `select count(*)::int as n from pg_policies where tablename = 'reservations' and policyname = 'Anyone can create reservations'`)
  assert.equal(n, 1, 'la transacción entera se deshace')
})

test('una trainer_session_prices ajena con otra forma no se toca: error claro', async () => {
  const other = await freshDb({ before010: `create table public.trainer_session_prices (id int primary key, amount int);` })
  await assert.rejects(other.exec(M['010']), /trainer_session_prices ya existe con otras columnas/)
})

// ─── Comprobaciones estáticas ───────────────────────────────────────────────

test('estático: sin CREATE POLICY, sin backfill por email, en transacción, con recarga de esquema', () => {
  const sql = M['010'].replace(/^\s*--.*$/gm, '')
  assert.doesNotMatch(sql, /create\s+policy/i)
  assert.doesNotMatch(sql, /client_email/i)
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete|all)/i)
  assert.match(sql, /^\s*begin;/m)
  assert.match(sql, /^\s*commit;/m)
  assert.match(sql, /notify pgrst, 'reload schema'/)
})
