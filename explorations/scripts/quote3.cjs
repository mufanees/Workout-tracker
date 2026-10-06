const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  await p.goto('http://localhost:4173/#/train'); await p.waitForTimeout(1500)
  const n = Number((await p.locator('.hq-count').innerText()).split('/')[1]); const seen = new Set(); let shot = false
  for (let k = 0; k < n; k++) {
    const a = await p.locator('.hq-author').innerText(); seen.add(a || '(none)')
    if (a && !shot) { await p.waitForTimeout(500); await p.locator('.hero-quote').screenshot({ path: '/home/user/Workout-tracker/qa/shots-when/quote-author.png' }); shot = true }
    await p.locator('.hero-quote').click(); await p.waitForTimeout(60)
  }
  console.log('footer labels seen:', [...seen].join(' | '))
  await b.close()
})()
