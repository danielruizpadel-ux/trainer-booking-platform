#!/usr/bin/env node
// Regresión del bug de max_capacity (task Bothread "Decidir y corregir: max_capacity
// fijo en 1 esconde ventanas anchas con 1 reserva", diagnosticado con Codex,
// aprobado por Dani el 21/09/2026, fix en lib/availability/slot-status.ts).
//
// Antes del fix: una ventana ancha con UNA reserva enganchada directamente a ella
// (current_bookings=1, max_capacity=1 fijo desde la creación) desaparecía ENTERA
// de GET /api/availability aunque le quedaran horas libres reales. El fix quita
// la comparación current_bookings/max_capacity de isSlotOpen(): la apertura
// administrativa pasa a depender solo de `status`.
//
// Requiere el servidor real corriendo en localhost:3001 (npm run dev) y
// Supabase real. Usa el trainer de pruebas `daniel-ruiz` y datos sintéticos en
// fechas muy lejanas, reversibles: se borran al final pase lo que pase (con
// mensaje de aviso si algo no se pudo limpiar).
//
//   node scripts/verify-max-capacity-fix.mjs

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

const APP_URL = process.env.VERIFY_APP_URL ?? 'http://localhost:3001'
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}), Prefer: init.method && init.method !== 'GET' ? 'return=representation' : undefined },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`PostgREST ${init.method ?? 'GET'} ${path} -> ${res.status}: ${text}`)
  return body
}

