// Recorrido de /mauri en el navegador (local). Solo lecturas: no inicia sesión,
// no pulsa «Confirm booking» ni escribe en la base.
// Uso: PW=/ruta/node_modules/playwright [CHROME=/ruta/Chrome] node docs/evidencias/mauri-b-v2-web/probar-recorrido.mjs [base-url]
import { createRequire } from 'node:module'
import { join } from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.PW)
const BASE = process.argv[2] || 'http://localhost:3012'
const OUT = new URL('.', import.meta.url).pathname
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})
const results = []
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`)
const isHour = 'button[aria-pressed]'
const firstFreeHour = (page) =>
  page.evaluateHandle(() => [...document.querySelectorAll('button[aria-pressed]')].find((b) => /^\d{2}:\d{2}$/.test(b.textContent.trim()) && !b.disabled))
const waitHours = (page) =>
  page.waitForFunction(() => [...document.querySelectorAll('button[aria-pressed]')].some((b) => /^\d{2}:\d{2}$/.test(b.textContent.trim())), null, { timeout: 30000 })
const PLAYER = { authenticated: true, player: { full_name: 'Jugador Prueba', email: 'prueba@example.com', phone: '+60000000000', whatsapp_opt_in: false } }

for (const [vp, viewport] of Object.entries({ escritorio: { width: 1440, height: 900 }, movil: { width: 390, height: 844 } })) {
  // 1) Anónimo: elegir hora → Entrar de la cabecera conserva la selección.
  {
    const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const writes = []
    page.on('request', (r) => r.method() !== 'GET' && r.url().includes('/api/') && writes.push(`${r.method()} ${r.url()}`))
    await page.goto(`${BASE}/mauri`, { waitUntil: 'networkidle' })
    await waitHours(page)
    ok(`${vp} sin desbordamiento horizontal`, !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)))
    const login = page.locator('header a', { hasText: 'Entrar' })
    ok(`${vp} «Entrar» visible en la cabecera`, await login.isVisible())
    const hour = await firstFreeHour(page)
    const chosen = await hour.evaluate((b) => b.textContent.trim())
    await hour.asElement().click()
    ok(`${vp} hora elegida marcada`, (await hour.evaluate((b) => b.getAttribute('aria-pressed'))) === 'true', chosen)
    const href = await login.getAttribute('href')
    ok(`${vp} enlace sin JS = entrada normal`, href === '/cuenta/entrar?trainer=mauri', href)
    const [nav] = await Promise.all([page.waitForURL(/\/cuenta\//, { timeout: 15000 }).then(() => page.url()), login.click()])
    const draftId = new URL(nav).searchParams.get('draft')
    ok(`${vp} «Entrar» lleva &draft=`, /^[0-9a-f-]{36}$/.test(draftId ?? ''), nav.replace(BASE, ''))
    const stored = await page.evaluate((id) => Object.keys(localStorage).filter((k) => k.endsWith(id)).map((k) => localStorage.getItem(k)), draftId)
    const saved = stored[0] ? JSON.parse(stored[0]) : null
    ok(`${vp} borrador guardado sin datos personales`, !!saved && saved.sessions.length === 1 && !('email' in saved) && !('name' in saved), JSON.stringify(saved?.sessions))
    // 2) Vuelta del login: /mauri?draft= restaura la hora (si sigue libre) en el checkout.
    await page.goto(`${BASE}/mauri?draft=${draftId}#booking-section`, { waitUntil: 'networkidle' })
    const restored = await page
      .waitForFunction(
        // El checkout (inglés) escribe la hora como «9:00 AM».
        (t) => {
          const [h, m] = t.split(':').map(Number)
          const ampm = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
          return document.body.innerText.includes(ampm) && /Review your booking/i.test(document.body.innerText)
        },
        chosen,
        { timeout: 20000 }
      )
      .then(() => true)
      .catch(() => false)
    ok(`${vp} vuelta con ?draft= recupera la hora en el checkout`, restored, chosen)
    await page.screenshot({ path: join(OUT, `despues-${vp}-vuelta-login.png`) })
    ok(`${vp} sin escrituras a la API`, writes.length === 0, writes.join(', '))
    ok(`${vp} sin errores JS`, errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
  // 3) Con sesión de jugador (respuesta simulada SOLO en el navegador): la cabecera lo muestra.
  {
    const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', deviceScaleFactor: vp === 'movil' ? 2 : 1 })
    const page = await ctx.newPage()
    await page.route('**/api/player/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYER) }))
    await page.goto(`${BASE}/mauri`, { waitUntil: 'networkidle' })
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
    await waitHours(page)
    const chip = page.locator('header a[href="/cuenta"]')
    ok(`${vp} con sesión: cabecera muestra la cuenta y oculta «Entrar»`, (await chip.isVisible()) && !(await page.locator('header a', { hasText: 'Entrar' }).count()))
    await page.screenshot({ path: join(OUT, `despues-${vp}-con-sesion.png`) })
    await ctx.close()
  }
  // 4) Sin sesión: captura de la cabecera con «Entrar».
  {
    const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', deviceScaleFactor: vp === 'movil' ? 2 : 1 })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/mauri`, { waitUntil: 'networkidle' })
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
    await page.screenshot({ path: join(OUT, `despues-${vp}-sin-sesion.png`), clip: { x: 0, y: 0, width: viewport.width, height: 120 } })
    await ctx.close()
  }
}

// 5) Movimiento: con reduce todo visible y sin animación; sin reduce, las secciones entran.
for (const motion of ['reduce', 'no-preference']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: motion })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/mauri`, { waitUntil: 'networkidle' })
  const state = await page.evaluate(() => {
    const offer = document.querySelector('#oferta [data-reveal]')
    const h1 = document.querySelector('h1')
    return { offerOpacity: getComputedStyle(offer).opacity, h1Anim: getComputedStyle(h1).animationName }
  })
  if (motion === 'reduce') ok('reduce: oferta visible antes de llegar y hero sin animación', state.offerOpacity === '1' && state.h1Anim === 'none', JSON.stringify(state))
  else {
    await page.evaluate(() => document.querySelector('#oferta').scrollIntoView())
    await page.waitForTimeout(900)
    const after = await page.evaluate(() => getComputedStyle(document.querySelector('#oferta [data-reveal]')).opacity)
    ok('movimiento: oferta oculta fuera de pantalla, visible al llegar; hero anima', state.offerOpacity === '0' && after === '1' && state.h1Anim !== 'none', JSON.stringify({ ...state, after }))
  }
  await ctx.close()
}
await browser.close()
console.log(results.join('\n'))
if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1
