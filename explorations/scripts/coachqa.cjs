const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const O = '/home/user/Workout-tracker/qa/shots-coach/'
require('fs').mkdirSync(O, { recursive: true })
const log = (...a) => console.log(...a)
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark' })
  await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
  const p = await ctx.newPage()
  const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(2500)

  // 1. check-in
  await p.locator('.checkin').screenshot({ path: O + '1-checkin.png' })
  for (const w of ['Poor', 'Low', 'High']) {
    const row = w === 'Poor' ? 'Sleep' : w === 'Low' ? 'Energy' : 'Stress'
    await p.getByRole('radiogroup', { name: row }).getByRole('radio', { name: w }).click(); await p.waitForTimeout(250)
  }
  log('check-in card gone:', (await p.locator('.checkin').count()) === 0)

  // 2. a workout with the effort tap
  await p.locator('.routine-card').first().locator('button', { hasText: 'Start' }).click()
  await p.waitForSelector('.live'); await p.waitForTimeout(800)
  const card = p.locator('.ex-card').first()
  const checks = card.locator('.set-row:not(.head) .check, .check')
  const n = await card.locator('.check').count()
  for (let i = 0; i < n; i++) { await card.locator('.check').nth(i).click(); await p.waitForTimeout(150) }
  await p.waitForTimeout(400)
  log('effort row shown:', await card.locator('.effort-row').count())
  await card.locator('.effort-row').scrollIntoViewIfNeeded()
  await card.locator('.effort-opt', { hasText: 'Easy' }).click(); await p.waitForTimeout(300)
  await card.screenshot({ path: O + '2-effort.png' })
  await p.locator('.live-head .btn-primary').click(); await p.waitForTimeout(500)
  const sheetBtn = p.locator('.sheet-foot .btn-primary'); if (await sheetBtn.count()) await sheetBtn.click()
  await p.waitForTimeout(2500)

  // 3. coach proposes a block, approve
  await p.goto('http://localhost:3000/#/coach'); await p.waitForTimeout(1200)
  await p.locator('textarea').last().fill('Plan a training block toward my 100 kg goal')
  await p.locator('textarea').last().press('Enter'); await p.waitForTimeout(6000)
  await p.screenshot({ path: O + '3-block-proposal.png' })
  log('proposal:', (await p.locator('.proposal, .prop-card').last().innerText().catch(() => '?')).replace(/\n/g, ' | '))
  await p.getByRole('button', { name: /Approve/ }).last().click(); await p.waitForTimeout(1200)

  // 4. train shows the block; block page
  await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(1500)
  log('block card:', (await p.locator('.block-card').innerText()).replace(/\n/g, ' | '))
  await p.locator('.block-card').screenshot({ path: O + '4-block-card.png' })
  await p.locator('.block-card').click(); await p.waitForTimeout(1200)
  await p.screenshot({ path: O + '5-block-page.png', fullPage: true })

  // 5. ask an everyday question so the log has the newest context
  await p.goto('http://localhost:3000/#/coach'); await p.waitForTimeout(1200)
  await p.locator('textarea').last().fill('Am I recovering well?')
  await p.locator('textarea').last().press('Enter'); await p.waitForTimeout(4000)
  log('errors', errs)
  await b.close()
})()
