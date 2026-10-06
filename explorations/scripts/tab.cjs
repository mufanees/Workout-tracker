const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const w of [390, 360]) {
    const p = await b.newPage({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
    await p.goto('http://localhost:4173/#/train'); await p.waitForTimeout(1200)
    await p.locator('.tab').nth(1).click(); await p.waitForTimeout(1000)
    console.log(w, p.url(), (await p.locator('h1').first().innerText()), '| tabs:', (await p.locator('.tabbar').innerText()).replace(/\n/g, ' '))
    await p.locator('.tabbar').screenshot({ path: `/home/user/Workout-tracker/qa/shots-coach/tab-log-${w}.png` })
    await p.close()
  }
  await b.close()
})()
