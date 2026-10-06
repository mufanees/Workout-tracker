const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const SQ = `
:root { --radius: 34px; --r-2xl: 44px; --r-lg: 24px; }
.card, .goal-card, .plan-card, .today-rings, .hero-quote, .workout-card, .routine-card, .win-card, .week-card,
.ex-card, .ss-group, .goal-stats > div, .checkin, .cel-hero, .goal-hero, .when-row, .sheet, .modal { corner-shape: squircle; }`
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const v of ['before', 'after']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark' })
    await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const p = await ctx.newPage()
    await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(2200)
    if (v === 'after') await p.addStyleTag({ content: SQ })
    await p.waitForTimeout(300)
    await p.screenshot({ path: `${process.argv[2]}/sq2-train-${v}.png` })
    const box = await p.locator('.checkin').boundingBox()
    await p.screenshot({ path: `${process.argv[2]}/sq2-zoom-${v}.png`, clip: { x: box.x - 6, y: box.y - 6, width: 150, height: 110 } })
    await p.locator('.plan-card').scrollIntoViewIfNeeded(); await p.waitForTimeout(300)
    await p.screenshot({ path: `${process.argv[2]}/sq2-plan-${v}.png` })
    await ctx.close()
  }
  await b.close()
})()
