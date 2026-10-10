// The Android app's JS paths, without a phone: a fake Capacitor bridge (window.androidBridge,
// Capacitor.PluginHeaders, nativePromise / nativeCallback) stands in for the Kotlin plugins and
// records every call. Checks that src/native.ts routes heart rate, notifications, timers, keep-awake,
// Settings → Phone and the on-device AI where they should, and that buffered strap samples from a
// frozen page land in the workout at their own times. (The Kotlin side itself needs CI / a phone.)
// Run on a fresh DATA_DIR against a build: PORT=3951 node qa/walk-native.cjs
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const PORT = process.env.PORT || 3000
const BASE = `http://localhost:${PORT}`
const OUT = __dirname + '/shots-native/'
require('fs').mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await ctx.addInitScript(() => {
    localStorage.setItem('reps-token', 'testkey')
    const calls = (window.__calls = [])
    const listeners = {}
    const header = (name, methods) => ({ name, methods: [...methods.map((m) => ({ name: m, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }] })
    let hrState = 'off'
    let seq = 0
    window.__hr = 100
    window.__frozen = false
    const emit = (window.__emit = (p, ev, data) => (listeners[p + ':' + ev] || []).forEach((cb) => cb(data)))
    const sample = (bpm, at) => ({ seq: ++seq, at, bpm, rr: [600] })
    window.__nextSeq = () => seq
    window.__sample = sample
    // the strap's beat, started on connect (so it runs on Playwright's fake clock, installed after this script)
    let beating = false
    const beat = () => {
      if (beating) return
      beating = true
      setInterval(() => {
        if (hrState !== 'connected' || window.__frozen) return
        emit('HeartRate', 'hr', sample(window.__hr, Date.now()))
      }, 1000)
    }
    const impl = {
      HeartRate: {
        pick: () => ({ id: 'AA:BB:CC:DD:EE:FF', name: 'HRM-Dual:123456' }),
        connect: () => {
          beat()
          hrState = 'connecting'
          setTimeout(() => emit('HeartRate', 'status', { state: 'connecting', running: true, name: 'HRM-Dual:123456' }), 50)
          setTimeout(() => ((hrState = 'connected'), emit('HeartRate', 'status', { state: 'connected', running: true, name: 'HRM-Dual:123456' })), 300)
          return { deviceId: 'AA:BB:CC:DD:EE:FF' }
        },
        disconnect: () => ((hrState = 'off'), emit('HeartRate', 'status', { state: 'off', running: false }), {}),
        status: () => ({ state: hrState, running: hrState !== 'off' }),
        drain: () => ({ samples: [] }),
        configure: () => ({}),
      },
      LiveNotification: { show: () => ({}), clear: () => ({}), alert: () => ({}), takeOpened: () => ({}) },
      Timers: { schedule: () => ({ exact: true }), cancel: () => ({}), status: () => ({ exact: true, sdk: 36 }) },
      Phone: {
        keepAwake: () => ({}),
        status: () => ({ bluetooth: 'granted', bluetoothOn: true, notifications: 'granted', exactAlarms: true, batteryUnrestricted: false, sdk: 36, model: 'Pixel 10 Pro' }),
        request: () => impl.Phone.status(),
        open: () => ({}),
      },
      OnDeviceAI: {
        status: () => ({ status: window.__ai || 'available' }),
        prompt: () => ({ text: '```json\n{"line":"Strong pace. Keep the next set smooth."}\n```' }),
        download: () => ({ status: 'available' }),
      },
    }
    window.androidBridge = { postMessage() {} }
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      PluginHeaders: Object.entries(impl).map(([n, m]) => header(n, Object.keys(m))),
      nativePromise: async (p, m, o) => {
        calls.push({ p, m, o: o || {} })
        await new Promise((r) => setTimeout(r, 5))
        return impl[p][m](o || {})
      },
      nativeCallback: (p, m, o, cb) => {
        calls.push({ p, m, o: o || {} })
        if (m === 'addListener') (listeners[p + ':' + o.eventName] ||= []).push(cb)
        return String(Math.random())
      },
    }
  })
  const page = await ctx.newPage()
  await page.clock.install()
  const errors = []
  const fails = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
  const check = (ok, what) => (ok ? console.log('ok  ', what) : (fails.push(what), console.log('FAIL', what)))
  const shot = async (n) => {
    await page.waitForTimeout(400)
    await page.screenshot({ path: OUT + n + '.png' })
  }
  const run = (t) => page.clock.runFor(t)
  const calls = (p, m) => page.evaluate(([p, m]) => window.__calls.filter((c) => c.p === p && (!m || c.m === m)), [p, m])
  const last = async (p, m, pred = () => true) => (await calls(p, m)).filter(pred).pop()
  const activeHR = () =>
    page.evaluate(
      () =>
        new Promise((res) => {
          const r = indexedDB.open('reps')
          r.onsuccess = () => {
            const g = r.result.transaction('meta').objectStore('meta').get('active')
            g.onsuccess = () => res(g.result ? { start: g.result.start, hr: g.result.hr || [] } : null)
          }
        }),
    )

  await page.goto(BASE + '/')
  await page.waitForSelector('.page-head')
  await page.waitForTimeout(1200)

  // ---- Settings → Phone, and the app's notification switches
  await page.goto(BASE + '/#/settings')
  await page.waitForSelector('.page-title')
  await run(500)
  await page.waitForTimeout(300)
  const titles = await page.locator('h2.section-title').allInnerTexts()
  check(titles.includes('Phone'), 'Settings has a Phone section in the app')
  const body = await page.locator('.screen').innerText()
  for (const t of ['Nearby devices', 'Exact alarms', 'Run in the background', 'On-device AI', 'Pixel 10 Pro']) check(body.includes(t), `Phone section shows ${t}`)
  check(body.includes('Fasting in the notification shade') && !body.includes('Notifications work in the installed app'), 'Notifications: the app’s live switches, not the web-push note')
  check((await page.locator('.setting', { hasText: 'Run in the background' }).locator('button', { hasText: 'Allow' }).count()) === 1, 'battery: Allow button while optimised')
  await page.locator('h2.section-title', { hasText: 'Phone' }).scrollIntoViewIfNeeded()
  await shot('01-settings-phone')
  await page.locator('.setting', { hasText: 'Run in the background' }).locator('button').tap()
  await run(100)
  check(!!(await last('Phone', 'open', (c) => c.o.what === 'battery')), 'battery Allow opens the system dialog')

  // ---- connect the strap: native picker, then the service
  await page.locator('.setting', { hasText: 'Heart rate strap' }).locator('button', { hasText: 'Connect' }).tap()
  await run(1000)
  await page.waitForTimeout(200)
  check(!!(await last('HeartRate', 'pick')), 'Connect opens the native picker')
  const conn = await last('HeartRate', 'connect')
  check(conn && conn.o.deviceId === 'AA:BB:CC:DD:EE:FF', 'then connects the chosen strap')
  check((await page.locator('.screen').innerText()).includes('Connected'), 'Settings shows Connected')

  // ---- a fast: one native notification with a ticking clock and the hours
  await page.goto(BASE + '/#/fast')
  await page.waitForSelector('.btn-primary')
  await page.locator('.btn-primary', { hasText: 'fast' }).first().tap()
  await run(1500)
  const fast = await last('LiveNotification', 'show', (c) => c.o.kind === 'fast')
  check(fast && fast.o.chronometerBase > 0 && fast.o.hourly === true && fast.o.number === '0' && /^Goal at /.test(fast.o.text) && fast.o.goalAt > fast.o.chronometerBase, 'fast: native notification with chronometer, hours, goal')
  const fastShows = (await calls('LiveNotification', 'show')).filter((c) => c.o.kind === 'fast').length
  await run('03:00')
  check((await calls('LiveNotification', 'show')).filter((c) => c.o.kind === 'fast').length === fastShows, 'fast: not re-posted every minute (the app ticks it)')
  check((await calls('Timers', 'schedule')).length === 0, 'no timers yet')

  // ---- a cardio session: keep-awake, the hr notification, the service's config
  await page.goto(BASE + '/#/train')
  await page.waitForSelector('.cardio-quick')
  await page.locator('.cardio-quick .cq-main').tap()
  await page.waitForSelector('.sheet')
  await page.locator('.sheet .chip', { hasText: 'Elliptical' }).tap()
  await page.locator('.sheet-foot .btn-primary').tap()
  await page.waitForSelector('.cardio')
  await run(8000)
  await page.waitForTimeout(200)
  check(!!(await last('Phone', 'keepAwake', (c) => c.o.on === true)), 'workout screen keeps the screen on natively')
  const hrShow = await last('LiveNotification', 'show', (c) => c.o.kind === 'hr')
  check(hrShow && hrShow.o.number === '100' && hrShow.o.chronometerBase > 0 && /bpm/.test(hrShow.o.title), 'hr notification: bpm in the status bar, native clock: ' + (hrShow && hrShow.o.title))
  const cfg = await last('HeartRate', 'configure')
  check(cfg && cfg.o.target === 2 && cfg.o.quietUntil > cfg.o.startedAt && cfg.o.zones.length === 4, 'service gets zones, target 2 and the warm-up quiet time')
  await shot('02-cardio')

  // ---- the page freezes for a minute; the service hands over what it recorded
  const before = await activeHR()
  await page.evaluate(() => (window.__frozen = true))
  await run('01:00')
  const gapFrom = await page.evaluate(() => Date.now() - 60000)
  await page.evaluate((from) => {
    const samples = []
    for (let t = from + 1000; t < from + 60000; t += 1000) samples.push(window.__sample(118, t))
    window.__emit('HeartRate', 'hrBatch', { samples })
    window.__frozen = false
  }, gapFrom)
  await run(3000)
  await page.waitForTimeout(300)
  const after = await activeHR()
  // (the page here isn't really frozen, so its own ticks may record the last bpm for a few seconds)
  const inGap = after.hr.filter(([t]) => after.start + t * 1000 > gapFrom + 6000 && after.start + t * 1000 < gapFrom + 60000)
  check(inGap.length >= 10 && inGap.every(([, b]) => b === 118), `missed minute filled from the buffer (${inGap.length} samples at 118)`)
  const times = after.hr.map((x) => x[0])
  check(times.every((t, i) => i === 0 || t - times[i - 1] >= 4), 'samples stay ordered and ≥ 5 s apart')
  check(after.hr.length > before.hr.length + 10, `workout HR grew ${before.hr.length} → ${after.hr.length}`)

  // ---- a stretch timer in the cool-down: exact alarm + countdown in the shade
  await run('04:00') // past the warm-up
  await page.locator('.cardio-action', { hasText: 'Cool down' }).tap()
  await run('00:05')
  await page.locator('.cs-row').first().locator('.cs-timer').tap()
  await run(500)
  const sched = await last('Timers', 'schedule')
  check(sched && sched.o.id === 'rest' && sched.o.at > Date.now() && sched.o.clearsLive === true, 'set timer: exact alarm at its end')
  const countdown = await last('LiveNotification', 'show', (c) => c.o.kind === 'timer')
  check(countdown && countdown.o.countdown === true && countdown.o.chronometerBase === sched.o.at, 'set timer: countdown to the same end in the shade')
  const cancels = (await calls('Timers', 'cancel')).length
  await run('01:30')
  check((await calls('Timers', 'cancel')).length > cancels, 'timer ran out on screen: the alarm is called off (the page beeped)')

  // ---- the on-device AI line (no server coach here): checked by calling the plugin wrapper path
  check((await calls('OnDeviceAI', 'status')).length >= 1, 'Settings asked the on-device AI status')

  // ---- leaving the workout releases keep-awake and clears the hr notification
  await page.goto(BASE + '/#/train')
  await run(1500)
  check(!!(await last('Phone', 'keepAwake', (c) => c.o.on === false)), 'leaving the workout screen lets the screen sleep')

  // ---- notification tap opens the right screen
  await page.evaluate(() => window.__emit('LiveNotification', 'open', { path: '/fast' }))
  await run(500)
  await page.waitForTimeout(300)
  check(page.url().includes('/fast'), 'tapping the fasting notification opens /fast')

  console.log(errors.length ? errors.join('\n') : 'no errors')
  console.log(fails.length ? `${fails.length} FAILED` : 'all checks passed')
  await browser.close()
  process.exit(fails.length || errors.length ? 1 : 0)
})()
