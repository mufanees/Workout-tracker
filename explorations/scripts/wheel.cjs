const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const O = '/home/user/Workout-tracker/qa/shots-when/'
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const w of [390, 360]) {
    const p = await b.newPage({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark' })
    const errs = []; p.on('pageerror', (e) => errs.push(e.message))
    await p.goto('http://localhost:4173/#/fast'); await p.waitForTimeout(1500)
    await p.getByText('Add past fast').click(); await p.waitForTimeout(700)
    await p.getByRole('radio', { name: 'Yesterday' }).first().click(); await p.waitForTimeout(300)
    const wheel = (l) => p.locator(`.when-row.open .wheel[aria-label="${l}"]`)
    // flick: scroll partway between rows, expect snap to a row
    await wheel('Hour').evaluate((el) => el.scrollBy({ top: 56 * 3 + 20 }))
    await p.waitForTimeout(600)
    console.log(w, 'after hour flick:', await p.locator('.when-head b').first().innerText(), 'scrollTop', await wheel('Hour').evaluate((el) => el.scrollTop))
    // tap a row
    await wheel('Minute').locator('.wheel-row', { hasText: '30' }).click(); await p.waitForTimeout(700)
    await wheel('AM or PM').locator('.wheel-row', { hasText: 'PM' }).click(); await p.waitForTimeout(700)
    console.log(w, 'after taps:', await p.locator('.when-head b').first().innerText())
    await p.screenshot({ path: O + w + '-wheel-start.png' })
    // clamp: Today + late hour should snap back to now
    await p.getByRole('button', { name: /Ended/ }).click(); await p.waitForTimeout(500)
    await wheel('Hour').locator('.wheel-row', { hasText: /^11$/ }).click(); await p.waitForTimeout(400)
    await wheel('AM or PM').locator('.wheel-row', { hasText: 'PM' }).click(); await p.waitForTimeout(900)
    console.log(w, 'wheel hour row:', await wheel('Hour').locator('.wheel-row.on').innerText(), 'ampm:', await wheel('AM or PM').locator('.wheel-row.on').innerText())
    console.log(w, 'ended (clamped to now?):', await p.locator('.when-head b').nth(1).innerText(), new Date().toLocaleTimeString())
    await p.screenshot({ path: O + w + '-wheel-end.png' })
    console.log(w, 'errors', errs)
    await p.close()
  }
  await b.close()
})()
