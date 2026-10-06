const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
  const p = await ctx.newPage()
  await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(6000)
  await b.close()
})()
