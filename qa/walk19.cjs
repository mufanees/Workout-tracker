// Weight model on the Body screen: 60 days of synthetic weigh-ins (losing 0.5 kg/week, Mondays
// heavy, light mornings after long fasts), a target set through the UI, chart readout on tap.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const { installFakeClaude } = require('./fake-claude.cjs')
const URL = process.env.URL || 'http://localhost:4173/'
const OUT = __dirname + '/shots19/'
require('fs').mkdirSync(OUT, { recursive: true })
let seed = 11
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd())
const DAY = 86400000
function seedStore(days = 60) {
  const store = new Map()
  const P = 'data/users/u_test/'
  const now = Date.now()
  const morning = new Date(); morning.setHours(7, 30, 0, 0)
  for (let i = days; i >= 0; i--) {
    const t = morning.getTime() - i * DAY
    const fasted = i % 3 === 0
    if (fasted) store.set(P + 'fasts~f' + i, { store: 'fasts', id: 'f' + i, updatedAt: now, deleted: false, data: { id: 'f' + i, start: t - 17 * 3600000, end: t + 2 * 3600000, goal: 16, updatedAt: now } })
    if (rnd() < 0.25) continue
    let kg = 92 - (0.5 * (days - i)) / 7 + 0.55 * gauss()
    if (new Date(t).getDay() === 1) kg += 0.7
    if (fasted) kg -= 0.7
    store.set(P + 'body~b' + i, { store: 'body', id: 'b' + i, updatedAt: now, deleted: false, data: { id: 'b' + i, date: t, kg: Math.round(kg * 10) / 10, updatedAt: now } })
  }
  return store
}
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
    await installFakeClaude(ctx, { store: seedStore(), sample: async () => ({ text: '{}' }) })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(URL + '#/body')
    await page.waitForSelector('.weight-card')
    await page.waitForTimeout(1500)
    const set = page.locator('.weight-card .target-set')
    if (await set.count()) {
      await set.tap()
      await page.locator('#target-weight').fill('86')
      await page.locator('#target-weight').press('Enter')
      await page.waitForTimeout(600)
    }
    const card = page.locator('.weight-card')
    await card.scrollIntoViewIfNeeded()
    await card.screenshot({ path: OUT + scheme + '-card.png' })
    console.log(scheme, '| grid:', (await page.locator('.wm-grid').innerText()).replace(/\n/g, ' / '))
    console.log(scheme, '| eta:', await page.locator('.wm-eta').innerText().catch(() => '-'))
    console.log(scheme, '| patterns:', await page.locator('.wm-pattern').allInnerTexts())
    const svg = page.locator('.weight-chart svg')
    const b = await svg.boundingBox()
    await page.mouse.click(b.x + b.width * 0.85, b.y + b.height / 2)
    await page.waitForTimeout(200)
    console.log(scheme, '| tap forecast:', await page.locator('.weight-chart .chart-readout').innerText())
    await page.locator('.weight-chart').screenshot({ path: OUT + scheme + '-chart-tap.png' })
    console.log(scheme, 'errors', errors)
    await ctx.close()
  }
  await browser.close()
})()
