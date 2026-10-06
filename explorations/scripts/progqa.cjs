const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const O = '/home/user/Workout-tracker/qa/shots-coach/'
const log = (...a) => console.log(...a)
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark' })
  await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
  const p = await ctx.newPage()
  const errs = []; p.on('pageerror', (e) => errs.push(e.message))

  // 1. add library material by hand
  await p.goto('http://localhost:3000/#/coach/memory'); await p.waitForTimeout(2000)
  await p.getByRole('button', { name: /Add material/ }).click()
  await p.locator('.lib-add input').fill('Minimalist 3-day split notes')
  await p.locator('.lib-add textarea').fill('Three full-body days. Two hard sets per exercise. Drop sets on isolation. Supersets of push and pull.\n\nDeload every 6 weeks.')
  await p.getByRole('button', { name: 'Add to library' }).click(); await p.waitForTimeout(600)
  log('library items:', await p.locator('.lib-item').count())
  await p.locator('#library').scrollIntoViewIfNeeded()
  await p.screenshot({ path: O + 'lib-1.png' })

  // 2. ask the coach to blend the plan
  await p.goto('http://localhost:3000/#/coach'); await p.waitForTimeout(1500)
  await p.locator('textarea').last().fill('Blend my Comeback plan into a minimalist 3-day, 30-minute program')
  await p.locator('textarea').last().press('Enter'); await p.waitForTimeout(7000)
  await p.screenshot({ path: O + 'prog-1-proposal.png', fullPage: true })
  log('proposal:', (await p.locator('.proposal, .prop-card').last().innerText().catch(() => '?')).replace(/\n/g, ' | ').slice(0, 400))
  await p.getByRole('button', { name: /Approve/ }).last().click(); await p.waitForTimeout(1500)

  // 3. train shows the program
  await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(1500)
  log('program card:', (await p.locator('.plan-card').innerText()).replace(/\n/g, ' | '))
  await p.locator('.plan-card').screenshot({ path: O + 'prog-2-card.png' })
  await p.locator('.plan-card .btn').click(); await p.waitForTimeout(1200)
  log('live:', p.url(), (await p.locator('.ex-card .ex-name, .ex-card h3, .ex-title').allInnerTexts().catch(() => [])).slice(0, 5))
  await p.screenshot({ path: O + 'prog-3-live.png' })
  // discard the workout
  await p.goto('http://localhost:3000/#/train'); await p.waitForTimeout(800)

  // 4. save to library from chat
  await p.goto('http://localhost:3000/#/coach'); await p.waitForTimeout(1200)
  await p.locator('textarea').last().fill('save this to my library: bands anchored high work for pulldowns')
  await p.locator('textarea').last().press('Enter'); await p.waitForTimeout(4000)
  await p.goto('http://localhost:3000/#/coach/memory'); await p.waitForTimeout(1500)
  log('library titles:', await p.locator('.lib-item summary b').allInnerTexts())
  log('errors', errs)
  await b.close()
})()
