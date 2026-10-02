// Evidencia local: solo lectura, nunca envía la solicitud de reserva.
import { createRequire } from 'node:module'
import { join } from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.PW)
const browser = await chromium.launch({ executablePath: process.env.CHROME })
const base = process.argv[2] || 'http://localhost:3012'
const out = new URL('.', import.meta.url).pathname
let failures = 0
for (const [name, width, height] of [['escritorio', 1440, 900], ['movil', 390, 844]]) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const writes = []
  page.on('request', request => { if (request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`) })
  await page.goto(`${base}/mauri?preview=1`, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.screenshot({ path: join(out, `continuacion-${name}-landing-preview.png`), fullPage: true })
  const previewText = await page.locator('body').innerText()
  for (const expected of ['LOGO 1 · PENDIENTE', 'Club / sede: Pendiente', 'QUIÉN TE ENTRENA']) if (!previewText.toLocaleUpperCase('es-ES').includes(expected.toLocaleUpperCase('es-ES'))) { failures++; console.log(name, 'falta en preview:', expected) }
  const hour = page.locator('button[aria-pressed]').filter({ hasText: /^09:00$/ }).first()
  await hour.click()
  await page.getByRole('button', { name: /Continuar · 1 clase/i }).click()
  await page.getByRole('heading', { name: 'Revisa tu solicitud' }).waitFor()
  await page.addStyleTag({ content: 'header.sticky,[data-sticky-header]{position:relative!important}' })
  await page.locator('#booking-section').screenshot({ path: join(out, `continuacion-${name}-checkout.png`) })
  const checkoutText = await page.locator('body').innerText()
  for (const expected of ['09:00', 'Número de jugadores', 'Solicitar reserva', 'Mauri confirmará la pista']) if (!checkoutText.toLocaleUpperCase('es-ES').includes(expected.toLocaleUpperCase('es-ES'))) { failures++; console.log(name, 'falta en checkout:', expected) }
  if (checkoutText.includes('Pago en efectivo') || checkoutText.includes('te propondrá otra hora')) { failures++; console.log(name, 'promesa sin aprobar en checkout') }
  if (checkoutText.includes('Confirm booking') || checkoutText.includes('Review your booking')) failures++
  if (writes.length) failures++
  console.log(name, { writes, failures, checkout: true, preview: true })
  await context.close()
}
await browser.close()
if (failures) process.exitCode = 1
