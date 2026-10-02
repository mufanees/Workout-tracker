// Saving to the Claude account in the artifact copy: log things, close the page (browser storage
// gone), reopen in a fresh context and check everything came back, including the workout in progress.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const { installFakeClaude } = require('./fake-claude.cjs')
const URL = process.env.URL || 'http://localhost:4173/'
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const store = new Map()
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
    await installFakeClaude(ctx, { store, sample: async () => ({ text: 'ok' }) })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    await page.goto(URL + '#/train')
    await page.waitForSelector('.today-rings')
    await page.waitForTimeout(1500)
    return { ctx, page, errors }
  }
  // --- first visit
  let { ctx, page, errors } = await open()
  await page.goto(URL + '#/fast')
  await page.locator('.fast-hero .btn-primary', { hasText: 'Start' }).tap()
  await page.waitForTimeout(300)
  await page.goto(URL + '#/train')
  await page.waitForTimeout(400)
  await page.locator('.routine-card').first().locator('button', { hasText: 'Start' }).tap()
  await page.waitForSelector('.live')
  await page.locator('.ex-card').first().locator('input').first().fill('21')
  await page.locator('.ex-card').first().locator('.check').first().tap()
  await page.waitForTimeout(2600) // the workout in progress is saved every 2 s
  await page.goto(URL + '#/settings')
  await page.waitForTimeout(800)
  console.log('status:', await page.locator('.sync-status').innerText())
  const act = [...store.entries()].find(([k]) => k.endsWith('/active'))[1]; console.log('saved set:', JSON.stringify(act.w.exercises[0].sets[0]).slice(0, 120))
  console.log('docs saved:', [...store.keys()].map((k) => k.split('/').pop().split('~')[0]).reduce((a, k) => ((a[k] = (a[k] || 0) + 1), a), {}))
  console.log('errors 1:', errors.join('\n') || 'none')
  await ctx.close() // closes the drawer: this context's IndexedDB is gone
  // --- second visit, fresh browser storage
  ;({ ctx, page, errors } = await open())
  await page.waitForTimeout(1500)
  console.log('workout restored:', await page.locator('.mini-bar, .minibar, .live-mini').count() > 0 || (await page.evaluate(() => !!document.querySelector('[class*=mini]'))))
  await page.goto(URL + '#/live')
  await page.waitForTimeout(800)
  const val = await page.locator('.ex-card').first().locator('input').first().inputValue().catch(() => '')
  const checked = await page.locator('.ex-card').first().locator('.check.on, .check.done, .set-row.done').count()
  console.log('first set weight:', val, '| done sets visible:', checked)
  await page.goto(URL + '#/fast')
  await page.waitForTimeout(600)
  console.log('fast running:', await page.locator('.fast-hero.on').count() === 1)
  await page.screenshot({ path: __dirname + '/shots13-restored.png' })
  console.log('errors 2:', errors.join('\n') || 'none')
  await browser.close()
})()
