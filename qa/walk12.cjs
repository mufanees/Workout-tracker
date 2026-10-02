// Home rings (today + week), the fasting-done celebration (goal hit) and a short workout that
// still earns the day ("showed up"), in dark and light.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const OUT = __dirname + '/shots12/'
require('fs').mkdirSync(OUT, { recursive: true })
const local = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  let doneUrl = ''
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
    await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
    const shot = async (n, full) => { await page.waitForTimeout(500); await page.screenshot({ path: OUT + scheme + '-' + n + '.png', fullPage: !!full }) }
    await page.goto('http://localhost:3000/#/train')
    await page.waitForSelector('.today-rings')
    await page.waitForTimeout(1500)
    await shot('01-home')
    if (scheme === 'light') {
      // the dark run just ended a fast; a new 16 h one would overlap it, so reopen that celebration
      await page.goto(doneUrl)
      await page.waitForSelector('.fast-celebrate')
      await page.waitForTimeout(2800)
      await shot('03-fast-done', true)
      console.log(scheme, errors.join('\n') || 'no errors')
      await ctx.close()
      continue
    }
    // fast: make sure one is running, back-date it to 16 h ago, end it
    await page.goto('http://localhost:3000/#/fast')
    await page.waitForSelector('.fast-screen')
    if (await page.locator('.fast-hero .btn-primary', { hasText: 'Start' }).count()) {
      await page.locator('.proto-pill').tap()
      await page.locator('.proto', { hasText: '16:8' }).tap()
      await page.locator('.fast-hero .btn-primary', { hasText: 'Start' }).tap()
      await page.waitForTimeout(400)
    }
    await page.locator('.fast-times button').tap()
    await page.locator('#time-exact').fill(local(Date.now() - 16 * 3600000 - 12 * 60000))
    await page.locator('.sheet-foot .btn-primary').tap()
    await page.waitForTimeout(500)
    await page.locator('.fast-hero .btn-primary', { hasText: 'End fast' }).tap()
    await page.waitForSelector('.fast-celebrate')
    doneUrl = page.url()
    await page.waitForTimeout(300)
    await shot('02-fast-done-burst')
    await page.waitForTimeout(2500)
    await shot('03-fast-done', true)
    await page.locator('.btn-primary', { hasText: 'Done' }).tap()
    await page.waitForSelector('.today-rings')
    await shot('04-home-after-fast')
    if (scheme === 'dark') {
      // a short workout: start a routine, log one set, finish
      await page.locator('.routine-card').first().locator('button', { hasText: 'Start' }).tap()
      await page.waitForSelector('.live')
      await page.locator('.ex-card').first().locator('.check').first().tap()
      await page.locator('.live-head .btn-primary').tap()
      await page.waitForTimeout(400)
      const sheetBtn = page.locator('.sheet-foot .btn-primary')
      if (await sheetBtn.count()) await sheetBtn.tap()
      await page.waitForSelector('.celebrate')
      await page.waitForTimeout(300)
      await shot('05-workout-done-burst')
      await page.waitForTimeout(2500)
      await shot('06-workout-done', true)
      await page.goto('http://localhost:3000/#/train')
      await page.waitForTimeout(800)
      await shot('07-home-showed-up')
      await page.locator('.tr-row.r-move').tap()
      await shot('08-move-goal')
    }
    console.log(scheme, errors.join('\n') || 'no errors')
    await ctx.close()
  }
  await browser.close()
})()
