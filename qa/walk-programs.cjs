// Program library, programs holding folders, starting Buff Dudes, the program card's phases,
// a fresh install starting empty, and the home customizer. PORT defaults to 3000.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const OUT = __dirname + '/shots-programs/'
const BASE = `http://localhost:${process.env.PORT || 3000}`
require('fs').mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const scheme = process.env.SCHEME || 'dark'
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
  await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
  const shot = async (n, full) => { await page.waitForTimeout(500); await page.screenshot({ path: OUT + scheme + '-' + n + '.png', fullPage: !!full }) }
  const check = (ok, what) => console.log((ok ? 'PASS ' : 'FAIL ') + what)

  await page.goto(BASE + '/#/train')
  await page.waitForSelector('.page-head h1')
  await page.waitForTimeout(1200)
  check(await page.locator('.starter-card').count() === 1, 'fresh install: starter card, no routines')
  check(await page.locator('.routine-card').count() === 0, 'fresh install: no Comeback routines seeded')
  await shot('01-fresh', true)

  await page.locator('.starter-item', { hasText: 'Buff Dudes' }).tap()
  await page.waitForSelector('.catalog-card')
  await shot('02-library', true)
  await page.locator('.catalog-card', { hasText: 'Buff Dudes' }).locator('.btn-primary').tap()
  await page.waitForSelector('.plan-card')
  await page.waitForTimeout(800)
  const title = await page.locator('.plan-title').textContent()
  check(/Day 1/.test(title), 'program card shows Day 1: ' + title)
  check(/Week 1 of 12/.test(await page.locator('.plan-eyebrow').textContent()), 'program card: week 1 of 12')
  await shot('03-following', true)

  await page.locator('.program-group').first().scrollIntoViewIfNeeded()
  check((await page.locator('.program-group').count()) === 1, 'one program group')
  check((await page.locator('.program-body .folder').count()) === 4, 'four phase folders inside')
  check((await page.locator('.folder.current .routine-card').count()) === 3, 'current phase open with 3 routines')
  await shot('04-program-group')

  // change week → phase 2
  await page.locator('.plan-eyebrow').tap()
  await page.locator('.sheet button, .action-sheet button', { hasText: 'Change week' }).first().tap()
  await page.waitForTimeout(400)
  await page.locator('button', { hasText: /^Week 5/ }).first().tap()
  await page.waitForTimeout(700)
  check(/Phase 2/.test(await page.locator('.plan-eyebrow').textContent()), 'week 5 → phase 2')
  check((await page.locator('.folder.current .routine-card').count()) === 4, 'phase 2 has 4 routines')
  await shot('05-phase2', true)

  // folder menu → move a folder? Add Comeback from the library too
  await page.goto(BASE + '/#/programs')
  await page.waitForSelector('.catalog-card')
  await page.locator('.catalog-card', { hasText: 'Dumbbell Comeback' }).locator('.catalog-head').tap()
  await shot('06-comeback-open', true)

  // start a Buff Dudes routine to see the workout
  await page.goto(BASE + '/#/train')
  await page.waitForSelector('.plan-card')
  await page.locator('.plan-card .btn-block').tap()
  await page.waitForSelector('.live')
  await page.waitForTimeout(800)
  await shot('07-live', false)
  await page.goto(BASE + '/#/train')
  await page.waitForTimeout(600)

  // customize home: hide the quote, move routines up
  await page.locator('.customize-home').scrollIntoViewIfNeeded()
  await page.locator('.customize-home').tap()
  await page.waitForSelector('.home-sections')
  await shot('08-customizer')
  await page.locator('.home-sections li', { hasText: 'Quote' }).locator('.toggle').tap()
  await page.locator('.home-sections li', { hasText: 'Routines and programs' }).locator('[aria-label^="Move"][aria-label$="up"]').tap()
  await page.waitForTimeout(400)
  await shot('09-customizer-changed')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  check(await page.locator('.hero-quote, .hq').count() === 0, 'quote hidden')
  await shot('10-home-custom', true)

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
  await browser.close()
})()
