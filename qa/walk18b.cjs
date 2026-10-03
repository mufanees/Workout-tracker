// Frame-exact capture of the tab pill switch: the page clock is frozen and stepped 60ms at a time.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const { installFakeClaude } = require('./fake-claude.cjs')
const URL = process.env.URL || 'http://localhost:4173/'
const OUT = __dirname + '/shots18/'
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await installFakeClaude(ctx, { store: new Map(), sample: async () => ({ text: '{}' }) })
  const page = await ctx.newPage()
  await page.clock.install()
  await page.goto(URL + '#/train')
  await page.clock.runFor(2000)
  await page.waitForSelector('.tab-goo')
  const bar = await page.locator('.tabbar').boundingBox()
  const clip = { x: bar.x - 4, y: bar.y - 8, width: bar.width + 8, height: bar.height + 12 }
  await page.clock.pauseAt(new Date(Date.now() + 5000))
  await page.locator('.tab').nth(4).tap()
  const files = []
  for (let i = 0; i <= 14; i++) {
    const f = OUT + 'step-' + String(i * 40).padStart(3, '0') + '.png'
    await page.screenshot({ path: f, clip })
    files.push(f)
    await page.clock.runFor(40)
  }
  console.log(files.join(' '))
  await browser.close()
})()
