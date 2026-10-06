// Full-page screenshots of every main screen, dark and light, at 390px and 360px.
const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const OUT = '/home/user/Workout-tracker/qa/ds/'
require('fs').mkdirSync(OUT, { recursive: true })
const routes = ['train', 'history', 'history?view=calendar', 'exercises', 'body', 'fast', 'coach', 'coach/memory', 'settings']
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const [w, scheme] of [[390, 'dark'], [360, 'light']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
    await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
    await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(2200)
    for (const r of routes) {
      await p.goto('http://localhost:3000/#/' + r); await p.waitForTimeout(700)
      const wide = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      if (wide) errs.push('horizontal scroll on ' + r)
      await p.screenshot({ path: `${OUT}${w}-${r.replace(/[/?=]/g, '_')}.png`, fullPage: true })
    }
    // the workout screen
    await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(500)
    await p.locator('.routine-card').first().locator('button', { hasText: 'Start' }).click()
    await p.waitForSelector('.live'); await p.waitForTimeout(600)
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) errs.push('horizontal scroll on live')
    await p.screenshot({ path: `${OUT}${w}-live.png`, fullPage: true })
    await p.locator('.live-head .icon-btn').first().click().catch(() => {})
    console.log(w, scheme, errs.join(' | ') || 'no errors')
    await ctx.close()
  }
  await b.close()
})()
