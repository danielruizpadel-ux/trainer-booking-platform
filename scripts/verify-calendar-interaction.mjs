#!/usr/bin/env node
// Calendario del entrenador (Resumen): crear una clase desde un hueco libre y
// el resumen de una reserva. Reglas en lib/reservations/calendar-slots.ts.
//
//   1. Inicios reservables: los de bookableStarts (rejilla de la ventana, sin
//      pisar reservas vivas) menos los que ya empezaron en Kuala Lumpur.
//   2. Un tramo sin inicios no se presenta como reservable ("No cabe" /
//      "Pasado").
//   3. Clic en un punto del tramo → inicio de su celda; si esa no cabe, la
//      última clase que cubre el punto; si ninguna, nada.
//   4. El resumen y GET /api/dashboard/calendar no llevan datos de contacto.
//
// Sin navegador ni Supabase reales.
//
//   node scripts/verify-calendar-interaction.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase, load, mock, read } from './lib/ts-harness.mjs'

const slots = load('lib/reservations/calendar-slots.ts')
const DAY = '2099-01-05'
// 11:15 en Kuala Lumpur (UTC+8) de ese día
const NOW = new Date('2099-01-05T03:15:00Z')
const LATER = new Date('2099-01-04T00:00:00Z')
const W = { session_date: DAY, start_time: '09:00', end_time: '13:00' }
const BOOKED = [{ start_time: '10:00', end_time: '11:00' }]
const min = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

test('inicios: respetan duración, rejilla y reservas existentes', () => {
  assert.deepEqual(slots.futureBookableStarts(W, BOOKED, 60, 30, LATER), ['09:00', '11:00', '11:30', '12:00'])
  assert.deepEqual(slots.futureBookableStarts(W, BOOKED, 90, 30, LATER), ['11:00', '11:30'], '09:00 de 90 pisaría la de las 10:00')
  assert.deepEqual(slots.futureBookableStarts(W, BOOKED, 60, 60, LATER), ['09:00', '11:00', '12:00'])
})

test('inicios: los que ya empezaron (Kuala Lumpur) no se ofrecen', () => {
  // A las 11:15: 09:00 y 11:00 ya han empezado
  assert.deepEqual(slots.futureBookableStarts(W, BOOKED, 60, 30, NOW), ['11:30', '12:00'])
})

test('tramos: solo reservable si le queda un inicio; si no, "No cabe" o "Pasado"', () => {
  const starts = slots.futureBookableStarts(W, BOOKED, 60, 30, NOW)
  const morning = { start_time: '09:00', end_time: '10:00' }
  const afternoon = { start_time: '11:00', end_time: '13:00' }
  assert.deepEqual(slots.startsInRange(starts, morning, 60), [])
  assert.equal(slots.rangeState(DAY, morning, [], 60, NOW), 'past')
  assert.deepEqual(slots.startsInRange(starts, afternoon, 60), ['11:30', '12:00'])
  assert.equal(slots.rangeState(DAY, afternoon, ['11:30', '12:00'], 60, NOW), 'bookable')
  // 30 min libres no admiten una clase de 60, aunque sea futuro
  assert.equal(slots.rangeState(DAY, { start_time: '12:30', end_time: '13:00' }, [], 60, LATER), 'too-short')
  // 60 min libres no admiten una de 90
  assert.equal(slots.rangeState(DAY, morning, [], 90, LATER), 'too-short')
})

