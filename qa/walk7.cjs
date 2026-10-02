// New features: warm-up checklist, stall nudge, shoulder check-in, morning HRV reading, zone 2 goal, notifications settings.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const OUT = __dirname + '/shots7/'
require('fs').mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: process.env.SCHEME || 'dark' })
  await ctx.addInitScript(() => {
    localStorage.setItem('reps-token', 'testkey')
    // Fake strap: ~56 bpm at rest with R-R intervals (flag 0x10), wandering a little.
    const ch = new EventTarget()
    let t = 0
    ch.startNotifications = async () => {
      setInterval(() => {
        t++
        const rr = Math.round((1070 + Math.sin(t / 2) * 60 + (t % 5) * 8) * 1.024)
        const hr = Math.round(60000 / (rr / 1.024))
        const buf = new Uint8Array([0x10, hr, rr & 255, rr >> 8])
        ch.value = new DataView(buf.buffer)
        ch.dispatchEvent(new Event('characteristicvaluechanged'))
      }, 1000)
      return ch
    }
    const device = new EventTarget()
    device.id = 'dev1'
    device.name = 'HRM-Dual:123456'
    device.gatt = { connected: false, connect: async () => ((device.gatt.connected = true), device.gatt), disconnect() {}, getPrimaryService: async () => ({ getCharacteristic: async () => ch }) }
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => device, getDevices: async () => [] } })
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
  const shot = async (n, full) => { await page.waitForTimeout(450); await page.screenshot({ path: OUT + n + '.png', fullPage: !!full }) }
  await page.goto('http://localhost:3000/')
  await page.waitForSelector('.page-head')
  await page.waitForTimeout(1800)
  // Phase 2 B has Hammer Curl (stalled) and the warm-up checklist
  await page.locator('.routine-card', { hasText: 'Phase 2 · Workout B' }).locator('button', { hasText: 'Start' }).tap()
  await page.waitForSelector('.live')
  await shot('01-live-warmup')
  await page.locator('.cl-item').nth(0).tap()
  await page.locator('.cl-item').nth(1).tap()
  await shot('02-warmup-ticked')
  const stalled = page.locator('.tag-stall')
  console.log('stall tags:', await stalled.count())
  await stalled.first().scrollIntoViewIfNeeded()
  await shot('03-stall-tag')
  await stalled.first().tap()
  await shot('04-stall-sheet')
  await page.locator('.action', { hasText: 'Go lighter today' }).tap()
  await shot('05-after-deload')
  // log one set and finish with a shoulder rating
  await page.locator('.ex-card').first().locator('.check').first().tap()
  await page.locator('.live-head .btn-primary').tap()
  await page.locator('.scale-btn', { hasText: '5' }).tap()
  await shot('06-finish-shoulder')
  await page.locator('.sheet-foot .btn-primary').tap()
  await page.waitForTimeout(700)
  // Body tab
  await page.goto('http://localhost:3000/#/body')
  await page.waitForTimeout(700)
  await shot('07-body', true)
  await page.locator('.body-card button', { hasText: /reading|Connect strap/ }).first().tap()
  await page.waitForTimeout(3000)
  await shot('08-reading')
  await page.waitForTimeout(60000)
  await shot('09-reading-done', true)
  await page.goto('http://localhost:3000/#/settings')
  await page.waitForTimeout(500)
  await shot('10-settings', true)
  console.log(errors.join('\n') || 'no errors')
  await browser.close()
})()
