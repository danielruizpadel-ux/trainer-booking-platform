// Las respuestas de reserva se simulan en el navegador: ningún POST llega al servidor.
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const { chromium } = createRequire(import.meta.url)(process.env.PW)
const browser = await chromium.launch({ executablePath: process.env.CHROME })
const base = process.argv[2] || 'http://localhost:3012'
const cases = [
  {
    kind: 'profile',
    server: 'Complete your player profile before booking with your account.',
    visible: 'Completa tu perfil de jugador para solicitar con tu cuenta.',
    action: 'Completar perfil',
  },
  {
    kind: 'price',
    server: "This coach hasn't set a price for this session yet.",
    visible: 'No hay precio configurado para esta clase.',
  },
  {
    kind: 'slot',
    server: 'That time was just booked by someone else. Please choose another time.',
    visible: 'Esta hora ya no está disponible. Elige otra.',
    action: 'Elegir otra hora',
  },
]

try {
  for (const item of cases) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    let intercepted = 0
    const otherWrites = []
    page.on('request', request => {
      if (request.method() !== 'GET' && !request.url().endsWith('/api/reservations')) otherWrites.push(`${request.method()} ${request.url()}`)
    })
    await page.route('**/api/reservations', async route => {
      assert.equal(route.request().method(), 'POST')
      intercepted++
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: item.server }) })
    })
    await page.goto(`${base}/mauri`, { waitUntil: 'networkidle' })
    await page.locator('button[aria-pressed]').filter({ hasText: /^09:00$/ }).first().click()
    await page.getByRole('button', { name: /Continuar · 1 clase/i }).click()
    await page.getByRole('heading', { name: 'Revisa tu solicitud' }).waitFor()
    await page.locator('#guest-name').fill('Jugador Prueba')
    await page.locator('#guest-email').fill('prueba@example.com')
    await page.locator('#guest-phone').fill('+60123456789')
    await page.getByRole('button', { name: 'Solicitar reserva' }).click()
    const alert = page.getByRole('alert')
    await alert.getByText(item.visible, { exact: false }).waitFor()
    if (item.action) assert.equal(await alert.getByRole('button', { name: item.action }).count(), 1)
    assert.equal(await alert.getByRole('button', { name: 'Elegir otra hora' }).count(), item.kind === 'slot' ? 1 : 0)
    assert.equal(intercepted, 1)
    assert.deepEqual(otherWrites, [])
    console.log(`PASS 409 ${item.kind}: mensaje y acción correctos; POST interceptado`)
    await context.close()
  }
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    let intercepted = 0
    await page.route('**/api/reservations', async route => {
      assert.equal(route.request().method(), 'POST')
      intercepted++
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })
    await page.goto(`${base}/mauri`, { waitUntil: 'networkidle' })
    await page.locator('button[aria-pressed]').filter({ hasText: /^09:00$/ }).first().click()
    await page.getByRole('button', { name: /Continuar · 1 clase/i }).click()
    await page.locator('#guest-name').fill('Jugador Prueba')
    await page.locator('#guest-email').fill('prueba@example.com')
    await page.locator('#guest-phone').fill('+60123456789')
    await page.getByRole('button', { name: 'Solicitar reserva' }).click()
    await page.getByRole('heading', { name: 'Solicitud recibida' }).waitFor()
    const success = await page.locator('#booking-section').innerText()
    assert.match(success, /La clase solo quedará confirmada cuando .+ haya reservado la pista\./)
    assert.ok(!success.includes('te propondrá otra hora'))
    assert.ok(!success.includes('Pago en efectivo'))
    assert.equal(intercepted, 1)
    console.log('PASS éxito simulado: solicitud pendiente, sin promesa de otra hora ni pago')
    await context.close()
  }
} finally {
  await browser.close()
}
