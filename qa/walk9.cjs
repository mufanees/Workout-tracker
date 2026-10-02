// Hero quote on Train (rotation + tap), dark and light; coach with a Gemini backend.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const OUT = __dirname + '/shots9/'
require('fs').mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
    await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    await page.goto('http://localhost:3000/')
    await page.waitForSelector('.hero-quote')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: OUT + scheme + '-01-train.png' })
    const first = await page.locator('.hq-text').innerText()
    await page.locator('.hero-quote').tap()
    await page.waitForTimeout(600)
    await page.screenshot({ path: OUT + scheme + '-02-tapped.png' })
    const second = await page.locator('.hq-text').innerText()
    await page.waitForTimeout(12500)
    const third = await page.locator('.hq-text').innerText()
    console.log(scheme, 'tap changed:', first !== second, '| auto-rotated after 12 s:', second !== third)
    if (scheme === 'dark') {
      await page.locator('.tab').nth(4).tap()
      await page.locator('.coach-chips .chip').first().tap()
      await page.waitForTimeout(2000)
      await page.screenshot({ path: OUT + 'coach-gemini.png' })
    }
    console.log(errors.join('\n') || 'no errors')
    await ctx.close()
  }
  await browser.close()
})()
