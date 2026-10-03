// Goo layer: lava in the plan card, splash on set tick, coach typing dots, tab pill, reduced motion.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const { installFakeClaude } = require('./fake-claude.cjs')
const URL = process.env.URL || 'http://localhost:4173/'
const OUT = __dirname + '/shots15/'
require('fs').mkdirSync(OUT, { recursive: true })
let release
const sample = async (input) => {
  if (typeof input === 'string') return { text: '{}' }
  await new Promise((r) => (release = r))
  return { text: 'Nice work.' }
}
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  for (const reduced of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: reduced ? 'reduce' : 'no-preference' })
    await installFakeClaude(ctx, { store: new Map(), sample })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    const p = (n) => OUT + (reduced ? 'rm-' : '') + n + '.png'
    await page.goto(URL + '#/train')
    await page.waitForSelector('.today-rings')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: p('01-train') })
    const lava = await page.evaluate(() => {
      const l = document.querySelector('.lava'); if (!l) return null
      const cs = getComputedStyle(l); const r = l.getBoundingClientRect(); const c = l.parentElement.getBoundingClientRect()
      return { pos: cs.position, z: cs.zIndex, pe: cs.pointerEvents, inside: r.top >= c.top - 1 && r.bottom <= c.bottom + 1, anim: getComputedStyle(l.firstElementChild).animationName, radius: getComputedStyle(l.parentElement).borderRadius, shape: getComputedStyle(l.parentElement).cornerShape }
    })
    console.log(reduced ? '[reduced]' : '[motion]', 'lava', JSON.stringify(lava))
    // start a workout and tick a set
    const card = page.locator('.routine-card').first()
    await card.locator('button', { hasText: 'Start' }).tap()
    await page.waitForSelector('.live')
    const ex = page.locator('.ex-card').first()
    await ex.locator('input').nth(0).fill('16')
    await ex.locator('input').nth(1).fill('10')
    await ex.scrollIntoViewIfNeeded()
    await ex.locator('.check').first().tap()
    for (const t of [60, 220, 480]) { await page.waitForTimeout(t === 60 ? 60 : t - (t === 220 ? 60 : 220)); await page.screenshot({ path: p('02-splash-' + t) }) }
    const splashLeft = await page.evaluate(() => document.querySelectorAll('.goo-splash').length)
    await page.waitForTimeout(800)
    const splashGone = await page.evaluate(() => document.querySelectorAll('.goo-splash').length)
    console.log('splash nodes mid/after', splashLeft, splashGone)
    // can still tap the next check (nothing blocking)
    await ex.locator('.check').nth(1).tap()
    await page.waitForTimeout(300)
    console.log('second set done:', await ex.locator('.check.on').count())
    await page.goBack()
    await page.waitForTimeout(600)
    // coach dots
    await page.goto(URL + '#/coach')
    await page.waitForTimeout(800)
    const ta = page.locator('textarea').first()
    await ta.fill('How am I doing?')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    await page.screenshot({ path: p('03-coach-dots') })
    console.log('dots:', await page.locator('.goo-dots').count())
    release && release()
    await page.waitForTimeout(500)
    // tab switch mid-frame
    await page.locator('.tab', { hasText: 'Log' }).tap()
    await page.waitForTimeout(150)
    await page.screenshot({ path: p('04-tab-150') })
    await page.waitForTimeout(600)
    await page.screenshot({ path: p('05-log') })
    console.log('errors', errors)
    await ctx.close()
  }
  await browser.close()
})()
