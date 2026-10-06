const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const [w, scheme] of [[390, 'dark'], [360, 'light']]) {
    const p = await b.newPage({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme })
    await p.goto('http://localhost:4173/#/train'); await p.waitForTimeout(1500)
    await p.locator('.plan-card').scrollIntoViewIfNeeded()
    await p.locator('.plan-card').screenshot({ path: `/home/user/Workout-tracker/qa/shots-coach/plan-${w}-${scheme}.png` })
    console.log(w, (await p.locator('.plan-card').innerText()).replace(/\n/g, ' | '))
    await p.close()
  }
  await b.close()
})()
