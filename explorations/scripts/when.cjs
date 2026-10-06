const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const O = '/home/user/Workout-tracker/qa/shots-when/'
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const w of [390, 360]) {
  const p = await b.newPage({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark' })
  const errs = []; p.on('pageerror', e => errs.push(e.message))
  await p.goto('http://localhost:4173/#/fast'); await p.waitForTimeout(1500)
  await p.getByText('Add past fast').click(); await p.waitForTimeout(600)
  await p.screenshot({ path: O + w + '-1-add.png' })
  await p.getByRole('radio', { name: 'Yesterday' }).first().click()
  await p.getByRole('button', { name: '1 hour earlier' }).first().click()
  await p.getByRole('button', { name: '15 minutes later' }).first().click()
  await p.waitForTimeout(300)
  await p.getByRole('button', { name: /Ended/ }).click(); await p.waitForTimeout(500)
  await p.getByRole('button', { name: '18h' }).click(); await p.waitForTimeout(300)
  await p.screenshot({ path: O + w + '-2-ended.png' })
  console.log(w, 'head:', await p.locator('.when-head b').allInnerTexts(), 'len:', await p.locator('.fe-summary b').innerText())
  await p.getByRole('button', { name: 'Add fast' }).click(); await p.waitForTimeout(800)
  console.log(w, 'rows:', (await p.locator('.fast-row').allInnerTexts()).slice(0,2))
  // start-earlier sheet
  await p.getByText('Finished eating earlier?').click(); await p.waitForTimeout(600)
  console.log(w, 'start sheet disabled:', await p.locator('.when-step:disabled').count())
  await p.screenshot({ path: O + w + '-3-start.png' })
  console.log(w, 'errors', errs)
  await p.close()
  }
  await b.close()
})()
