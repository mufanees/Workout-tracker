// Gooey tab pill (GSAP): frames of a tab switch, the pill under the right tab after, coach drops.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const { installFakeClaude } = require('./fake-claude.cjs')
const URL = process.env.URL || 'http://localhost:4173/'
const OUT = __dirname + '/shots18/'
require('fs').mkdirSync(OUT, { recursive: true })
let release
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  for (const reduced of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: reduced ? 'reduce' : 'no-preference' })
    await installFakeClaude(ctx, { store: new Map(), sample: async (input) => { if (typeof input === 'string') return { text: '{}' }; await new Promise((r) => (release = r)); return { text: 'Nice.' } } })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const tag = reduced ? 'rm-' : ''
    await page.goto(URL + '#/train')
    await page.waitForSelector('.tab-goo')
    await page.waitForTimeout(1200)
    const bar = await page.locator('.tabbar').boundingBox()
    const clip = { x: bar.x - 4, y: bar.y - 30, width: bar.width + 8, height: bar.height + 34 }
    const check = async (name) => page.evaluate((name) => {
      const on = document.querySelector('.tab.on').getBoundingClientRect()
      const head = document.querySelector('.tg-head').getBoundingClientRect()
      return { name, dx: Math.round(head.left - on.left), dw: Math.round(head.width - on.width) }
    }, name)
    console.log(tag, JSON.stringify(await check('train')))
    await page.locator('.tab').nth(4).tap()
    if (!reduced) for (const t of [60, 140, 240, 380, 600]) { await page.waitForTimeout(t === 60 ? 60 : 80 + (t > 240 ? 60 : 0) + (t > 380 ? 80 : 0)); await page.screenshot({ path: OUT + tag + 'tab-' + t + '.png', clip }) }
    await page.waitForTimeout(1200)
    console.log(tag, JSON.stringify(await check('coach')))
    await page.screenshot({ path: OUT + tag + 'tab-end.png', clip })
    await page.locator('textarea').first().fill('How am I doing?')
    await page.keyboard.press('Enter')
    for (const t of [300, 650]) { await page.waitForTimeout(t === 300 ? 300 : 350); const d = await page.locator('.goo-dots').boundingBox(); if (d) await page.screenshot({ path: OUT + tag + 'dots-' + t + '.png', clip: { x: d.x - 20, y: d.y - 14, width: d.width + 40, height: d.height + 20 } }) }
    release && release()
    await page.waitForTimeout(400)
    await page.locator('.tab').nth(1).tap()
    await page.waitForTimeout(1300)
    console.log(tag, JSON.stringify(await check('log')))
    await page.setViewportSize({ width: 430, height: 900 }); await page.waitForTimeout(400)
    console.log(tag, JSON.stringify(await check('after resize')))
    console.log(tag, 'errors', errors)
    await ctx.close()
  }
  await browser.close()
})()
