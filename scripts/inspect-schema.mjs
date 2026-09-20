#!/usr/bin/env node
// Inspecciona el esquema REAL de una tabla en Supabase (columnas, tipos, NOT NULL,
// defaults, claves) a través del OpenAPI de PostgREST, con la service role key.
//
//   node scripts/inspect-schema.mjs            -> lista las tablas expuestas
//   node scripts/inspect-schema.mjs trainers   -> columnas de `trainers` + nº de filas
//
// Lee las claves de .env.local. No las escribas aquí.

import fs from 'node:fs'

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    })
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const headers = { apikey: key, Authorization: `Bearer ${key}` }
const spec = await fetch(`${url}/rest/v1/`, { headers }).then((r) => r.json())
const tables = spec.definitions ?? {}
const table = process.argv[2]

if (!table) {
  console.log('Tablas expuestas en `public`:')
  for (const name of Object.keys(tables)) console.log(`  ${name}`)
  process.exit(0)
}

const def = tables[table]
if (!def) {
  console.error(`La tabla "${table}" no existe (o no está expuesta por PostgREST).`)
  process.exit(1)
}

console.log(`== ${table}`)
for (const [column, prop] of Object.entries(def.properties)) {
  const type = String(prop.format ?? prop.type).padEnd(28)
  const notNull = (def.required ?? []).includes(column) ? 'NOT NULL' : '        '
  const dflt = prop.default !== undefined ? `default ${prop.default}` : ''
  const note = prop.description ? `// ${prop.description.replace(/\n/g, ' ')}` : ''
  console.log(`  ${column.padEnd(18)} ${type} ${notNull} ${dflt} ${note}`.trimEnd())
}

const count = await fetch(`${url}/rest/v1/${table}?select=*`, {
  headers: { ...headers, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' },
})
console.log(`\nfilas: ${count.headers.get('content-range')?.split('/')[1] ?? '?'}`)
