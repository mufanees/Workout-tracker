const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const scheme of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: scheme })
    await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const p = await ctx.newPage()
    await p.goto('http://localhost:3000/#/history?view=calendar'); await p.waitForTimeout(2500)
    const box = await p.locator('.cal-month').first().locator('.cal-grid').boundingBox()
    await p.screenshot({ path: `/home/user/Workout-tracker/qa/shots-coach/cal-zoom-${scheme}.png`, clip: { x: box.x, y: box.y, width: box.width, height: 110 } })
    await ctx.close()
  }
  await b.close()
})()
