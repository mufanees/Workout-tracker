// Muscle map: seeds two weeks of dumbbell workouts through the sync API, then shoots the Body tab map
// (recovery and volume, dark and light), a tapped region, the workout detail and the Train section.
// Run on a fresh DATA_DIR: PORT=3840 node qa/walk-body.cjs
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const OUT = __dirname + '/shots-body/'
const BASE = `http://localhost:${process.env.PORT || 3000}`
require('fs').mkdirSync(OUT, { recursive: true })

const H = 3600e3
const now = Date.now()
let n = 0
const sets = (list, target) => list.map(([w, r, extra = {}]) => ({ id: 'bs' + n++, kind: 'normal', weight: w, reps: r, seconds: null, done: true, ...extra }))
const ex = (exerciseId, list, target = '8–12') => ({ id: 'be' + n++, exerciseId, notes: '', target, rest: 75, superset: null, sets: sets(list) })
const wk = (id, name, hoursAgo, exercises) => ({
  store: 'workouts',
  id,
  updatedAt: now - hoursAgo * H,
  deleted: false,
  data: { id, name, routineId: null, start: now - hoursAgo * H - 32 * 60e3, end: now - hoursAgo * H, notes: '', exercises },
})
const changes = [
  wk('wb1', 'Full body A', 3, [
    ex('x-goblet-squat', [[20, 12], [22, 10], [22, 9, { rir: 1.5 }]]),
    ex('x-dumbbell-bench-press', [[18, 10], [18, 9], [18, 8, { rir: 0 }]]),
    ex('x-one-arm-dumbbell-row', [[22, 12], [22, 11]]),
    ex('x-side-lateral-raise', [[8, 15], [8, 14]], '12–15'),
  ]),
  wk('wb2', 'Hinge and pull', 50, [
    ex('x-dumbbell-romanian-deadlift', [[22, 10], [22, 10], [22, 10, { rir: 1.5 }]]),
    ex('x-bent-over-dumbbell-row', [[20, 10], [20, 10], [20, 9]]),
    ex('x-hammer-curl', [[12, 12], [12, 10, { rir: 0 }]]),
    ex('x-side-plank', [[null, null, { seconds: 30 }]], '30 s'),
  ]),
  wk('wb3', 'Push and legs', 98, [
    ex('x-bulgarian-split-squat', [[14, 10], [14, 10], [14, 9]]),
    ex('x-dumbbell-shoulder-press', [[16, 10], [16, 9], [16, 8, { rir: 0 }]]),
    ex('x-floor-skull-crusher', [[10, 12], [10, 11]]),
    ex('x-standing-dumbbell-calf-raise', [[22, 15], [22, 15]], '12–15'),
  ]),
  wk('wb4', 'Full body B', 170, [
    ex('x-goblet-squat', [[20, 12], [20, 12], [20, 11]]),
    ex('x-push-up', [[null, 15], [null, 14]], '10–15'),
    ex('x-reverse-flyes', [[6, 15], [6, 15]], '12–15'),
  ]),
  wk('wb5', 'Hinge and pull', 220, [
    ex('x-dumbbell-romanian-deadlift', [[20, 10], [20, 10], [20, 10]]),
    ex('x-dumbbell-shrug', [[24, 12], [24, 12]]),
  ]),
]

;(async () => {
  const r = await fetch(BASE + '/api/sync', { method: 'POST', headers: { authorization: 'Bearer testkey', 'content-type': 'application/json' }, body: JSON.stringify({ since: 0, changes }) })
  console.log('seeded', (await r.json()).seq)
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const errors = []
  const check = (ok, what) => console.log((ok ? 'PASS ' : 'FAIL ') + what)
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
    await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
    const shot = async (name, el) => {
      await page.waitForTimeout(500)
      if (el) await el.screenshot({ path: OUT + scheme + '-' + name + '.png' })
      else await page.screenshot({ path: OUT + scheme + '-' + name + '.png' })
    }

    await page.goto(BASE + '/#/body')
    await page.waitForSelector('.bm-card')
    await page.waitForTimeout(1500)
    const card = page.locator('.bm-card')
    await card.scrollIntoViewIfNeeded()
    check((await page.locator('.bm-card .bm-btn[tabindex="0"]').count()) === 16, `${scheme}: 16 region buttons`)
    const chest = page.locator('.bm-card .bm-btn[tabindex="0"]').filter({ has: page.locator('path') }).nth(0)
    check(/fatigued/.test(await chest.getAttribute('aria-label')), `${scheme}: region labels say fatigue`)
    await shot('01-recovery', card)

    // tap the chest on the figure
    const box = await page.locator('.bm-card .bm-view').first().boundingBox()
    await page.touchscreen.tap(box.x + box.width * 0.4, box.y + box.width * 2.06 * 0.22)
    await page.waitForSelector('.bm-detail')
    const title = await page.locator('.bm-detail h3').textContent()
    check(!!title, `${scheme}: tapped region opens its detail (${title})`)
    await shot('02-detail', card)
    await page.locator('.bm-detail .icon-btn').tap()

    await page.locator('.bm-card .segmented button', { hasText: 'Volume' }).tap()
    await page.waitForTimeout(600)
    check((await page.locator('.bm-card .bm-m.bm-volume.l4').count()) > 0, `${scheme}: volume mode has on-target regions`)
    await shot('03-volume', card)
    await page.locator('.bm-card .segmented button', { hasText: 'Recovery' }).tap()

    await page.goto(BASE + '/#/history/wb1')
    await page.waitForSelector('.bm-worked-card')
    await page.locator('.bm-worked-card').scrollIntoViewIfNeeded()
    check((await page.locator('.bm-worked-list li').count()) >= 4, `${scheme}: workout detail lists muscles worked`)
    await shot('04-worked', page.locator('.bm-worked-card'))

    await page.goto(BASE + '/#/train')
    await page.waitForSelector('.page-head h1')
    await page.waitForTimeout(1200)
    const home = page.locator('.bm-home')
    check((await home.count()) === 1, `${scheme}: Train shows the recovery section`)
    if (await home.count()) {
      await home.scrollIntoViewIfNeeded()
      await shot('05-train', home)
    }
    await ctx.close()
  }
  await browser.close()
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
})()
