// Measured workout time: rest → idle → tick, a tick during a running rest, a superset with no rest,
// Skip, finish; checks the stored numbers and screenshots the Time card, the exercise page and the
// coach context. Real waits (about 2 minutes). Needs a fresh DATA_DIR. PORT defaults to 3400.
//   APP_TOKEN=testkey DATA_DIR=<fresh> DIST_DIR=<dist> PORT=3400 node server/server.mjs
//   node qa/walk-timing.cjs            (WIDTH=360 for a narrow phone)
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const OUT = __dirname + '/shots-timing/'
const BASE = `http://localhost:${process.env.PORT || 3400}`
const WIDTH = Number(process.env.WIDTH || 390)
require('fs').mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const scheme = process.env.SCHEME || 'dark'
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
  await ctx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()))
  const tag = `${scheme}-${WIDTH}-`
  const shot = async (n, full) => {
    await page.waitForTimeout(500)
    await page.screenshot({ path: OUT + tag + n + '.png', fullPage: !!full })
  }
  let failed = 0
  const check = (ok, what) => {
    if (!ok) failed++
    console.log((ok ? 'PASS ' : 'FAIL ') + what)
  }
  const near = (got, want, tol = 1) => got != null && want != null && Math.abs(got - want) <= tol
  const now = () => page.evaluate(() => Date.now())
  const idb = (store, key) =>
    page.evaluate(
      ([store, key]) =>
        new Promise((res, rej) => {
          const r = indexedDB.open('reps')
          r.onsuccess = () => {
            const tx = r.result.transaction(store).objectStore(store)
            const q = key ? tx.get(key) : tx.getAll()
            q.onsuccess = () => res(q.result)
            q.onerror = () => rej(q.error)
          }
          r.onerror = () => rej(r.error)
        }),
      [store, key],
    )
  let exIds = null
  const activeSet = async (name, setIdx) => {
    exIds ||= new Map((await idb('exercises')).map((e) => [e.name, e.id]))
    const w = await idb('meta', 'active')
    return w.exercises.find((e) => e.exerciseId === exIds.get(name)).sets[setIdx]
  }
  const card = (name) => page.locator('.ex-card', { has: page.locator('h3', { hasText: name }) })
  const tick = async (name, i) => {
    const c = card(name).locator('button.check').nth(i)
    await c.scrollIntoViewIfNeeded()
    const t = await now()
    await c.tap()
    await page.waitForTimeout(150)
    return t
  }
  const pick = async (label) => {
    await page.locator('.action', { hasText: label }).first().tap()
    await page.waitForTimeout(400)
  }
  const restGone = () => page.waitForSelector('.rest-bar', { state: 'detached', timeout: 60000 })

  // a stand-in coach: says it's on, captures the chat request (its context), answers "ok"
  let body = null
  await page.route('**/api/coach/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true }) }))
  await page.route('**/api/coach', async (route) => {
    const req = route.request()
    const data = req.postDataJSON()
    if (data && data.context && !body) body = data
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"text":"ok"}\n\ndata: {"done":true}\n\n' })
  })

  // --- a program and its first workout
  await page.goto(BASE + '/#/train')
  await page.waitForSelector('.starter-card')
  await page.waitForTimeout(1500)
  await page.locator('.starter-item', { hasText: 'Buff Dudes' }).tap()
  await page.waitForSelector('.catalog-card')
  await page.locator('.catalog-card', { hasText: 'Buff Dudes' }).locator('.btn-primary').tap()
  await page.waitForSelector('.plan-card')
  await page.waitForTimeout(600)
  await page.locator('.plan-card .btn-block').tap()
  await page.waitForSelector('.live')
  await page.waitForTimeout(800)
  const start = (await idb('meta', 'active')).start

  // warm-up: tick both lines; the first set starts at the last one
  await page.waitForTimeout(2000)
  await page.locator('.cl-item').nth(0).tap()
  await page.waitForTimeout(1500)
  const tWarm = await now()
  await page.locator('.cl-item').nth(1).tap()
  await page.waitForTimeout(400)
  const a0 = await idb('meta', 'active')
  check(a0.mark && a0.mark.kind === 'tick' && near(a0.mark.at / 1000, tWarm / 1000), 'warm-up tick is the anchor')

  // Goblet Squat: rest 30 s, weight 16
  await card('Goblet Squat').locator('.tag-btn[aria-label^="Rest timer"]').tap()
  await page.waitForTimeout(300)
  await pick('0:30')
  await card('Goblet Squat').locator('input[data-f="weight"]').first().fill('16')
  await page.waitForTimeout(3000)
  const t1 = await tick('Goblet Squat', 0)
  const s1 = await activeSet('Goblet Squat', 0)
  check(near(s1.work, (t1 - tWarm) / 1000) && s1.rested == null, `set 1: from the warm-up tick (${s1.work} s)`)
  check(near(s1.at / 1000, t1 / 1000), 'set 1: tick time stored')
  check(!!(await idb('meta', 'active')).restRun, 'rest running is on the active workout')
  await shot('01-resting')

  // rest runs out, idle 4 s, tick: idle counts toward the set
  await restGone()
  const tRestEnd = await now()
  const m1 = (await idb('meta', 'active')).mark
  check(m1 && m1.kind === 'rest-end' && near(m1.rested, 30), `rest end recorded (${m1 && m1.rested} s)`)
  await page.waitForTimeout(4000)
  const t2 = await tick('Goblet Squat', 1)
  const s2 = await activeSet('Goblet Squat', 1)
  check(near(s2.rested, 30) && s2.restPlan === 30, `set 2: rested ${s2.rested} s of 30`)
  check(near(s2.work, (t2 - m1.at) / 1000) && s2.work >= 4, `set 2: rest end → tick incl. idle (${s2.work} s, ~${Math.round((t2 - tRestEnd) / 1000)} s after the bar left)`)
  await shot('02-last-set')

  // tick during the running rest: rest ends at the tick, work unknown
  await page.waitForTimeout(10000)
  const t3 = await tick('Goblet Squat', 2)
  const s3 = await activeSet('Goblet Squat', 2)
  check(near(s3.rested, (t3 - t2) / 1000) && s3.work == null && s3.restPlan === 30, `set 3 during rest: rested ${s3.rested} s, work ${s3.work}`)

  // superset the row with the bench press, 30 s rest after each round
  await card('Bent-Over Dumbbell Row').locator('button[aria-label^="Options for"]').tap()
  await page.waitForTimeout(300)
  await pick('Superset with')
  await pick('Dumbbell Bench Press')
  await page.locator('.ss-rest').first().tap()
  await page.waitForTimeout(300)
  await pick('0:30')
  await card('Bent-Over Dumbbell Row').locator('input[data-f="weight"]').first().fill('14')
  await card('Dumbbell Bench Press').locator('input[data-f="weight"]').first().fill('12')
  // the rest after squat set 3 (30 s) runs out, idle 3 s; the superset is bench (1a) then row (1b)
  await restGone()
  await page.waitForTimeout(3000)
  const t4 = await tick('Dumbbell Bench Press', 0)
  const b1 = await activeSet('Dumbbell Bench Press', 0)
  check(near(b1.rested, 30) && b1.work >= 3 && b1.work <= 5, `bench 1 after rest + idle: rested ${b1.rested}, work ${b1.work}`)
  check(!(await page.locator('.rest-bar').count()), 'mid-superset: no rest bar')
  await page.waitForTimeout(5000)
  const t5 = await tick('Bent-Over Dumbbell Row', 0)
  const r1 = await activeSet('Bent-Over Dumbbell Row', 0)
  check(near(r1.work, (t5 - t4) / 1000) && r1.rested == null, `row 1 mid-superset: from the bench tick (${r1.work} s), no rest`)
  // rest after the round: Skip after ~5 s, then 2 s idle
  await page.waitForSelector('.rest-bar')
  await page.waitForTimeout(5000)
  const tSkip = await now()
  await page.locator('.rest-btn.skip').tap()
  await page.waitForTimeout(2000)
  const t6 = await tick('Dumbbell Bench Press', 1)
  const b2 = await activeSet('Dumbbell Bench Press', 1)
  check(near(b2.rested, (tSkip - t5) / 1000) && near(b2.work, (t6 - tSkip) / 1000), `bench 2 after Skip: rested ${b2.rested}, work ${b2.work}`)

  // untick and tick again: the untick clears the time
  await card('Dumbbell Bench Press').locator('button.check').nth(1).tap()
  await page.waitForTimeout(300)
  const r2u = await activeSet('Dumbbell Bench Press', 1)
  check(!r2u.done && r2u.at == null && r2u.work == null && r2u.rested == null, 'untick clears the set’s time')
  await page.waitForTimeout(1000)
  const t7 = await tick('Dumbbell Bench Press', 1)
  const r2b = await activeSet('Dumbbell Bench Press', 1)
  check(near(r2b.work, (t7 - tSkip) / 1000) && near(r2b.rested, b2.rested), `re-tick: from the same anchor as before (${r2b.work} s, rested ${r2b.rested})`)
  await page.waitForTimeout(500)
  await shot('03-live-superset')

  // reload mid-rest: the bookkeeping survives
  await page.reload()
  await page.waitForSelector('.live')
  await page.waitForTimeout(800)
  const after = await idb('meta', 'active')
  check(after.mark && after.mark.at === r2b.at, 'reload keeps the anchor')

  // finish
  await page.waitForTimeout(3000)
  const tFinish = await now()
  await page.locator('.live-head .btn-primary').tap()
  await page.waitForTimeout(600)
  await page.locator('.sheet .btn-primary', { hasText: 'Save workout' }).tap()
  await page.waitForSelector('.time-card')
  await page.waitForTimeout(800)
  const saved = (await idb('workouts')).find((w) => w.end)
  const tm = saved.timing
  check(!!tm, 'finished workout has a timing summary: ' + JSON.stringify(tm))
  check(!('mark' in saved) && !('restRun' in saved), 'bookkeeping stripped on finish')
  check(tm && tm.warmup + tm.work + tm.rest + tm.transition + tm.cooldown === tm.total, 'summary parts add up to the total')
  check(tm && near(tm.total, (saved.end - start) / 1000) && near(saved.end / 1000, tFinish / 1000, 2), `total ${tm && tm.total} s`)
  check(tm && near(tm.warmup, (tWarm - start) / 1000), `warm-up ${tm && tm.warmup} s`)
  const sq = saved.exercises[0].sets
  check(sq.length === 3 && sq.every((s) => s.at), 'set times persist with the workout')

  // the synced copy on the server has them too
  await page.waitForTimeout(2500)
  const sync = await page.evaluate(async () => (await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer testkey' }, body: JSON.stringify({ since: 0, changes: [] }) })).json())
  const srv = sync.changes.find((c) => c.store === 'workouts' && c.data?.end)
  check(srv && srv.data.timing && srv.data.exercises[0].sets[1].rested === sq[1].rested, 'synced to the server with timing')

  const tc = page.locator('.time-card')
  await tc.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await tc.screenshot({ path: OUT + tag + '04-time-card.png' })
  await shot('05-summary', true)

  // workout detail (not the celebration)
  await page.goto(BASE + '/#/history/' + saved.id)
  await page.waitForSelector('.time-card')
  await page.waitForTimeout(1200) // the screen change's fading copy is gone
  await page.locator('.time-card').last().scrollIntoViewIfNeeded()
  await shot('06-detail')

  // exercise page: time per set
  await page.goto(BASE + '/#/exercises/' + saved.exercises[0].exerciseId)
  await page.waitForSelector('.detail-title')
  const timeSec = page.locator('section', { has: page.locator('.section-title', { hasText: 'Time' }) })
  check((await timeSec.count()) === 1, 'exercise page shows time per set')
  if (await timeSec.count()) {
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight))
    await shot('07-exercise-time')
  }

  // the routine's estimate now uses the measured pace
  await page.goto(BASE + '/#/routine/' + saved.routineId)
  await page.waitForSelector('#routine-budget')
  await page.waitForTimeout(600)
  const hint = await page.locator('.field', { has: page.locator('#routine-budget') }).locator('.field-hint').textContent()
  check(/from your pace/.test(hint), 'routine estimate from your pace: ' + hint)
  await page.locator('#routine-budget').scrollIntoViewIfNeeded()
  await shot('08-routine-estimate')

  // coach context: what the coach is sent (captured by the stand-in set up at the start)
  await page.goto(BASE + '/#/coach')
  await page.waitForSelector('#coach-input')
  await page.waitForTimeout(800)
  await page.fill('#coach-input', 'Fit my workouts into 30 minutes')
  await page.locator('button.send').tap()
  for (let i = 0; i < 20 && !body; i++) await page.waitForTimeout(250)
  const context = body?.context || null
  if (context) {
    require('fs').writeFileSync(OUT + tag + 'coach-context.txt', context)
    check(/TIME USE \(measured/.test(context), 'coach context has TIME USE')
    check(/Goblet Squat[^\n]*\| \d+:\d\d total, sets \d+:\d\d\/\d+:\d\d\/\? incl\. start delay, rest/.test(context), 'coach context has per-exercise times')
    check(/Measured: warm-up/.test(context), 'coach context has the measured split')
    const lines = context.split('\n')
    const i = lines.findIndex((l) => l.startsWith('TIME USE'))
    console.log(lines.slice(i, i + 6).join('\n'))
    console.log(lines.filter((l) => /\| \d+:\d\d total|Measured:/.test(l)).join('\n'))
  } else check(false, 'could not capture the coach context')

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
  console.log(failed ? `${failed} FAILED` : 'all passed')
  await browser.close()
  process.exit(failed ? 1 : 0)
})()
