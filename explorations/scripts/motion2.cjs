const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
  await p.goto('http://localhost:4173/#/train'); await p.waitForTimeout(1800)
  const probe = () => p.evaluate(() => new Promise((res) => {
    const seen = new Set()
    const t0 = performance.now()
    const tick = () => {
      for (const a of document.getAnimations()) seen.add(`${a.effect?.pseudoElement || a.effect?.target?.className || '?'} ${Math.round(a.effect?.getTiming?.().duration || 0)}ms`)
      if (performance.now() - t0 < 500) requestAnimationFrame(tick); else res([...seen])
    }
    requestAnimationFrame(tick)
  }))
  const [anims] = await Promise.all([probe(), p.locator('.tab').nth(1).click()]); await p.locator('.tab').nth(0).click(); await p.waitForTimeout(600)
  console.log('tab switch animations:\n ' + anims.join('\n '))
  const [anims2] = await Promise.all([probe(), p.locator('.routine-main').first().click()])
  console.log('forward animations:\n ' + anims2.filter((a) => /screen/.test(a)).join('\n '), '| nav =', await p.evaluate(() => document.documentElement.dataset.nav))
  await b.close()
})()
