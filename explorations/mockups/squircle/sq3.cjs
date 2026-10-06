const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const SEL = `.card, .goal-card, .plan-card, .today-rings, .hero-quote, .workout-card, .routine-card, .win-card, .week-card,
.ex-card, .ss-group, .goal-stats > div, .checkin, .cel-hero, .goal-hero, .when-row, .sheet, .modal`
const V = {
  now: '',
  k2: `:root{--radius:34px;--r-2xl:44px;--r-lg:24px} ${SEL}{corner-shape:superellipse(2)}`,
  k3: `:root{--radius:44px;--r-2xl:54px;--r-lg:30px} ${SEL}{corner-shape:superellipse(3)}`,
  k4: `:root{--radius:54px;--r-2xl:64px;--r-lg:36px} ${SEL}{corner-shape:superellipse(4)}`,
}
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const [k, css] of Object.entries(V)) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark' })
    await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const p = await ctx.newPage()
    await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(2200)
    if (css) await p.addStyleTag({ content: css })
    await p.waitForTimeout(300)
    const box = await p.locator('.checkin').boundingBox()
    await p.screenshot({ path: `${process.argv[2]}/sq3-zoom-${k}.png`, clip: { x: box.x - 6, y: box.y - 6, width: 130, height: 95 } })
    await p.screenshot({ path: `${process.argv[2]}/sq3-train-${k}.png` })
    await ctx.close()
  }
  await b.close()
})()
