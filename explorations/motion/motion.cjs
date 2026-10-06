const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await p.goto('http://localhost:4173/#/train')
  await p.waitForTimeout(250)
  await p.screenshot({ path: '/home/user/Workout-tracker/qa/motion-00-boot.png' })
  await p.waitForTimeout(1600)
  console.log('VT supported:', await p.evaluate(() => 'startViewTransition' in document))
  const shotBar = async (n) => p.locator('.tabbar').screenshot({ path: `/home/user/Workout-tracker/qa/motion-tab-${n}.png` }).catch(() => p.screenshot({ path: `/home/user/Workout-tracker/qa/motion-tab-${n}.png`, clip: { x: 0, y: 760, width: 390, height: 84 } }))
  await p.locator('.tab').nth(3).click()
  for (const t of [40, 120, 200, 400]) { await p.waitForTimeout(t === 40 ? 40 : 80); await p.screenshot({ path: `/home/user/Workout-tracker/qa/motion-tab-${t}.png`, clip: { x: 0, y: 740, width: 390, height: 104 } }) }
  await p.waitForTimeout(400)
  // a deeper screen
  await p.locator('.fast-card .eyebrow').click()
  await p.waitForTimeout(120)
  await p.screenshot({ path: '/home/user/Workout-tracker/qa/motion-forward-mid.png' })
  await p.waitForTimeout(500)
  console.log('on fast:', await p.locator('.fast-screen').count(), '| errors:', errs.join(' | ') || 'none')
  await b.close()
})()