test('clic: la hora bajo el puntero, nunca una que no cabe o ya pasó', () => {
  const starts = ['12:00', '12:30'] // tramo 12:00–14:00, 90 min, rejilla 30
  assert.equal(slots.startAtMinute(starts, min('12:10'), 90, 30), '12:00')
  assert.equal(slots.startAtMinute(starts, min('12:45'), 90, 30), '12:30')
  // 13:40: la celda 13:30 no cabe (acabaría 15:00) → la última clase que cubre ese punto
  assert.equal(slots.startAtMinute(starts, min('13:40'), 90, 30), '12:30')
  // 60 min en 11:00–13:00 a las 11:15: 11:00 ya empezó → un clic a las 11:10 no crea nada
  assert.equal(slots.startAtMinute(['11:30', '12:00'], min('11:10'), 60, 30), null)
  assert.equal(slots.startAtMinute([], min('10:00'), 60, 30), null)
  // Rejilla de 60, libre 12:00–13:45: solo cabe 12:00. Un clic a las 13:30 cae
  // en el trozo donde no cabe nada → no crea (no se "estira" a 12:00).
  assert.equal(slots.startAtMinute(['12:00'], min('13:30'), 60, 60), null)
  assert.equal(slots.startAtMinute(['12:00'], min('12:50'), 60, 60), '12:00')
})

test('resumen: cliente, horario, duración, estado, jugadores; nada de contacto', () => {
  const r = {
    id: 'r1', window_id: 'w1', session_date: DAY, start_time: '12:00', end_time: '13:30', duration_minutes: 90,
    client_name: 'Ana Test', status: 'pending_confirmation', kind: 'pending', player_count: 2,
    client_email: 'ana@example.com', client_phone: '+60 12', notes: 'privado', price: 450,
  }
  const s = slots.reservationSummary(r, 'Lunes, 5 ene')
  assert.deepEqual(s, { client: 'Ana Test', when: 'Lunes, 5 ene · 12:00 – 13:30', duration: '1 h 30 min', status: 'Pendiente de confirmar', players: '2 jugadores' })
  assert.doesNotMatch(JSON.stringify(s), /example\.com|\+60|privado|450/)
  assert.equal(slots.reservationSummary({ ...r, player_count: null }, 'x').players, null)
  assert.equal(slots.reservationSummary({ ...r, player_count: 1, kind: 'confirmed' }, 'x').players, '1 jugador')
  assert.equal(slots.reservationSummary({ ...r, kind: 'proposed' }, 'x').status, 'Nueva hora propuesta')
})

test('GET /api/dashboard/calendar: trae player_count y NO email, teléfono, notas ni precio', async () => {
  const T = '11111111-1111-4111-8111-111111111111'
  mock('lib/auth/current-trainer.ts', { requireTrainer: async () => ({ id: T, class_durations: [60, 90] }) })
  let select = ''
  mock('lib/supabase/client.ts', {
    getSupabaseServerClient: () =>
      fakeSupabase((table, ops) => {
        select = ops.find((o) => o.op === 'select')?.args[0] ?? ''
        return {
          data: [{
            id: 'w1', trainer_id: T, session_date: DAY, start_time: '09:00:00', end_time: '13:00:00', class_type: 'private',
            status: 'available', current_bookings: 1, max_capacity: 1,
            reservations: [{ id: 'r1', client_name: 'Ana', status: 'confirmed', start_time: '10:00:00', end_time: '11:00:00', duration_minutes: 60, player_count: 3, client_email: 'no@debe.salir' }],
          }],
          error: null,
        }
      }),
  })
  const { GET } = load('app/api/dashboard/calendar/route.ts')
  const { NextRequest } = await import('next/server.js')
  const res = await GET(new NextRequest(`http://localhost/api/dashboard/calendar?start=${DAY}&end=${DAY}`))
  const body = await res.json()
  assert.equal(body.success, true)
  assert.match(select, /reservations \( id, client_name, status, start_time, end_time, duration_minutes, player_count \)/)
  assert.doesNotMatch(select, /client_email|client_phone|notes|price/)
  const [r] = body.reservations
  assert.equal(r.player_count, 3)
  assert.deepEqual(Object.keys(r).sort(), ['client_name', 'duration_minutes', 'end_time', 'id', 'kind', 'player_count', 'session_date', 'start_time', 'status', 'window_id'])
})

