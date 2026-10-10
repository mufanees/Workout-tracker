// Landing page walkthrough: PORT=… node qa/walk-landing.cjs (a server with the built dist).
// Phone and desktop, dark and light, reduced motion; every demo driven (time budget, coach, the bad-day
// check-in, the fasting ring, the weight chart and the muscle map); screenshots in qa/shots-landing/.
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

  // hero: the four pillars link to their sections, and the sections come in the right order
  const pillars = await page.locator('.pillars a').evaluateAll((as) => as.map((a) => `${a.textContent.trim()}${a.getAttribute('href')}`))
  ok(pillars.join(' ') === 'Workouts#time Fasting#fasting Body#body Coach#coach', `${tag}: hero pillars (${pillars.join(' ')})`)
  const order = await page.evaluate(() => [...document.querySelectorAll('main > section[id]')].map((s) => s.id).join(' '))
  ok(order === 'time coach badday fasting body parents features', `${tag}: section order (${order})`)
  ok((await page.locator('#features .feat').count()) === 6 && (await page.locator('#features .fast-ring, #features .bodymap').count()) === 0, `${tag}: fasting and the muscle map left the features grid`)

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

  // a bad day isn't a weak day: the check-in drives today's plan
  const today = async () => ({ sq: await page.locator('#t-sq-now').textContent(), lr: await page.locator('#t-lr-now').textContent(), sub: await page.locator('#t-sq-sub').textContent(), line: await page.locator('#t-line').textContent(), state: await page.locator('#day-state').textContent(), after: await page.locator('#t-after').isVisible() })
  await page.locator('#badday .bad-grid').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  let t = await today()
  ok(t.sq === '3 × 8 · 16 kg' && t.lr === '3 × 12 · 10 kg' && /^Goblet Squat first: 16 kg × 8\.$/.test(t.line) && !t.after, `${tag}: good morning → 3 × 8 · 16 kg (${t.sq}; ${t.line})`)
  await page.locator('#badday').screenshot({ path: name('13-badday-good') })
  await page.locator('.seg[data-f="sleep"] button', { hasText: 'Poor' }).click()
  await page.waitForTimeout(reduced ? 150 : 700)
  t = await today()
  ok(t.sq === '3 × 8 · 15 kg' && /Rest \+15\s/.test(t.sub) && t.lr === '2 × 12 · 8 kg', `${tag}: poor sleep → 3 × 8 · 15 kg, rest +15 s, one set fewer on the raise (${t.sq} | ${t.sub} | ${t.lr})`)
  ok(t.line === "Short sleep last night: a bit lighter today. Strength doesn't vanish overnight." && t.after && /Rough day/.test(t.state), `${tag}: the coach's kind line and the finish credit (${t.line})`)
  await page.locator('#badday').screenshot({ path: name('14-badday-rough') })
  await page.locator('.seg[data-f="sleep"] button', { hasText: 'OK' }).click()
  await page.locator('.seg[data-f="energy"] button', { hasText: 'OK' }).click()
  await page.waitForTimeout(reduced ? 150 : 700)
  t = await today()
  ok(t.sq === '3 × 8 · 15 kg' && t.lr === '3 × 12 · 10 kg' && /^Not your sharpest morning/.test(t.line) && !/Rest \+15/.test(t.sub), `${tag}: two OKs → mild: 15 kg, same sets and rests (${t.sq} | ${t.lr})`)
  await page.locator('.seg[data-f="sleep"] button', { hasText: 'Good' }).focus()
  await page.keyboard.press('Enter')
  await page.locator('.seg[data-f="energy"] button', { hasText: 'High' }).click()
  t = await today()
  ok(t.sq === '3 × 8 · 16 kg' && !t.after, `${tag}: back to a good morning → 16 kg again`)
  const pillW = await page.locator('.seg[data-f="sleep"] rect').evaluate((r) => Number(r.getAttribute('width')))
  ok(pillW > 20, `${tag}: the goo pill sits under the picked option (${pillW})`)

  // fasting: scrub the ring, change the plan, set the start back
  await page.locator('#fasting .fast-grid').scrollIntoViewIfNeeded()
  await page.waitForTimeout(reduced ? 200 : 900)
  const stage = () => page.locator('#st-name').textContent()
  ok((await stage()) === 'Fat burning' && (await page.locator('#ft-goal').textContent()) === '12:00 pm', `${tag}: 14h 15m of 16:8 → Fat burning, goal at 12:00 pm`)
  await page.locator('#fasting').screenshot({ path: name('15-fasting') })
  const fh = page.locator('#fhours')
  await fh.fill('2'); ok((await stage()) === 'Digesting', `${tag}: 2 h → Digesting`)
  await fh.fill('9'); ok((await stage()) === 'Blood sugar steady', `${tag}: 9 h → Blood sugar steady`)
  await fh.fill('19.5'); ok((await stage()) === 'Ketosis' && (await page.locator('#fr-label').textContent()) === 'Goal reached', `${tag}: 19.5 h → Ketosis, goal reached`)
  await page.locator('#plans .chip', { hasText: '20:4' }).click()
  ok((await page.locator('#fr-of').textContent()) === 'of 20:4' && (await page.locator('#ft-eat').textContent()) === '4 h' && (await page.locator('.sr-mark').count()) === 5, `${tag}: 20:4 plan → 4 h window, five stage marks`)
  await page.locator('#plans .chip', { hasText: '36 h' }).click()
  ok((await fh.getAttribute('max')) === '36' && /No daily eating window/.test(await page.locator('#eat-note').textContent()), `${tag}: 36 h plan → scrub to 36 h, no daily window`)
  await page.locator('#plans .chip', { hasText: '16:8' }).click()
  await fh.fill('10')
  await page.locator('#earlier').click()
  await page.locator('#offsets button', { hasText: '2 h ago' }).click()
  ok((await page.locator('#ft-start').textContent()) === '6:00 pm' && (await fh.inputValue()) === '12', `${tag}: started 2 h earlier → 6:00 pm, 12 h in`)
  // drag the ring's knob to about 3 o'clock (a quarter of 16 h = 4 h)
  await page.locator('#fring').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const rb = await page.locator('#fring > svg').boundingBox()
  const k = rb.width / 300
  const p0 = { x: rb.x + 150 * k, y: rb.y + (150 - 118) * k }
  await page.mouse.move(p0.x + 1, p0.y)
  await page.mouse.down()
  await page.mouse.move(rb.x + (150 + 84) * k, rb.y + (150 - 84) * k, { steps: 4 })
  await page.mouse.move(rb.x + (150 + 118) * k, rb.y + 150 * k, { steps: 4 })
  await page.mouse.up()
  const dragged = Number(await fh.inputValue())
  ok(dragged >= 3.5 && dragged <= 4.5 && (await stage()) === 'Blood sugar falling', `${tag}: dragging the knob to 3 o'clock → ${dragged} h, Blood sugar falling`)
  await fh.fill('14.25')
  await page.waitForTimeout(reduced ? 150 : 900)
  await page.locator('#fasting').screenshot({ path: name('16-fasting-back') })

  // body: the weight chart reads a day, the muscle map shows "fresh by"
  await page.locator('#body .body-grid').scrollIntoViewIfNeeded()
  await page.waitForTimeout(reduced ? 300 : 2600)
  ok((await page.locator('#wc-svg .wc-dot').count()) > 40 && /Target 78 kg: likely in about \d+ weeks/.test(await page.locator('#wc-target').textContent()), `${tag}: weigh-ins, trend and a target date`)
  await page.locator('#body').screenshot({ path: name('17-body') })
  const wb = await page.locator('#wc-svg').boundingBox()
  await page.mouse.click(wb.x + wb.width * 0.95, wb.y + wb.height * 0.5)
  ok(/^In \d+ (weeks|days): likely/.test(await page.locator('#wc-read').textContent()), `${tag}: tapping the forecast reads it (${await page.locator('#wc-read').textContent()})`)
  await page.mouse.click(wb.x + wb.width * 0.2, wb.y + wb.height * 0.5)
  ok(/(weeks|days) ago|Today|Yesterday/.test(await page.locator('#wc-read').textContent()), `${tag}: tapping the past reads a weigh-in`)
  ok(/Quads/.test(await page.locator('#bm-read').textContent()) && /Fresh by Saturday morning/.test(await page.locator('#bm-read').textContent()), `${tag}: quads selected: fresh by Saturday morning`)
  await page.locator('#bmap-svg .region[aria-label^="Chest"]').click()
  ok(/Chest/.test(await page.locator('#bm-read').textContent()) && /Fresh by Friday morning/.test(await page.locator('#bm-read').textContent()), `${tag}: tapping the chest on the figure shows when it's fresh`)
  await page.locator('#bm-list button', { hasText: 'Hamstrings' }).click()
  ok(/Hamstrings/.test(await page.locator('#bm-read').textContent()), `${tag}: the list picks a region too`)
  await page.locator('#body .bmap').screenshot({ path: name('18-body-map') })

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
