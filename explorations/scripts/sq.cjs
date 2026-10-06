const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const SQ = `
:root { --radius: 34px; --r-lg: 24px; --r-xl: 34px; --r-2xl: 42px; --r-md: 16px; }
.card, .goal-card, .plan-card, .today-rings, .hero-quote, .workout-card, .routine-card, .win-card, .week-card,
.ex-card, .ss-group, .goal-stats > div, .checkin, .tr-day, .stat-grid > *, .chip, .btn, .tabbar, .tab-pill, .sheet, .modal,
.num, .check, .set-row, .effort-opt, .when-row, .cel-hero, .goal-hero, [class*="card"] {
  corner-shape: squircle;
}`
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const [name, path] of [['train', '/#/train'], ['log', '/#/history']]) {
    for (const v of ['before', 'after']) {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
      await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
      const p = await ctx.newPage()
      await p.goto('http://localhost:3000' + path); await p.waitForTimeout(2200)
      if (v === 'after') await p.addStyleTag({ content: SQ })
      await p.waitForTimeout(300)
      await p.screenshot({ path: `${process.argv[2]}/sq-${name}-${v}.png` })
      await ctx.close()
    }
  }
  await b.close()
})()
