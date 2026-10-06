const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  await p.goto('http://localhost:4173/#/train'); await p.waitForTimeout(1500)
  const n = Number((await p.locator('.hq-count').innerText()).split('/')[1])
  let best = null
  for (let k = 0; k < n; k++) {
    const t = await p.locator('.hq-stack > .hq-text:not(.hq-sizer)').innerText()
    if (!best || t.length < best) { best = t.length; await p.waitForTimeout(500); await p.locator('.hero-quote').screenshot({ path: '/home/user/Workout-tracker/qa/shots-when/quote-short.png' }) }
    await p.locator('.hero-quote').click(); await p.waitForTimeout(80)
  }
  await b.close()
})()