let failures = 0
let totalChecks = 0
function check(label, condition, detail) {
  totalChecks++
  if (condition) {
    console.log(`  OK   ${label}`)
  } else {
    failures++
    console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`)
  }
}

const created = { slots: [], reservations: [] }

async function teardown() {
  console.log('\n== Limpieza de datos de prueba ==')
  for (const id of created.reservations) {
    try {
      await rest(`reservations?id=eq.${id}`, { method: 'DELETE' })
    } catch (e) {
      console.warn(`  aviso: no se pudo borrar reservations.id=${id}: ${e.message}`)
    }
  }
  for (const id of created.slots) {
    try {
      await rest(`availability_slots?id=eq.${id}`, { method: 'DELETE' })
    } catch (e) {
      console.warn(`  aviso: no se pudo borrar availability_slots.id=${id}: ${e.message}`)
    }
  }
  console.log('  hecho.')
}

async function main() {
  const [trainer] = await rest('trainers?slug=eq.daniel-ruiz&select=id,slug,class_durations')
  if (!trainer) throw new Error('No existe el trainer de pruebas daniel-ruiz')
  const trainerId = trainer.id

  // Diagnóstico claro y salida temprana (sin crear nada) si el trainer de
  // pruebas cambia de configuración: todo el script asume duration=60.
  const durations = trainer.class_durations ?? []
  if (!durations.includes(60)) {
    throw new Error(
      `El trainer de pruebas daniel-ruiz no tiene la duración 60 min habilitada ` +
        `(class_durations=${JSON.stringify(durations)}). Este script asume duration=60 ` +
        `en todas sus comprobaciones — actualízalo o habilita 60 min en daniel-ruiz antes de reejecutar. ` +
        `Abortando sin crear ningún dato.`
    )
  }

  // Fechas sintéticas muy lejanas para no chocar con datos reales.
  const wideDate = '2027-03-01'
  const narrowDate = '2027-03-02'

  for (const date of [wideDate, narrowDate]) {
    const existing = await rest(`availability_slots?trainer_id=eq.${trainerId}&session_date=eq.${date}&select=id`)
    if (existing.length > 0) throw new Error(`${date} no está limpia (ya hay availability_slots) — aborto sin tocar nada`)
  }

  console.log('== Caso 1: ventana ANCHA (09:00-17:00) + 1 reserva 10:00-11:00 ==')
  console.log('   Antes del fix: GET /api/availability debía devolver [] (bug). Tras el fix: 7 horas libres.')

  const [wideSlot] = await rest('availability_slots', {
    method: 'POST',
    body: JSON.stringify({
      trainer_id: trainerId,
      session_date: wideDate,
      start_time: '09:00',
      end_time: '17:00',
      class_type: 'private',
      status: 'available',
      current_bookings: 0,
      max_capacity: 1,
      generated_by_pattern: false,
    }),
  })
  created.slots.push(wideSlot.id)

  const [wideRes] = await rest('reservations', {
    method: 'POST',
    body: JSON.stringify({
      trainer_id: trainerId,
      availability_slot_id: wideSlot.id,
      client_name: 'TEST verify-max-capacity-fix',
      client_email: 'test-verify-max-capacity@example.invalid',
      start_time: '10:00',
      end_time: '11:00',
      duration_minutes: 60,
      price: 300,
      status: 'pending_confirmation',
    }),
  })
  created.reservations.push(wideRes.id)

  // Simula exactamente lo que refreshWindowStatus deja tras la reserva: la
  // ventana sigue `available` (hay hueco real) pero current_bookings=1.
  await rest(`availability_slots?id=eq.${wideSlot.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ current_bookings: 1 }),
  })

  const wideAvail = await fetch(`${APP_URL}/api/availability?trainer_id=daniel-ruiz&date=${wideDate}&duration=60`).then((r) => r.json())
  const wideStarts = (wideAvail.data ?? []).map((s) => s.start_time.slice(0, 5))
  console.log('   GET /api/availability data:', JSON.stringify(wideStarts))

  check('la respuesta es success:true', wideAvail.success === true)
  check('10:00 NO se ofrece (lo ocupa la reserva)', !wideStarts.includes('10:00'))
  check('09:00 SÍ se ofrece (resto de la ventana libre)', wideStarts.includes('09:00'))
  check('11:00..16:00 SÍ se ofrecen (6 horas)', ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00'].every((h) => wideStarts.includes(h)))
  check('total: 7 inicios libres (8 horas de ventana - 1 ocupada)', wideStarts.length === 7, `recibidos ${wideStarts.length}`)

  console.log('\n== Caso 1b: POST /api/reservations sobre la MISMA ventana parcialmente ocupada (inicio libre 14:00) ==')
  console.log('   El bug también afectaba a findBookableWindow (POST), no solo a GET: antes, 409/404 en vez de aceptar la reserva.')

  const postRes = await fetch(`${APP_URL}/api/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trainer_id: 'daniel-ruiz',
      sessions: [{ date: wideDate, time: '14:00' }],
      duration_minutes: 60,
      client_name: 'TEST verify-max-capacity-fix (POST)',
      client_email: 'test-verify-max-capacity-post@example.invalid',
      client_phone: '+34600000000',
      client_whatsapp_opt_in: false,
    }),
  }).then((r) => r.json())
  console.log('   POST /api/reservations respuesta:', JSON.stringify(postRes))

  // Reversible pase lo que pase: si la API devolvió ids (éxito parcial o
  // total), se registran para borrarlos en el teardown de abajo.
  if (Array.isArray(postRes.reservationIds)) {
    for (const id of postRes.reservationIds) created.reservations.push(id)
  }

  check('POST /api/reservations acepta el inicio libre de una ventana parcialmente ocupada', postRes.success === true, JSON.stringify(postRes))

  const wideAvailAfterPost = await fetch(`${APP_URL}/api/availability?trainer_id=daniel-ruiz&date=${wideDate}&duration=60`).then((r) => r.json())
  const wideStartsAfterPost = (wideAvailAfterPost.data ?? []).map((s) => s.start_time.slice(0, 5))
  console.log('   GET /api/availability tras el POST:', JSON.stringify(wideStartsAfterPost))
  check('tras el POST, 14:00 ya no se ofrece (recién ocupado)', !wideStartsAfterPost.includes('14:00'), JSON.stringify(wideStartsAfterPost))
  check(
    'tras el POST, el resto de la ventana sigue libre (09:00,11:00-13:00,15:00-16:00)',
    ['09:00', '11:00', '12:00', '13:00', '15:00', '16:00'].every((h) => wideStartsAfterPost.includes(h)),
    JSON.stringify(wideStartsAfterPost)
  )

  console.log('\n== Caso 2 (no regresión): ventana ESTRECHA (10:00-11:00, = 1 clase) + 1 reserva la ocupa entera ==')
  console.log('   Debe seguir sin ofrecer nada, con o sin el fix (ya funcionaba bien).')

  const [narrowSlot] = await rest('availability_slots', {
    method: 'POST',
    body: JSON.stringify({
      trainer_id: trainerId,
      session_date: narrowDate,
      start_time: '10:00',
      end_time: '11:00',
      class_type: 'private',
      status: 'available',
      current_bookings: 0,
      max_capacity: 1,
      generated_by_pattern: false,
    }),
  })
  created.slots.push(narrowSlot.id)

  const [narrowRes] = await rest('reservations', {
    method: 'POST',
    body: JSON.stringify({
      trainer_id: trainerId,
      availability_slot_id: narrowSlot.id,
      client_name: 'TEST verify-max-capacity-fix (caso 2)',
      client_email: 'test-verify-max-capacity-2@example.invalid',
      start_time: '10:00',
      end_time: '11:00',
      duration_minutes: 60,
      price: 300,
      status: 'pending_confirmation',
    }),
  })
  created.reservations.push(narrowRes.id)

  await rest(`availability_slots?id=eq.${narrowSlot.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ current_bookings: 1 }),
  })

  const narrowAvail = await fetch(`${APP_URL}/api/availability?trainer_id=daniel-ruiz&date=${narrowDate}&duration=60`).then((r) => r.json())
  const narrowStarts = (narrowAvail.data ?? []).map((s) => s.start_time.slice(0, 5))
  console.log('   GET /api/availability data:', JSON.stringify(narrowStarts))
  check('la ventana llena sigue sin ofrecer nada', narrowStarts.length === 0, `recibidos ${JSON.stringify(narrowStarts)}`)

  await teardown()

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} comprobación(es) fallida(s) de ${totalChecks}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error('\nERROR durante la verificación:', err.message)
  await teardown()
  process.exit(1)
})
