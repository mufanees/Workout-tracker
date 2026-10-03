// Goo settings, accent colour, gooey toggles, sheet jelly, and the tab pill resting exactly
// after rapid switches.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const { installFakeClaude } = require('./fake-claude.cjs')
const URL = process.env.URL || 'http://localhost:4173/'
const OUT = __dirname + '/shots21/'
require('fs').mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await installFakeClaude(ctx, { store: new Map(), sample: async () => ({ text: '{}' }) })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL + '#/train')
  await page.waitForSelector('.tab-goo .gt-head')
  await page.waitForTimeout(1200)
  // rapid switches, then rest
  for (const i of [1, 4, 2, 0]) { await page.locator('.tab').nth(i).tap(); await page.waitForTimeout(140) }
  await page.waitForTimeout(2600)
  const rest = await page.evaluate(() => {
    const on = document.querySelector('.tab.on').getBoundingClientRect()
    const head = document.querySelector('.tab-goo .gt-head')
    const h = head.getBoundingClientRect()
    const extras = [...document.querySelectorAll('.tab-goo .gt-blob, .tab-goo .gt-origin')].filter((e) => getComputedStyle(e).visibility !== 'hidden')
    const inside = extras.every((e) => { const r = e.getBoundingClientRect(); return r.left >= h.left - 0.5 && r.right <= h.right + 0.5 && r.top >= h.top - 0.5 && r.bottom <= h.bottom + 0.5 })
    return { dx: Math.round(h.left - on.left), dw: Math.round(h.width - on.width), radius: getComputedStyle(head).borderRadius, visibleExtras: extras.length, allInside: inside }
  })
  console.log('tab rest after rapid switches:', JSON.stringify(rest))
  await page.locator('.tabbar').screenshot({ path: OUT + 'tab-rest.png' })
  // settings
  await page.goto(URL + '#/settings')
  await page.waitForTimeout(1000)
  const g = page.locator('.goo-settings')
  await g.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: OUT + 'settings-goo.png', fullPage: false })
  // toggle goo: the preview switch
  const tg = page.locator('.goo-preview .toggle')
  await tg.tap(); await page.waitForTimeout(2000)
  const knob = await page.evaluate(() => { const t = document.querySelector('.goo-preview .toggle'); const h = t.querySelector('.gt-head').getBoundingClientRect(); const r = t.getBoundingClientRect(); return [Math.round(h.left - r.left), Math.round(h.width), t.classList.contains('on')] })
  console.log('preview toggle off -> knob x,w,on:', knob)
  // accent: Sky
  await page.locator('.swatch[aria-label="Sky"]').scrollIntoViewIfNeeded()
  await page.locator('.swatch[aria-label="Sky"]').tap(); await page.waitForTimeout(1500)
  console.log('accent now:', await page.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), getComputedStyle(document.documentElement).getPropertyValue('--accent-ink').trim(), getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim()]))
  await page.locator('.accent-setting').screenshot({ path: OUT + 'accent.png' })
  // goo off
  await page.locator('.goo-settings > .setting .toggle').first().tap(); await page.waitForTimeout(500)
  console.log('goo-off class:', await page.evaluate(() => document.documentElement.classList.contains('goo-off')))
  await page.locator('.goo-settings > .setting .toggle').first().tap(); await page.waitForTimeout(500)
  await page.goto(URL + '#/train'); await page.waitForTimeout(1500)
  await page.screenshot({ path: OUT + 'train-sky.png' })
  console.log('errors', errors)
  await browser.close()
})()
