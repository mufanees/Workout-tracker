// Clock time picker in the fasting "set the start time" sheet: tap an hour, it moves on to
// minutes, tap a minute, drag around, AM/PM; dark and light.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const { installFakeClaude } = require('./fake-claude.cjs')
const URL = process.env.URL || 'http://localhost:4173/'
const OUT = __dirname + '/shots20/'
require('fs').mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, locale: 'en-US' })
    await installFakeClaude(ctx, { store: new Map(), sample: async () => ({ text: '{}' }) })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(URL + '#/fast')
    await page.waitForSelector('.fast-screen')
    await page.waitForTimeout(800)
    await page.locator('button', { hasText: 'Set the start time' }).first().tap()
    await page.waitForSelector('.sheet .clock-dial')
    await page.waitForTimeout(500)
    const read = () => page.evaluate(() => [...document.querySelectorAll('.sheet .clock-box')].map((b) => b.textContent).join(':') + ' ' + (document.querySelector('.sheet .clock-ampm .on')?.textContent || '') + ' | mode ' + (document.querySelector('.sheet .clock-box.on') === document.querySelectorAll('.sheet .clock-box')[0] ? 'hour' : 'minute') + ' | ' + document.querySelector('.sheet .time-big b').textContent)
    // Yesterday so no time is in the future
    await page.locator('.sheet .when-days .chip', { hasText: 'Yesterday' }).tap()
    await page.waitForTimeout(300)
    const sheet = page.locator('.sheet')
    await page.locator('.sheet .clock').scrollIntoViewIfNeeded()
    await page.locator('.sheet .clock').screenshot({ path: OUT + scheme + '-1-open.png' })
    const tapNum = async (text) => {
      const n = page.locator('.sheet .clock-num', { hasText: new RegExp('^' + text + '$') }).first()
      const b = await n.boundingBox()
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await page.mouse.down(); await page.mouse.up()
      await page.waitForTimeout(400)
    }
    await tapNum('3')
    console.log(scheme, 'after hour 3:', await read())
    await tapNum('30')
    console.log(scheme, 'after minute 30:', await read())
    await page.locator('.sheet .clock').screenshot({ path: OUT + scheme + '-2-picked.png' })
    // drag the minute hand to ~:47
    const dial = await page.locator('.sheet .clock-dial').boundingBox()
    const cx = dial.x + dial.width / 2, cy = dial.y + dial.height / 2, R = dial.width * 0.39
    const pt = (min) => [cx + Math.sin((min / 60) * 2 * Math.PI) * R, cy - Math.cos((min / 60) * 2 * Math.PI) * R]
    await page.mouse.move(...pt(30)); await page.mouse.down()
    for (let mm = 31; mm <= 47; mm++) await page.mouse.move(...pt(mm))
    await page.screenshot({ path: OUT + scheme + '-3-drag.png', clip: dial })
    await page.mouse.up(); await page.waitForTimeout(300)
    console.log(scheme, 'after drag to 47:', await read())
    await page.locator('.sheet .clock-ampm button', { hasText: 'PM' }).tap(); await page.waitForTimeout(300)
    console.log(scheme, 'after PM:', await read())
    await page.locator('.sheet .clock-box').first().tap(); await page.waitForTimeout(300)
    await page.locator('.sheet .clock-dial').focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300)
    console.log(scheme, 'hour mode + ArrowUp:', await read())
    await page.locator('.sheet .clock').screenshot({ path: OUT + scheme + '-4-final.png' })
    console.log(scheme, 'errors', errors)
    await ctx.close()
  }
  await browser.close()
})()
