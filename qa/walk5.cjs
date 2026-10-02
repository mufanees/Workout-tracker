const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const OUT = __dirname + '/shots5/'
require('fs').mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: process.env.SCHEME || 'dark' })
  await ctx.addInitScript(() => {
    localStorage.setItem('reps-token', 'testkey')
    // Fake Web Bluetooth heart rate strap: 8-bit HR format, value wanders 105-165.
    const ch = new EventTarget()
    let t = 0
    ch.startNotifications = async () => {
      setInterval(() => {
        t++
        const hr = Math.round(135 + Math.sin(t / 6) * 30)
        ch.value = new DataView(new Uint8Array([0, hr]).buffer)
        ch.dispatchEvent(new Event('characteristicvaluechanged'))
      }, 1000)
      return ch
    }
    const device = new EventTarget()
    device.id = 'dev1'
    device.name = 'HRM-Dual:123456'
    device.gatt = { connected: false, connect: async () => (device.gatt.connected = true, device.gatt), disconnect() {}, getPrimaryService: async () => ({ getCharacteristic: async () => ch }) }
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => device, getDevices: async () => [] } })
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
  const shot = async (n, full) => { await page.waitForTimeout(450); await page.screenshot({ path: OUT + n + '.png', fullPage: !!full }) }
  await page.goto('http://localhost:3000/')
  await page.waitForSelector('.page-head')
  await page.waitForTimeout(1500)
  await shot('01-train')
  await page.locator('button', { hasText: 'Zone 2 cardio' }).tap()
  await page.waitForSelector('.live')
  await shot('02-cardio-start')
  await page.locator('.hr-connect').tap()
  await page.waitForTimeout(3000)
  await shot('03-hr-connected')
  await page.waitForTimeout(28000)
  await shot('04-hr-after-30s')
  await page.locator('.live-head .btn-primary').tap()
  await page.locator('.sheet-foot .btn-primary').tap()
  await page.waitForTimeout(800)
  await shot('05-summary', true)
  await page.locator('.tab').nth(1).tap()
  await page.waitForTimeout(500)
  await shot('06-history', true)
  await page.locator('.tab').nth(3).tap()
  await page.waitForTimeout(500)
  await shot('07-body', true)
  await page.locator('button', { hasText: /Start \d+ h fast/ }).tap()
  await page.fill('#weight-input', '81.6')
  await page.locator('.weight-log .btn-primary').tap()
  await shot('08-body-fasting', true)
  await page.goto('http://localhost:3000/#/settings')
  await page.waitForTimeout(500)
  await shot('09-settings', true)
  console.log(errors.join('\n') || 'no errors')
  await browser.close()
})()
