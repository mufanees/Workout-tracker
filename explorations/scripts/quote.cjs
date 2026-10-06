const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const w of [390, 360]) {
    const p = await b.newPage({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
    const errs = []; p.on('pageerror', (e) => errs.push(e.message))
    await p.goto('http://localhost:4173/#/train'); await p.waitForTimeout(1500)
    const hs = new Set(), lens = []
    const n = Number((await p.locator('.hq-count').innerText()).split('/')[1])
    for (let k = 0; k < n; k++) {
      hs.add(Math.round((await p.locator('.hero-quote').boundingBox()).height))
      lens.push((await p.locator('.hq-stack > .hq-text:not(.hq-sizer)').innerText()).length)
      await p.locator('.hero-quote').click(); await p.waitForTimeout(80)
    }
    console.log(w, 'quotes', n, 'heights seen:', [...hs].join(','), 'text lengths', Math.min(...lens) + '–' + Math.max(...lens), 'errors', errs.length)
    await p.locator('.hero-quote').screenshot({ path: `/home/user/Workout-tracker/qa/shots-when/quote-${w}.png` })
    await p.close()
  }
  await b.close()
})()
