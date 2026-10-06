const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const { installFakeClaude } = require('/home/user/Workout-tracker/qa/fake-claude.cjs')
const S = process.argv[2]
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark', recordVideo: { dir: S + '/vid', size: { width: 390, height: 844 } } })
  await installFakeClaude(ctx, { store: new Map(), sample: async () => ({ text: '{}' }) })
  const p = await ctx.newPage()
  await p.goto('http://localhost:4173/#/train'); await p.waitForTimeout(2000)
  for (const i of [4, 1, 3, 0]) { await p.locator('.tab').nth(i).tap(); await p.waitForTimeout(1200) }
  await ctx.close(); await b.close()
})()
