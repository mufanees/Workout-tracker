// Time budget and total weights: the 25-minute Buff Dudes from Train → Programs, KG / TOTAL headers
// (bent-over row typed 12 total → stored 6), the routine editor's Fit to budget (and undo), the
// over-budget Fit it on the coach strip at the start, Settings budget and the weight view. Run on a fresh DATA_DIR:
//   PORT=3810 node qa/walk-budget.cjs   (WIDTH=360 for a small phone)
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const OUT = __dirname + '/shots-budget/'
const BASE = `http://localhost:${process.env.PORT || 3000}`
const W = Number(process.env.WIDTH || 390)
require('fs').mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const scheme = process.env.SCHEME || 'dark'
  const ctx = await browser.newContext({ viewport: { width: W, height: W === 390 ? 844 : 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
  await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()))
  const tag = `${W}-${scheme}-`
  const shot = async (n, full) => {
    await page.waitForTimeout(450)
    await page.screenshot({ path: OUT + tag + n + '.png', fullPage: !!full })
  }
  let failed = 0
  // Start opens the target-time sheet: keep the routine's budget, fitting off, so the plan is as written
  const throughStartSheet = async () => {
    const sh = page.locator('.start-sheet')
    try {
      await sh.waitFor({ timeout: 3000 })
    } catch {
      return
    }
    const t = page.locator('.start-toggle [role="switch"]')
    if ((await t.count()) && (await t.first().getAttribute('aria-checked')) === 'true') await t.first().tap()
    await page.locator('.sheet .btn-primary', { hasText: 'Start ·' }).tap()
  }
  const check = (ok, what) => {
    if (!ok) failed++
    console.log((ok ? 'PASS ' : 'FAIL ') + what)
  }
  const active = () =>
    page.evaluate(
      () =>
        new Promise((res) => {
          const r = indexedDB.open('reps')
          r.onsuccess = () => {
            const g = r.result.transaction('meta').objectStore('meta').get('active')
            g.onsuccess = () => res(g.result || null)
          }
        }),
    )

  // 1. the library card: estimate vs the budget
  await page.goto(BASE + '/#/programs')
  await page.waitForSelector('.catalog-card')
  await page.waitForTimeout(1200)
  const card25 = page.locator('.catalog-card', { hasText: 'Buff Dudes 12 Week · 25 min' })
  const cardOrig = page.locator('.catalog-card').filter({ has: page.locator('.catalog-title b', { hasText: /^Buff Dudes 12 Week$/ }) })
  const t25 = (await card25.locator('.catalog-time').textContent()) || ''
  check(/fits your 25 min/.test(t25), 'Buff Dudes 25 card: ' + t25.trim())
  check(/over your 25 min/.test((await cardOrig.locator('.catalog-time').textContent()) || ''), 'original card: over the budget')
  await card25.scrollIntoViewIfNeeded()
  await card25.locator('.catalog-head').tap()
  await page.waitForTimeout(300)
  await card25.screenshot({ path: OUT + tag + '01-program-card.png' })

  // 2. start it
  await card25.locator('.btn-primary').tap()
  await page.waitForSelector('.plan-card')
  await page.waitForTimeout(900)
  check(/Day 1/.test(await page.locator('.plan-title').textContent()), 'Train follows it: Day 1')
  await shot('02-train', false)

  // 3. today's workout: KG over TOTAL, bent-over row 12 total → 6 stored
  await page.locator('.plan-card .btn-block').tap()
  await throughStartSheet()
  await page.waitForSelector('.live')
  await page.waitForTimeout(1500)
  const heads = await page.locator('.load-head small').allTextContents()
  check(heads.length >= 3 && heads.every((h) => /total/i.test(h)), 'every weight column reads TOTAL: ' + heads.join(','))
  const row = page.locator('.ex-card', { hasText: 'Bent-Over Dumbbell Row' }).first()
  const input = row.locator('input[data-f="weight"]').first()
  await input.tap()
  await input.fill('12')
  await page.locator('.live-title, .page-head').first().tap({ position: { x: 5, y: 5 } }).catch(() => {})
  await page.waitForTimeout(500)
  const a = await active()
  const rowEx = a.exercises.find((e) => e.sets.some((s) => s.weight != null))
  check(rowEx && rowEx.sets[0].weight === 6, 'typed 12 total → stored ' + (rowEx && rowEx.sets[0].weight))
  check((await input.inputValue()) === '12', 'shows 12 again')
  await row.scrollIntoViewIfNeeded()
  await shot('03-live-total')
  // placeholders below follow as totals
  const ph = await row.locator('input[data-f="weight"]').nth(1).getAttribute('placeholder')
  check(ph === '12', 'set 2 grey weight is the total: ' + ph)

  // header sheet: load choice + the view line and switch
  await row.locator('.load-head').tap()
  await page.waitForSelector('.view-note')
  await shot('04-load-sheet')
  await page.locator('.view-note .btn').tap()
  await page.waitForTimeout(600)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(500)
  check((await input.inputValue()) === '6', 'each view: the same set shows 6')
  check(/each/i.test(await row.locator('.load-head small').textContent()), 'each view header: EACH')
  await shot('05-live-each')
  // back to totals from Settings
  await page.goto(BASE + '/#/settings')
  await page.waitForSelector('.settings-group')
  await page.locator('[aria-label="Dumbbell pairs"] button', { hasText: 'Total' }).tap()
  await page.waitForTimeout(400)

  // 4. Settings: budget steppers
  await page.locator('.budget-settings').scrollIntoViewIfNeeded()
  await shot('06-settings-budget')
  await page.locator('.budget-settings [aria-label="Whole workout: 5 min more"]').tap()
  await page.waitForTimeout(300)
  check(/30 min/.test(await page.locator('.budget-settings .setting').first().textContent()), 'total → 30 min')
  await page.locator('.budget-settings [aria-label="Whole workout: 5 min less"]').tap()
  await page.waitForTimeout(300)
  check(/25 min/.test(await page.locator('.budget-settings .setting').first().textContent()), 'total back to 25 min')
  await page.locator('.settings-group').first().scrollIntoViewIfNeeded()
  await shot('07-settings-units')

  // 5. the original Buff Dudes: routine editor says it's over, Fit to budget, undo
  page.once('dialog', (d) => d.accept())
  await page.goto(BASE + '/#/programs')
  await page.waitForSelector('.catalog-card')
  await page.waitForTimeout(600)
  await cardOrig.locator('.btn-primary').tap()
  await page.waitForTimeout(500)
  const sw = page.getByRole('button', { name: 'Switch', exact: true })
  if (await sw.count()) await sw.first().tap()
  await page.waitForTimeout(800)
  await page.waitForSelector('.routine-card')
  await page.waitForTimeout(800)
  // finish the open workout first: discard it from the live screen is heavy; just open the editor
  const day1 = page.locator('.routine-card', { hasText: 'Day 1 · Full Body' }).filter({ hasText: 'Goblet Squat · Bent-Over' }).first()
  await day1.scrollIntoViewIfNeeded()
  await day1.locator('.routine-main').tap()
  await page.waitForSelector('.budget-line')
  await page.waitForTimeout(500)
  const line = (await page.locator('.budget-line b').textContent()) || ''
  check(/Over your 25 min/.test(line), 'editor: ' + line)
  await page.locator('.budget-line').scrollIntoViewIfNeeded()
  await shot('08-editor-over')
  await page.locator('.budget-line .btn', { hasText: 'Fit to budget' }).tap()
  await page.waitForSelector('.budget-changes')
  await page.waitForTimeout(400)
  const line2 = (await page.locator('.budget-line b').textContent()) || ''
  check(/Fits your 25 min/.test(line2), 'after fitting: ' + line2)
  const changes = await page.locator('.budget-changes li').allTextContents()
  check(changes.length >= 3 && changes.some((c) => /heavier/.test(c)) && changes.some((c) => /Superset/.test(c)), `${changes.length} changes listed`)
  console.log('   ' + changes.join('\n   '))
  await page.locator('.budget-line').scrollIntoViewIfNeeded()
  await shot('09-editor-fitted')
  await shot('09b-editor-fitted-full', true)
  const sq = await page.locator('.target-field input').first().inputValue()
  check(sq === '6–8', 'first exercise target now 6–8: ' + sq)
  await page.locator('.bc-head .btn', { hasText: 'Undo' }).tap()
  await page.waitForTimeout(400)
  check(/Over your 25 min/.test(await page.locator('.budget-line b').textContent()), 'undo brings it back')
  check((await page.locator('.target-field input').first().inputValue()) === '10', 'target back to 10')
  await page.locator('.page-head .btn-text', { hasText: 'Cancel' }).tap()
  await page.waitForTimeout(400)
  const discard = page.getByRole('button', { name: 'Discard', exact: true })
  if (await discard.count()) await discard.first().tap()
  await page.waitForTimeout(500)

  // 6. starting an over-budget routine: the coach strip offers to fit today's session (one nudge; see src/liveCoach.ts)
  await page.goto(BASE + '/#/train')
  await page.waitForSelector('.routine-card')
  await page.waitForTimeout(500)
  await day1.scrollIntoViewIfNeeded()
  await day1.locator('.routine-actions .btn-primary').tap()
  await throughStartSheet()
  await page.waitForTimeout(600)
  const replace = page.getByRole('button', { name: /Discard & start/ })
  if (await replace.count()) await replace.first().tap()
  await page.waitForSelector('.live')
  await page.waitForSelector('.cs-btn.primary', { timeout: 6000 }).catch(() => {})
  const startText = (await page.locator('.coach-strip .cs-text').textContent().catch(() => '')) || ''
  check(/Plan runs ~\d+ of 25 min: fit it to 25 min\?/.test(startText), 'coach strip at the start: ' + startText)
  check(!(await page.locator('.toast', { hasText: 'Over your' }).count()), 'no separate start toast')
  await shot('10-start-toast')
  await page.locator('.cs-btn.primary', { hasText: 'Fit it' }).tap()
  await page.waitForTimeout(600)
  const fitted = (await page.locator('.coach-strip .cs-text').textContent().catch(() => '')) || ''
  check(/Fitted to ~\d+ min/.test(fitted), 'after Fit it: ' + fitted)
  const b = await active()
  check(b.timePlan.warmup + b.timePlan.main + b.timePlan.cooldown <= 25, `live plan now ${b.timePlan.warmup + b.timePlan.main + b.timePlan.cooldown} of ${b.timePlan.budget} min`)
  check(b.exercises.some((e) => e.superset), 'live workout now has supersets')
  await shot('11-live-fitted')

  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
  await browser.close()
  console.log(failed ? `${failed} failed` : 'all passed')
  process.exit(failed ? 1 : 0)
})()
