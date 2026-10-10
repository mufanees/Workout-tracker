// Landing page walkthrough: PORT=… node qa/walk-landing.cjs (a server with the built dist).
// Phone and desktop, dark and light, reduced motion; both demos driven; screenshots in qa/shots-landing/.
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright')
const fs = require('fs')
const path = require('path')
const BASE = `http://localhost:${process.env.PORT || 3960}`
const OUT = path.join(__dirname, 'shots-landing')
fs.mkdirSync(OUT, { recursive: true })
let fails = 0
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++ }

async function run(browser, { w, h, scheme, reduced, tag, full }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: w < 500, isMobile: w < 500 })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${BASE}/welcome/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(reduced ? 300 : 2600)
  const name = (s) => path.join(OUT, `${tag}-${s}.png`)
  await page.screenshot({ path: name('01-hero') })
  const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)
  ok(over <= 0, `${tag}: no horizontal overflow (${over})`)
  if (full) await page.screenshot({ path: name('00-full'), fullPage: true })

  // demo 1
  const range = page.locator('#mins')
  await page.locator('#time .budget').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  await page.locator('#time').screenshot({ path: name('02-budget-25') })
  for (const m of [15, 45]) {
    await range.fill(String(m))
    await page.waitForTimeout(reduced ? 200 : 1400)
    await page.locator('#time').screenshot({ path: name(`03-budget-${m}`) })
    ok((await page.locator('#fit-text').textContent()) === `fits your ${m}`, `${tag}: dial says fits your ${m}`)
  }
  await range.focus()
  await page.keyboard.press('ArrowLeft') // 44
  ok((await range.inputValue()) === '44', `${tag}: slider moves with the keyboard`)
  await page.locator('.presets .chip[data-m="20"]').click()
  await page.waitForTimeout(reduced ? 200 : 1400)
  await page.locator('#time').screenshot({ path: name('03-budget-20') })

  // demo 2
  await page.locator('#live').scrollIntoViewIfNeeded()
  const shot2 = async (s) => { await page.waitForTimeout(reduced ? 150 : 450); await page.locator('#coach .coach-grid > div:first-child').screenshot({ path: name(s) }) }
  await shot2('04-coach-start')
  await page.locator('#chk1').click()
  await shot2('05-coach-effort')
  await page.locator('#effort button[data-e="easy"]').click()
  await page.waitForTimeout(600)
  await shot2('06-coach-heavier')
  await page.getByRole('button', { name: 'Use 14 kg' }).click()
  ok((await page.locator('#w2').textContent()) === '14', `${tag}: set 2 goes to 14 kg`)
  await page.getByRole('button', { name: 'Go now' }).waitFor({ timeout: 15000 })
  const said = await page.locator('#cs-text').textContent()
  ok(/Recovered: go now, saves 0:4\d/.test(said), `${tag}: recovered line (${said})`)
  await shot2('07-coach-recovered')
  await page.getByRole('button', { name: 'Go now' }).click()
  await page.locator('#chk2').click()
  await page.getByRole('button', { name: 'Apply' }).waitFor({ timeout: 5000 })
  await shot2('08-coach-behind')
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.waitForTimeout(900)
  ok(await page.locator('#next-ro').isHidden(), `${tag}: roll-outs leave the plan`)
  await shot2('09-coach-applied')

  // the rest of the page
  await page.locator('#parents').scrollIntoViewIfNeeded()
  await page.waitForTimeout(900)
  await page.locator('#parents').screenshot({ path: name('10-parents') })
  await page.locator('#features').scrollIntoViewIfNeeded()
  await page.waitForTimeout(900)
  await page.locator('#features').screenshot({ path: name('11-features') })
  await page.locator('.ink-card').scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await page.locator('.ink-card').screenshot({ path: name('12-closing') })
  const over2 = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)
  ok(over2 <= 0, `${tag}: still no horizontal overflow after the demos (${over2})`)
  ok(errors.length === 0, `${tag}: no console errors ${errors.join(' | ')}`)
  await ctx.close()
}

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
  const only = process.env.ONLY
  const runs = [
    { w: 390, h: 844, scheme: 'dark', tag: 'dark-390', full: true },
    { w: 390, h: 844, scheme: 'light', tag: 'light-390', full: true },
    { w: 1440, h: 900, scheme: 'dark', tag: 'dark-1440', full: true },
    { w: 1440, h: 900, scheme: 'light', tag: 'light-1440' },
    { w: 390, h: 844, scheme: 'dark', reduced: true, tag: 'reduced-390' },
    { w: 360, h: 740, scheme: 'dark', tag: 'dark-360' },
  ].filter((r) => !only || r.tag.includes(only))
  for (const r of runs) await run(browser, r)

  // hero: drag the goo
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/welcome/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const box = await page.locator('#clock').boundingBox()
  const s = box.width / 400
  const top = { x: box.x + 200 * s, y: box.y + (200 - 142) * s }
  await page.mouse.move(top.x, top.y)
  await page.mouse.down()
  await page.mouse.move(top.x + 40 * s, top.y + 70 * s, { steps: 8 })
  await page.waitForTimeout(120)
  await page.locator('#stage').screenshot({ path: path.join(OUT, 'hero-drag.png') })
  await page.mouse.move(top.x + 60 * s, top.y + 140 * s, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(160)
  await page.locator('#stage').screenshot({ path: path.join(OUT, 'hero-fling.png') })
  // the app still loads at /
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const appOk = await page.evaluate(() => !!document.querySelector('#app, #root, body > div') && !document.querySelector('.hero-copy'))
  ok(appOk, 'the app at / still loads (not the landing page)')
  await page.screenshot({ path: path.join(OUT, 'app-root.png') })
  // with the app's service worker installed, /welcome/ still serves the landing page
  await page.goto(`${BASE}/welcome/`, { waitUntil: 'load' })
  await page.reload({ waitUntil: 'load' })
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration('/')))
  ok(await page.locator('.hero-copy').count() === 1, `/welcome/ serves the landing page with the service worker ${sw ? 'installed' : 'absent'}`)
  await ctx.close()
  await browser.close()
  console.log(fails ? `${fails} failed` : 'all passed')
  process.exit(fails ? 1 : 0)
})()
