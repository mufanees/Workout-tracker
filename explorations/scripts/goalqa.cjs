const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const O = '/home/user/Workout-tracker/qa/shots-goal/'
require('fs').mkdirSync(O, { recursive: true })
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const scheme of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: scheme })
    await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const p = await ctx.newPage()
    const errs = []; p.on('pageerror', (e) => errs.push(e.message))
    await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(2500)
    if (scheme === 'dark') {
      await p.locator('.goal-card').screenshot({ path: O + 'dark-0-empty-card.png' })
      await p.locator('.goal-card').click(); await p.waitForTimeout(3500)
      console.log('coach url', p.url())
      await p.screenshot({ path: O + 'dark-1-coach-proposal.png' })
      const approve = p.getByRole('button', { name: /Approve/ }).first()
      console.log('proposal:', (await p.locator('.proposal, .prop-card').first().innerText().catch(() => '?')).replace(/\n/g, ' | '))
      await approve.click(); await p.waitForTimeout(1200)
      await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(1500)
    }
    await p.locator('.goal-card').screenshot({ path: O + scheme + '-2-card.png' })
    console.log(scheme, 'card:', (await p.locator('.goal-card').innerText()).replace(/\n/g, ' | '))
    await p.locator('.goal-card').click(); await p.waitForTimeout(1500)
    console.log(scheme, 'url', p.url())
    await p.screenshot({ path: O + scheme + '-3-detail.png', fullPage: true })
    console.log(scheme, 'errors', errs)
    await ctx.close()
  }
  await b.close()
})()
