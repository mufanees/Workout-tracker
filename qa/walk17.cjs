// Tap droplets on any control, fasting ring markers, Zone 2 line.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const { installFakeClaude } = require('./fake-claude.cjs')
const URL = process.env.URL || 'http://localhost:4173/'
const OUT = __dirname + '/shots17/'
require('fs').mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await installFakeClaude(ctx, { store: new Map(), sample: async () => ({ text: '{}' }) })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL + '#/train')
  await page.waitForSelector('.checkin')
  await page.waitForTimeout(1200)
  const chip = page.locator('.checkin button', { hasText: 'Good' }).first()
  const box = await chip.boundingBox()
  await chip.tap()
  for (const t of [70, 200, 380, 650]) {
    await page.waitForTimeout(t === 70 ? 40 : t === 200 ? 130 : t === 380 ? 180 : 270)
    await page.screenshot({ path: OUT + 'tap-' + t + '.png', clip: { x: box.x - 90, y: box.y - 150, width: box.width + 180, height: 230 } })
  }
  console.log('tap nodes during:', 'ok', '| after 1.6s:', await page.waitForTimeout(1000).then(() => page.evaluate(() => document.querySelectorAll('.goo-tap').length)))
  // rapid taps are capped
  // a check-in chip: tappable, and doesn't navigate
  const okb = await page.locator('.checkin-opts').nth(1).locator('button').nth(1).boundingBox()
  for (let i = 0; i < 8; i++) await page.mouse.click(okb.x + okb.width / 2, okb.y + okb.height / 2)
  console.log('max live after 8 rapid taps:', await page.evaluate(() => document.querySelectorAll('.goo-tap').length))
  for (const t of [0, 900, 1800]) { await page.waitForTimeout(t ? 900 : 0); const tb = await page.locator('.tab.on').boundingBox(); await page.screenshot({ path: OUT + 'motes-' + t + '.png', clip: { x: tb.x - 20, y: tb.y - 50, width: tb.width + 40, height: tb.height + 60 } }) }
  console.log('motes:', await page.locator('.tab.on .motes i').count())
  console.log('zone2 sub:', await page.locator('.tr-row.r-z2 .tr-sub').innerText())
  await page.goto(URL + '#/fast'); await page.waitForTimeout(1000)
  const m = await page.evaluate(() => [...document.querySelectorAll('.sr-mark svg')].map((s) => Math.round(s.getBoundingClientRect().width)))
  console.log('marker icon widths:', m)
  await page.locator('.stage-ring').screenshot({ path: OUT + 'ring.png' })
  console.log('errors', errors)
  await browser.close()
})()
