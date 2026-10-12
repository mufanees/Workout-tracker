// The live coach on a phone: Buff Dudes from Train → Programs, sets with effort taps and a fake heart-rate
// strap, the coach strip after a set, high heart rate in a rest, recovered early, a cue mid-set, running
// behind (page.clock) with Apply and Undo, a stand-in server line, and the finish verdict.
// Needs a fresh DATA_DIR. PORT defaults to 3820.
//   APP_TOKEN=testkey DATA_DIR=<fresh> DIST_DIR=<dist> PORT=3820 node server/server.mjs
//   node qa/walk-live-coach.cjs          (WIDTH=360 for a narrow phone, SCHEME=light)
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const OUT = __dirname + '/shots-livecoach/'
const BASE = `http://localhost:${process.env.PORT || 3820}`
const WIDTH = Number(process.env.WIDTH || 390)
require('fs').mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const scheme = process.env.SCHEME || 'dark'
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme })
  await ctx.addInitScript(() => {
    localStorage.setItem('reps-token', 'testkey')
    // fake strap: sends window.__hr every second (8-bit format)
    window.__hr = 118
    const ch = new EventTarget()
    ch.startNotifications = async () => {
      setInterval(() => {
        ch.value = new DataView(new Uint8Array([0, window.__hr]).buffer)
        ch.dispatchEvent(new Event('characteristicvaluechanged'))
      }, 1000)
      return ch
    }
    const device = new EventTarget()
    device.id = 'dev1'
    device.name = 'HRM-Dual:123456'
    device.gatt = { connected: false, connect: async () => ((device.gatt.connected = true), device.gatt), disconnect() {}, getPrimaryService: async () => ({ getCharacteristic: async () => ch }) }
    Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => device, getDevices: async () => [] } })
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date('2026-10-10T07:00:00') })
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()))
  const tag = `${scheme}-${WIDTH}-`
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
  const check = (ok, what, got) => {
    if (!ok) failed++
    console.log((ok ? 'PASS ' : 'FAIL ') + what + (!ok && got !== undefined ? `  (got ${JSON.stringify(got)})` : ''))
  }
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
  const sets = async (name) => {
    exIds ||= new Map((await idb('exercises')).map((e) => [e.name, e.id]))
    const w = await idb('meta', 'active')
    return w.exercises.find((e) => e.exerciseId === exIds.get(name))?.sets
  }
  const line = () => page.locator('.cs-line .cs-text').innerText()
  const src = () => page.locator('.cs-line').getAttribute('data-src')
  const card = (name) => page.locator('.ex-card', { has: page.locator('h3', { hasText: name }) })
  const tick = async (name, i) => {
    const c = card(name).locator('button.check').nth(i)
    await c.scrollIntoViewIfNeeded()
    await c.tap()
    await page.clock.runFor(400)
    await page.waitForTimeout(150)
  }
  const hr = (v) => page.evaluate((v) => (window.__hr = v), v)
  const run = async (ms) => {
    await page.clock.runFor(ms)
    await page.waitForTimeout(100)
  }

  // a stand-in coach on the server: it's on, and answers the live call with a short line
  let liveCalls = 0
  await page.route('**/api/coach/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true }) }))
  await page.route('**/api/coach/quick', async (route) => {
    const body = route.request().postDataJSON()
    if (body.kind !== 'live') return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"no"}' })
    liveCalls++
    const line = body.moment === 'start' ? 'Short and sharp today: own every rep of the squat, then move fast.' : `Good work on ${body.state.just_finished}. Keep the rows strict.`
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ line }) })
  })

  // --- Buff Dudes from Train → Programs
  await page.goto(BASE + '/#/train')
  await page.waitForSelector('.starter-card')
  await run(1500)
  await page.locator('.starter-item', { hasText: 'Buff Dudes' }).first().tap()
  await page.waitForSelector('.catalog-card')
  await page.locator('.catalog-card', { hasText: 'Buff Dudes' }).first().locator('.btn-primary').tap()
  await page.waitForSelector('.plan-card')
  await run(600)
  const planLine = await page.locator('.plan-coach').innerText().catch(() => '')
  check(/25 min/.test(planLine.trim()), `Train: the coach's one-line plan ("${planLine.trim()}")`)
  await page.locator('.plan-card').scrollIntoViewIfNeeded()
  await shot('01-train-plan')

  await page.locator('.plan-card .btn-block').tap()
  await throughStartSheet()
  await page.waitForSelector('.live')
  await run(800)
  await page.waitForSelector('.coach-strip')
  const lines = async () => ((await idb('meta', 'active')).coachLive?.lines || [])
  const startLine = (await lines()).find((l) => l.kind === 'start')?.text || ''
  check(/min/.test(startLine), `start: the time plan ("${startLine}")`)
  check(!(await page.locator('.coach-card').count()), 'one coach surface: no separate pre-workout card')
  await shot('02-start')
  check(!(await page.locator('.toast', { hasText: 'Over your' }).count()), 'one nudge: no separate "Over your budget" toast')
  const fitBtn = page.locator('.cs-btn.primary', { hasText: 'Fit it' })
  check(/fit it to 25 min\?/.test(startLine) && (await fitBtn.count()) === 1, 'start offers Fit it (the app’s fitWorkout)')
  const shape = async () => JSON.stringify((await idb('meta', 'active')).exercises.map((e) => [e.exerciseId, e.rest, e.superset, e.sets.length]))
  const s1 = await shape()
  await fitBtn.tap()
  await run(600)
  const s2 = await shape()
  check(s1 !== s2 && /^Fitted to ~\d+ min/.test(await line()), `Fit it reshapes today's session ("${await line()}")`)
  await shot('02b-fitted')
  await page.locator('.cs-btn', { hasText: 'Undo' }).tap()
  await run(600)
  check((await shape()) === s1, 'Undo puts the session back')
  await run(1500)
  await page.waitForTimeout(500)
  const s0 = (await lines()).find((l) => l.kind === 'llm')
  check(s0 && s0.src === 'server' && /Short and sharp/.test(s0.text), `stand-in server line arrives after the start (src=${s0 && s0.src})`)
  console.log('   lines so far: ' + (await lines()).map((l) => `[${l.kind}/${l.src}] ${l.text}`).join(' || '))

  // heart rate strap, a working heart rate
  await page.locator('.hr-connect').first().tap()
  await hr(142)
  await run(6000)

  // warm-up: tick both lines
  await page.locator('.cl-item').nth(0).tap()
  await run(500)
  await page.locator('.cl-item').nth(1).tap()
  await run(500)

  // --- Goblet Squat: no history → a reps target
  const g0 = await sets('Goblet Squat')
  check(g0[0].cr === 10 && g0[0].cw == null, 'no history: reps target 10, no weight', g0[0])
  await card('Goblet Squat').locator('input[data-f="weight"]').first().fill('16')
  await run(30000)
  await tick('Goblet Squat', 0)
  const l1 = await line()
  check(/16 kg|aim for/.test(l1), `after set 1: a suggestion with a reason ("${l1}")`)
  const g1 = await sets('Goblet Squat')
  check(g1[1].cl && g1[1].cr != null, 'set 2 got the coach’s targets', g1[1])
  await shot('03-after-set')

  // set 2: 13 reps (past the top of 8–10 / 10) → go heavier
  await run(80000) // rest runs out
  await card('Goblet Squat').locator('input[data-f="reps"]').nth(1).fill('13')
  await run(35000)
  await tick('Goblet Squat', 1)
  const g2 = await sets('Goblet Squat')
  const l2 = await line()
  check(g2[2].cw === 17 && g2[2].cl, `13 reps → set 3 at 17 kg ("${l2}")`, g2[2])
  const ph = await card('Goblet Squat').locator('input[data-f="weight"]').nth(2).getAttribute('placeholder')
  check(ph === '17', `set 3's grey weight shows 17 (not the 16 typed above) (${ph})`)
  await shot('04-go-heavier')

  // heart rate high in the rest: 60 s in, still 165
  await hr(168)
  await run(10000)
  await hr(165)
  await run(56000)
  await run(3500)
  const l3 = await line()
  const behindNow = /no time for more rest/.test(l3)
  const plus = page.locator('.cs-btn.primary', { hasText: '+30 s' })
  check(/HR still 16\d after 60 s/.test(l3) && (behindNow || (await plus.count()) === 1), `HR not recovered: "${l3}"${behindNow ? ' (behind: fewer reps, no extra rest)' : ' with +30 s'}`)
  await shot('05-hr-high')
  if (behindNow) {
    const g3 = await sets('Goblet Squat')
    check(g3[2].cr === 8, 'behind and not recovered: next set’s reps target lowered to 8', g3[2])
  } else {
    await plus.tap()
    await run(500)
    check(/Added 30 s/.test(await line()), 'tapping +30 s extends the rest')
  }

  // in-set cue: rest ends, HR way up 15 s into the set
  await run(50000)
  await hr(178)
  await run(16000)
  await run(3500)
  const l4 = await line()
  check(/finish this rep and rack it/.test(l4), `mid-set: "${l4}"`)
  await shot('06-in-set')
  await hr(150)
  await tick('Goblet Squat', 2)
  await page.locator('.effort-opt', { hasText: '3 or more' }).first().tap()
  await run(800)
  const l5 = (await lines()).filter((l) => l.kind === 'set').at(-1)?.text || ''
  check(/^Next, Bent-Over Dumbbell Row: /.test(l5), `exercise done → next exercise's first set ("${l5}")`)
  await run(1500)
  await page.waitForTimeout(400)
  check(liveCalls >= 2, `the server line is asked again after the exercise (${liveCalls} calls)`)

  // recovered early while time is tight: run behind first (page.clock), then a rest with HR down
  await run(9 * 60000) // lost 9 minutes (a phone call)
  await card('Bent-Over Dumbbell Row').locator('input[data-f="weight"]').first().fill('14')
  await hr(160)
  await tick('Bent-Over Dumbbell Row', 0)
  await run(3000)
  await hr(122)
  await run(24000)
  await run(3500)
  const l6 = await line()
  check(/Recovered \(HR 12\d.*\): go now, saves/.test(l6) && (await page.locator('.cs-btn.primary', { hasText: 'Go now' }).count()) === 1, `adaptive rest: "${l6}"`)
  await shot('07-recovered-go')
  await page.locator('.cs-btn.primary', { hasText: 'Go now' }).tap()
  await run(800)
  check(!(await page.locator('.rest-bar').count()), 'Go now ends the rest (one tap, never by itself)')

  // behind: the time action
  await run(95000)
  await run(3500)
  let l7 = await line()
  for (let i = 0; i < 4 && !/over|left, cool-down/.test(l7); i++) {
    await run(30000)
    l7 = await line()
  }
  const apply = page.locator('.cs-btn.primary', { hasText: 'Apply' })
  check(/min over: .+\?/.test(l7) && (await apply.count()) === 1, `behind: "${l7}" with Apply`)
  check(/over/.test(await page.locator('.cs-time').innerText()), 'time status reads over')
  await shot('08-behind')
  const before = JSON.stringify((await idb('meta', 'active')).exercises.map((e) => [e.id, e.rest, e.superset, e.sets.length]))
  await apply.tap()
  await run(600)
  const after = JSON.stringify((await idb('meta', 'active')).exercises.map((e) => [e.id, e.rest, e.superset, e.sets.length]))
  check(before !== after && /^Done: /.test(await line()), `Apply changed the plan ("${await line()}")`)
  await shot('09-after-apply')
  await page.locator('.cs-btn', { hasText: 'Undo' }).tap()
  await run(600)
  const undone = JSON.stringify((await idb('meta', 'active')).exercises.map((e) => [e.id, e.rest, e.superset, e.sets.length]))
  check(undone === before, 'Undo puts it back')
  await apply.count()

  // can't do the roll-out: swap it from the exercise menu, Undo, swap again, change the routine, remember
  const ro = card('Dumbbell Roll-Out')
  await ro.locator('button[aria-label^="Options for"]').scrollIntoViewIfNeeded()
  await ro.locator('button[aria-label^="Options for"]').tap()
  await run(400)
  await page.locator('.action', { hasText: 'Can’t do this? Swap it' }).tap()
  await run(500)
  await page.waitForSelector('.swap-list')
  const alts = await page.locator('.swap-list .action-label b').allInnerTexts()
  check(alts.length >= 3 && !alts.some((n) => /roll|wheel|bench/i.test(n)), `alternatives: ${alts.join(', ')}`)
  await shot('10-swap-options')
  const roId = (await sets('Dumbbell Roll-Out')) && exIds.get('Dumbbell Roll-Out')
  await page.locator('.swap-list .action').first().tap()
  await run(500)
  const swappedTo = alts[0]
  check(!(await sets('Dumbbell Roll-Out')) && !!(await sets(swappedTo)), `swapped to ${swappedTo} in the workout`)
  await shot('11-swap-done')
  await page.locator('.swap-follow .btn', { hasText: 'Undo' }).tap()
  await run(500)
  check(!!(await sets('Dumbbell Roll-Out')), 'Undo brings the roll-out back')
  await page.locator('.swap-list .action').first().tap()
  await run(500)
  await page.locator('.swap-follow .btn', { hasText: 'Also change' }).tap()
  await run(500)
  const rs = await idb('routines')
  const day1 = rs.find((r) => r.name === 'Day 1 · Full Body' && r.program)
  check(day1 && !day1.exercises.some((e) => e.exerciseId === roId) && day1.exercises.some((e) => e.exerciseId === exIds.get(swappedTo)), 'the routine changed too')
  await page.locator('.swap-lack .btn').tap()
  await run(500)
  const prof = (await idb('coach')).find((x) => x.kind === 'profile')
  const note = (await idb('coach')).find((x) => x.kind === 'note' && /rollable/i.test(x.text || ''))
  check(prof && /No rollable dumbbells/i.test(prof.equipment || '') && !!note, `remembered: profile "${prof && prof.equipment}", note "${note && note.text}"`)
  await shot('12-swap-followups')
  await page.locator('.swap-follow .btn-primary', { hasText: 'Done' }).tap()
  await run(500)

  // earlier lines fold away; tap to see them
  await page.locator('.cs-line').tap()
  await run(400)
  const n = await page.locator('.cs-history li').count()
  check(n >= 5, `earlier lines are there on tap (${n})`)
  await shot('13-history')
  await page.locator('.cs-line').tap()

  // finish: the verdict
  await page.locator('.live-head .btn-primary').tap()
  await run(800)
  const v = await page.locator('.coach-verdict').innerText().catch(() => '')
  check(/min/.test(v), `finish verdict ("${v.trim()}")`)
  await shot('14-finish')

  check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
  console.log(failed ? `\n${failed} FAILED` : '\nall passed')
  await browser.close()
  process.exit(failed ? 1 : 0)
})()
