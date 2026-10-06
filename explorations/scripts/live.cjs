const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const scheme of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
    await p.goto('http://localhost:4173/#/train'); await p.waitForTimeout(1500)
    await p.locator('.routine-card').first().locator('button', { hasText: 'Start' }).tap()
    await p.waitForSelector('.live'); await p.waitForTimeout(500)
    await p.locator('.ss-group').first().scrollIntoViewIfNeeded()
    await p.waitForTimeout(300)
    await p.screenshot({ path: `/home/user/Workout-tracker/qa/shots-live-${scheme}.png` })
    if (scheme === 'dark') await p.screenshot({ path: `/home/user/Workout-tracker/qa/shots-live-full.png`, fullPage: true })
    console.log(scheme, 'groups:', await p.locator('.ss-group').count(), '| pace:', await p.locator('.pace').innerText().catch(() => 'none'), '|', errs.join(';') || 'ok')
    await ctx.close()
  }
  await b.close()
})()
