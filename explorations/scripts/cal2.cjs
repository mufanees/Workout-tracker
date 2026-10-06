const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const scheme of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme })
    await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const p = await ctx.newPage()
    await p.goto('http://localhost:3000/#/history?view=calendar'); await p.waitForTimeout(2500)
    await p.locator('.cal-month').nth(1).screenshot({ path: `/home/user/Workout-tracker/qa/shots-coach/cal-sep-${scheme}.png` })
    await ctx.close()
  }
  await b.close()
})()
