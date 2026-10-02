// Capturas de /mauri (página real en local) para la evidencia del PR #35.
// Uso: PW=/ruta/node_modules/playwright [CHROME=/ruta/Chrome] node docs/evidencias/mauri-b-v2-web/capturar.mjs <antes|despues> [base-url]
// playwright no es dependencia del proyecto: se indica su ruta con PW.
// Solo lee: elige horas en el calendario pero NUNCA pulsa «Continuar» ni envía nada.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.PW)
const label = process.argv[2] || 'despues'
const BASE = process.argv[3] || 'http://localhost:3012'
const OUT = new URL('.', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const VIEWPORTS = { escritorio: { width: 1440, height: 900 }, movil: { width: 390, height: 844 } }
const metrics = {}
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})

const hourButtons = (page) => page.evaluateHandle(() =>
  [...document.querySelectorAll('button[aria-pressed]')].filter((b) => /^\d{2}:\d{2}$/.test(b.textContent.trim()) && !b.disabled))
async function clickHour(page, pick) {
  const ok = await page.evaluate((pick) => {
    const hs = [...document.querySelectorAll('button[aria-pressed]')].filter((b) => /^\d{2}:\d{2}$/.test(b.textContent.trim()) && !b.disabled && b.getAttribute('aria-pressed') !== 'true')
    const b = pick === 'last' ? hs[hs.length - 1] : hs[0]
    if (!b) return false
    b.click(); return b.textContent.trim()
  }, pick)
  await page.waitForTimeout(250)
  return ok
}
async function nextDay(page) {
  const ok = await page.evaluate(() => {
    const days = [...document.querySelectorAll('button[aria-pressed]')].filter((b) => !/^\d{2}:\d{2}$/.test(b.textContent.trim()) && /\d/.test(b.textContent) && b.textContent.trim().length < 30)
    const i = days.findIndex((b) => b.getAttribute('aria-pressed') === 'true')
    const n = days.slice(i + 1).find((b) => !b.disabled)
    if (!n) return false
    n.click(); return n.textContent.trim()
  })
  await page.waitForTimeout(600)
  return ok
}
const measure = (page) => page.evaluate(() => {
  const summary = document.querySelector('#resumen-mauri')
  const cal = summary?.parentElement?.children[0]
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top + scrollY), bottom: Math.round(b.bottom + scrollY), height: Math.round(b.height) } }
  return {
    docHeight: document.documentElement.scrollHeight,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    calendar: box(cal), summary: box(summary),
    selected: [...document.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t)),
  }
})

for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: vp === 'movil' ? 2 : 1, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${BASE}/mauri`, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed]')].some((b) => /^\d{2}:\d{2}$/.test(b.textContent.trim())), null, { timeout: 30000 })
  await page.evaluate(() => document.fonts.ready)
  const pre = join(OUT, `${label}-${vp}`)
  const shot = async (estado) => {
    metrics[`${vp}-${estado}h`] = { ...(await measure(page)), errors: [...errors] }
    if (vp === 'escritorio') {
      await page.addStyleTag({ content: 'header.sticky,[data-sticky-header]{position:relative!important}' })
      await page.locator('#booking-section').screenshot({ path: `${pre}-reserva-${estado}h.png` })
    } else {
      const cal = await page.evaluate(() => { const c = document.querySelector('#resumen-mauri').parentElement.children[0]; return c.getBoundingClientRect().top + scrollY })
      await page.evaluate((y) => scrollTo({ top: y - 70, behavior: 'instant' }), cal); await page.waitForTimeout(300)
      await page.screenshot({ path: `${pre}-agenda-${estado}h.png` })
      const s = await page.evaluate(() => document.querySelector('#resumen-mauri').getBoundingClientRect().top + scrollY)
      await page.evaluate((y) => scrollTo({ top: y - 70, behavior: 'instant' }), s); await page.waitForTimeout(300)
      await page.screenshot({ path: `${pre}-resumen-${estado}h.png` })
    }
  }
  await page.screenshot({ path: `${pre}-pagina-completa.png`, fullPage: true })
  await shot(0)
  const h1 = await clickHour(page, 'first')
  await shot(1)
  const h2 = await clickHour(page, 'last')
  const d2 = await nextDay(page)
  const h3 = await clickHour(page, 'first')
  await shot(3)
  metrics[`${vp}-clics`] = { h1, h2, d2, h3 }
  await ctx.close()
}
// Primera pantalla con movimiento (estado final de la entrada).
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: vp === 'movil' ? 2 : 1 })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/mauri`, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
  await page.waitForTimeout(1600)
  await page.screenshot({ path: join(OUT, `${label}-${vp}-primera-pantalla.png`) })
  await ctx.close()
}
await browser.close()
writeFileSync(join(OUT, `metricas-${label}.json`), JSON.stringify(metrics, null, 2) + '\n')
for (const [k, v] of Object.entries(metrics)) console.log(k, JSON.stringify(v.calendar ? { h: v.docHeight, ovf: v.horizontalOverflow, cal: v.calendar?.top, calB: v.calendar?.bottom, sumB: v.summary?.bottom, sel: v.selected, err: v.errors.length } : v))