test('calendario: usa las reglas compartidas y el Resumen abre "Nueva reserva" precargada', () => {
  const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const cal = code('components/dashboard/reservations/ReservationsCalendar.tsx')
  assert.match(cal, /futureBookableStarts\(w, taken, duration, step\)/)
  assert.match(cal, /startAtMinute\(rangeStarts, minute, duration, step\)/)
  assert.match(cal, /if \(state !== 'bookable'\)/, 'un tramo sin inicios no es un botón')
  assert.doesNotMatch(cal, /\bbookableStarts\(/, 'no recalcula los inicios por su cuenta')
  const home = code('components/dashboard/home/HomeCalendarSection.tsx')
  assert.match(home, /onCreateAt=\{\(pick, fitting\) => setCreating\(\{ pick, fitting \}\)\}/)
  assert.match(home, /initialSlot=\{creating\.pick\}/)
  const dialog = code('components/dashboard/reservations/NewReservationDialog.tsx')
  assert.match(dialog, /useState<'slot' \| 'client'>\(initialSlot \? 'client' : 'slot'\)/)
  assert.match(dialog, /initialSlot\?\.duration_minutes/)
})

test('DialogShell: al cerrar (fondo, Escape o X) devuelve el foco si estaba en el diálogo o se perdió', () => {
  const { focusWasInDialog } = load('components/dashboard/DialogShell.tsx')
  const body = { isConnected: true }
  const trigger = { isConnected: true }
  const panelInput = { isConnected: false }
  const backdrop = { isConnected: true } // p. ej. un navegador que aún no ha hecho el "focus fixup"
  const root = { contains: (n) => n === panelInput || n === backdrop }
  assert.equal(focusWasInDialog(panelInput, root, body), true, 'dentro del panel')
  assert.equal(focusWasInDialog(backdrop, root, body), true, 'en el fondo (fuera del panel, dentro del diálogo)')
  assert.equal(focusWasInDialog({ isConnected: false }, root, body), true, 'nodo desmontado')
  assert.equal(focusWasInDialog(body, root, body), true)
  assert.equal(focusWasInDialog(null, root, body), true)
  assert.equal(focusWasInDialog(trigger, root, body), false, 'si el foco ya está en la página, no se roba')
  const code = read('components/dashboard/DialogShell.tsx')
  assert.match(code, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/, 'el fondo no toma el foco al pulsarlo')
})

// ─── Sin selector global de duración (Resumen) ───────────────────────────────

test('duración de referencia: la más corta del entrenador; y qué duraciones caben en un inicio', () => {
  assert.equal(slots.shortestDuration([90, 60]), 60)
  assert.equal(slots.shortestDuration([90]), 90)
  assert.equal(slots.shortestDuration([]), 60)
  // 09:00–13:00 con una reserva 10:00–11:00 (BOOKED), rejilla 30
  const fits = (start, durations = [60, 90]) => slots.durationsFittingAt(W, BOOKED, durations, 30, start, LATER)
  assert.deepEqual(fits('12:00'), [60], 'a las 12:00 solo queda 1 h')
  assert.deepEqual(fits('09:00'), [60], '09:00 de 90 pisaría la de las 10:00')
  assert.deepEqual(fits('09:30'), [], 'pisa la reserva de las 10:00 incluso con 1 h')
  assert.deepEqual(fits('11:30'), [60, 90])
  assert.deepEqual(fits('12:00', [90]), [], 'un entrenador solo de 90: no cabe')
  // Un entrenador solo de 90 no ve como reservable un tramo de 60 libres
  const onlyNinety = slots.futureBookableStarts(W, BOOKED, slots.shortestDuration([90]), 30, LATER)
  assert.deepEqual(slots.startsInRange(onlyNinety, { start_time: '12:00', end_time: '13:00' }, 90), [])
  assert.equal(slots.rangeState(DAY, { start_time: '12:00', end_time: '13:00' }, [], 90, LATER), 'too-short')
})

test('al guardar, el servidor vuelve a validar duración y hueco (reserva manual, sin insertar si no vale)', async () => {
  const T = '11111111-1111-4111-8111-111111111111'
  const WIN = '22222222-2222-4222-8222-222222222222'
  const state = { inserts: 0, offered: [60, 90] }
  const row = {
    id: WIN, trainer_id: T, session_date: DAY, start_time: '09:00:00', end_time: '13:00:00', class_type: 'private',
    status: 'available', current_bookings: 1, max_capacity: 1,
    reservations: [{ id: 'r1', status: 'confirmed', start_time: '11:00:00', end_time: '12:00:00' }],
  }
  mock('lib/supabase/client.ts', {
    getSupabaseServerClient: () =>
      fakeSupabase((table, ops) => {
        const has = (op) => ops.some((o) => o.op === op)
        if (table === 'reservations' && has('insert')) {
          state.inserts += 1
          return { data: { id: 'new' }, error: null }
        }
        if (table === 'availability_slots') return { data: has('maybeSingle') || has('single') ? row : [row], error: null }
        if (table === 'trainer_session_prices') {
          return { data: [60, 90].map((d) => ({ duration_minutes: d, player_count: 1, price_rm: d === 60 ? 300 : 450 })), error: null }
        }
        return { data: null, error: null }
      }),
  })
  mock('lib/availability/trainer-durations.ts', { getTrainerDurations: async () => state.offered })
  const { createManualReservation } = load('lib/reservations/manual.ts')
  const input = (start, duration) => ({ slot_id: WIN, start_time: start, duration_minutes: duration, client_name: 'Ana Test', client_email: 'ana@example.com' })

  // 12:00 de 90 acabaría 13:30, fuera de la ventana
  let r = await createManualReservation(T, input('12:00', 90))
  assert.equal(r.ok, false)
  assert.equal(state.inserts, 0)
  // 10:30 de 90 pisaría la de las 11:00
  r = await createManualReservation(T, input('10:30', 90))
  assert.equal(r.ok, false)
  assert.equal(state.inserts, 0)
  // Duración que no ofrece
  state.offered = [60]
  r = await createManualReservation(T, input('09:00', 90))
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
  assert.equal(state.inserts, 0)
  // Lo que sí cabe se crea (en el doble)
  state.offered = [60, 90]
  r = await createManualReservation(T, input('12:00', 60))
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.equal(state.inserts, 1)
})

test('Resumen: sin selector global; "Nueva reserva" precargada elige solo entre las duraciones que caben', () => {
  const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const cal = code('components/dashboard/reservations/ReservationsCalendar.tsx')
  assert.doesNotMatch(cal, /DurationPicker/, 'el calendario ya no tiene selector de duración')
  assert.match(cal, /mode === 'select' \? duration : shortestDuration\(data\.durations\)/)
  assert.match(cal, /durationsFittingAt\(w, taken, data\.durations, data\.step, start\)/)
  const dialog = code('components/dashboard/reservations/NewReservationDialog.tsx')
  assert.match(dialog, /<DurationPicker\s+durations=\{fittingDurations\}/)
  assert.match(dialog, /filter\(\(d\) => durations\.includes\(d\)\)/, 'nunca una duración que el entrenador no ofrece')
  const home = code('components/dashboard/home/HomeCalendarSection.tsx')
  assert.match(home, /initialDurations=\{creating\.fitting\}/)
})

test('mini calendario del periodo: el de referencia, sin modificarlo, y resalta el día elegido', () => {
  const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const cal = code('components/dashboard/reservations/ReservationsCalendar.tsx')
  assert.match(cal, /import MiniCalendarOverlay from '@\/components\/trainer\/calendar\/MiniCalendarOverlay'/)
  assert.match(cal, /aria-haspopup="dialog"/)
  assert.match(cal, /aria-expanded=\{miniOpen\}/)
  assert.match(cal, /setAnchor\(day\)\s+setPicked\(day\)/)
  assert.match(cal, /data-day=\{day\}/)
})
