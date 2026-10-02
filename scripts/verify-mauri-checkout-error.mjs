// Tres respuestas 409 reales de la ruta, clasificadas sin tocar la base.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, read } from './lib/ts-harness.mjs'

const { classifyBookingError } = load('lib/booking/checkout-error.ts')
const route = read('app/api/reservations/route.ts')
const cases = [
  ['Complete your player profile before booking with your account.', 'profile'],
  ["This coach hasn't set a price for this session yet.", 'price'],
  ['That time was just booked by someone else. Please choose another time.', 'slot'],
]

for (const [message, kind] of cases) {
  test(`409 ${kind}: coincide con la API y solo clasifica ${kind}`, () => {
    assert.ok(route.includes(message), 'el texto debe seguir coincidiendo con POST /api/reservations')
    assert.equal(classifyBookingError(409, message), kind)
  })
}

test('la franja con fecha y la ausencia de entrenador no se confunden', () => {
  assert.equal(classifyBookingError(409, '2099-01-05 at 10:00 was just booked. Please choose another time.'), 'slot')
  assert.equal(classifyBookingError(404, '2099-01-05 at 10:00 is no longer available.'), 'slot')
  assert.equal(classifyBookingError(404, 'Coach not found.'), 'other')
  assert.equal(classifyBookingError(409, 'Unknown conflict'), 'other')
})
