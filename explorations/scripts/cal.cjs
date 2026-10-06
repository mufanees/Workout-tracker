const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const [w, scheme] of [[390, 'dark'], [360, 'light']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme })
    await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const p = await ctx.newPage()
    const errs = []; p.on('pageerror', (e) => errs.push(e.message))
    await p.goto('http://localhost:3000/#/history?view=calendar'); await p.waitForTimeout(2500)
    const counts = await p.evaluate(() => ({ strength: document.querySelectorAll('.cal-ring.strength').length, cardio: document.querySelectorAll('.cal-ring.cardio').length, both: document.querySelectorAll('.cal-ring.both').length, rings: document.querySelectorAll('.cal-ring svg').length }))
    console.log(w, scheme, JSON.stringify(counts), 'errors', errs.length)
    await p.screenshot({ path: `/home/user/Workout-tracker/qa/shots-coach/cal-${w}-${scheme}.png` })
    await ctx.close()
  }
  await b.close()
})()
