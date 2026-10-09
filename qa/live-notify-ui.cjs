// Browser check of the live notifications (src/liveNotify.ts, src/sw.js): fasting and heart rate in
// the notification list, throttling, zone alerts, hidden/visible rules, the service worker's push
// path, and the drawn badge/icon images (screenshots in qa/shots-notify/).
//
//   npx vite build --outDir <dir>/dist-notify
//   DIST_DIR=<dir>/dist-notify PORT=3600 node qa/live-notify-ui.cjs
//
// It builds a small test bundle (qa/live-notify-entry.ts) into DIST_DIR/qa-live and starts its own
// server with a fresh data dir. Headless Chromium keeps notifications in a list (nothing is drawn),
// so this checks what the app asks for, not how Android shows it.
// lets page routes see the service worker's own fetches (for the stand-in inbox below)
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DIST = process.env.DIST_DIR
if (!DIST) throw new Error('Set DIST_DIR to a vite build')
const PORT = Number(process.env.PORT || 3600)
const OUT = path.join(__dirname, 'shots-notify')
fs.mkdirSync(OUT, { recursive: true })
const H = 3600000
const M = 60000
let fails = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) fails++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const { build } = await import(path.join(ROOT, 'node_modules/vite/dist/node/index.js'))
  await build({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    publicDir: false,
    build: {
      outDir: path.join(DIST, 'qa-live'),
      emptyOutDir: true,
      target: 'es2022',
      minify: false,
      rollupOptions: { input: path.join(__dirname, 'live-notify-entry.ts'), output: { entryFileNames: 'entry.js', format: 'es' } },
    },
  })
  fs.writeFileSync(path.join(DIST, 'qa-live', 'blank.html'), '<!doctype html><meta charset=utf-8><title>qa</title><body style="background:#111"></body>')

  const data = fs.mkdtempSync(path.join(process.env.SCRATCH || os.tmpdir(), 'gloop-live-ui-'))
  const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: data, APP_TOKEN: 'testkey', DIST_DIR: DIST, BACKUP_DAYS: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  srv.stdout.on('data', (d) => (log += d))
  srv.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 50 && !log.includes('listening'); i++) await sleep(100)
  const base = `http://127.0.0.1:${PORT}`

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
    await ctx.grantPermissions(['notifications'], { origin: base })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log('pageerror', e.message))
    await page.goto(base + '/qa-live/blank.html')
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.addScriptTag({ url: '/qa-live/entry.js', type: 'module' })
    await page.waitForFunction(() => window.__t)
    check('permission granted in the page', (await page.evaluate(() => Notification.permission)) === 'granted')

    const list = () =>
      page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready
        return (await reg.getNotifications()).map((n) => ({
          tag: n.tag,
          title: n.title,
          body: n.body,
          silent: n.silent,
          renotify: n.renotify,
          vibrate: n.vibrate ? [...n.vibrate] : [],
          badge: n.badge,
          icon: n.icon,
          data: n.data,
        }))
      })
    const byTag = async (tag) => (await list()).find((n) => n.tag === tag) || null
    const setHidden = (h) =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') })
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
        document.dispatchEvent(new Event('visibilitychange'))
      }, h)

    // ---- fasting ----
    await page.evaluate(async () => {
      await __t.init()
      __t.live.startLiveNotifications()
    })
    await page.evaluate((s) => __t.startFast(s, 18), Date.now() - (14 * H + 20 * M))
    await sleep(1200)
    let f = await byTag('gloop-fast')
    check('fast notification shown', !!f)
    check('fast title', /^Fasting 14h 2\dm · 18:6$/.test(f?.title), f?.title)
    check('fast body', /^Goal at .+ · 3h 3\dm to go$/.test(f?.body), f?.body)
    check('fast is silent, no renotify', f?.silent === true && f?.renotify === false)
    check('fast badge is a drawn PNG', /^data:image\/png;base64,/.test(f?.badge || ''), (f?.badge || '').slice(0, 30))
    check('fast icon is a drawn PNG', /^data:image\/png;base64,/.test(f?.icon || ''))
    check('fast click opens /fast', f?.data?.path === '/fast')
    const fastBadge = f?.badge
    const fastIcon = f?.icon

    await setHidden(true)
    await sleep(500)
    check('fast stays while hidden', !!(await byTag('gloop-fast')))

    // ---- heart rate ----
    await setHidden(false)
    const hr = (s) => page.evaluate((s) => __t.live.liveHR(s), s)
    await hr({ bpm: 142, zone: 2, inZone: true, elapsedSec: 1420, phase: 'Main', target: 2 })
    await sleep(600)
    check('HR not shown while Gloop is on screen (default)', !(await byTag('gloop-live-hr')))
    await setHidden(true)
    await sleep(800)
    let h = await byTag('gloop-live-hr')
    check('HR shown once hidden', h?.title === '142 bpm · Zone 2', h?.title)
    check('HR body in zone', h?.body === 'In zone · 23:40 · Main', h?.body)
    check('HR silent', h?.silent === true && h?.renotify === false)
    check('HR badge drawn', /^data:image\/png/.test(h?.badge || ''))
    check('HR click opens /live', h?.data?.path === '/live')
    const hrBadge = h?.badge
    const hrIcon = h?.icon

    await hr({ bpm: 143, zone: 2, inZone: true, elapsedSec: 1421, phase: 'Main', target: 2 })
    await sleep(400)
    check('throttled: same zone within 5 s waits', (await byTag('gloop-live-hr'))?.title === '142 bpm · Zone 2')
    await sleep(5000)
    check('trailing update after 5 s', (await byTag('gloop-live-hr'))?.title === '143 bpm · Zone 2', (await byTag('gloop-live-hr'))?.title)
    await hr({ bpm: 118, zone: 1, inZone: false, elapsedSec: 1430, phase: 'Main', target: 2 })
    await sleep(500)
    h = await byTag('gloop-live-hr')
    check('zone change shows at once', h?.title === '118 bpm · Zone 1', h?.title)
    check('below-zone body', h?.body === 'Below zone 2 · pick it up · 23:50', h?.body)
    await sleep(5200)
    await hr({ bpm: 160, zone: 3, inZone: false, elapsedSec: 1440, phase: 'Main', target: 2 })
    await sleep(500)
    check('above-zone body', (await byTag('gloop-live-hr'))?.body === 'Above zone 2 · ease off · 24:00')
    await hr({ bpm: null, zone: null, inZone: null, elapsedSec: 1445, phase: 'Main', target: 2 })
    await sleep(500)
    check('no signal title', (await byTag('gloop-live-hr'))?.title === 'Heart rate · no signal')

    // zone alert
    await page.evaluate(() => __t.live.zoneAlert('Below zone 2. Pick it up a little.'))
    await sleep(500)
    let a = await byTag('gloop-zone-alert')
    check('zone alert while hidden', a?.title === 'Below zone 2. Pick it up a little.', a?.title)
    check('zone alert buzzes', a?.silent === false && a?.renotify === true && a?.vibrate.length > 0, JSON.stringify(a?.vibrate))
    await page.evaluate(async () => {
      for (const n of await (await navigator.serviceWorker.ready).getNotifications({ tag: 'gloop-zone-alert' })) n.close()
      __t.live.zoneAlert('Again')
    })
    await sleep(500)
    check('zone alert at most once a minute', !(await byTag('gloop-zone-alert')))

    // back on screen: HR and alert go, fast stays
    await page.evaluate(() => __t.live.zoneAlert('x')) // still throttled; harmless
    await setHidden(false)
    await sleep(600)
    check('on screen: HR closed', !(await byTag('gloop-live-hr')))
    check('on screen: fast stays', !!(await byTag('gloop-fast')))
    await page.evaluate(() => __t.live.zoneAlert('Visible alert'))
    await sleep(300)
    check('no zone alert while on screen', !(await byTag('gloop-zone-alert')))

    // the "while on screen" setting
    await page.evaluate(() => __t.saveSettings({ liveHRVisible: true }))
    await hr({ bpm: 130, zone: 2, inZone: true, elapsedSec: 1500, phase: 'Main', target: 2 })
    await sleep(600)
    check('liveHRVisible shows it on screen', (await byTag('gloop-live-hr'))?.title === '130 bpm · Zone 2')
    await page.evaluate(() => __t.saveSettings({ liveHR: false }))
    await sleep(600)
    check('liveHR off closes it', !(await byTag('gloop-live-hr')))
    await page.evaluate(() => __t.saveSettings({ liveHR: true, liveHRVisible: false }))
    await hr(null)
    await sleep(400)
    check('liveHR(null) leaves nothing', !(await byTag('gloop-live-hr')))

    // fast switch and ending
    await page.evaluate(() => __t.saveSettings({ liveFast: false }))
    await sleep(600)
    check('liveFast off closes it', !(await byTag('gloop-fast')))
    await page.evaluate(() => __t.saveSettings({ liveFast: true }))
    await sleep(800)
    check('liveFast on shows it again', !!(await byTag('gloop-fast')))
    await page.evaluate(() => __t.endFast(__t.fasts.value.find((x) => x.end == null)))
    await sleep(800)
    check('ending the fast closes it', !(await byTag('gloop-fast')))

    // ---- service worker push path (app's text not involved): stand-in inbox + CDP push ----
    const start = Date.now() - (16 * H + 3 * M)
    await ctx.route('**/api/push/inbox', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ messages: [{ title: 'stale', body: 'stale', tag: 'gloop-fast', data: { kind: 'fast', start, goal: 16, label: '16:8' } }] }),
      }),
    )
    const cdp = await ctx.newCDPSession(page)
    let regId = null
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => {
      for (const r of e.registrations) if (!r.isDeleted) regId = r.registrationId
    })
    await cdp.send('ServiceWorker.enable')
    for (let i = 0; i < 20 && !regId; i++) await sleep(100)
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: base, registrationId: regId, data: '' })
    await sleep(1500)
    f = await byTag('gloop-fast')
    check('push: worker shows the fast', !!f)
    check('push: worker writes current text', /^Fasting 16h 0\dm · 16:8$/.test(f?.title) && /^Goal reached at .+ · \+0h 0\dm$/.test(f?.body), `${f?.title} / ${f?.body}`)
    check('push: worker draws badge (OffscreenCanvas)', /^data:image\/png/.test(f?.badge || ''), (f?.badge || '').slice(0, 30))
    check('push: silent', f?.silent === true)
    const swBadge = f?.badge
    const swIcon = f?.icon
    await ctx.unroute('**/api/push/inbox')

    // ---- images: how legible are the digits at status-bar size ----
    const imgs = await page.evaluate(async () => {
      const L = __t.live
      const out = {}
      for (const v of [142, 98, 176, '--', 14, 9]) out['b' + v] = await L.badgeFor(v)
      out.i142 = await L.iconFor(142, 'ZONE 2', '#c6f432')
      out.i176 = await L.iconFor(176, 'ZONE 5', '#ff5a5a')
      return out
    })
    const sheet = await ctx.newPage()
    const all = { ...imgs, fastBadge, fastIcon, hrBadge, hrIcon, swBadge, swIcon }
    const row = (k, sizes) =>
      `<div class=row><code>${k}</code>${sizes.map((s) => `<span><img src="${all[k]}" style="width:${s}px;height:${s}px"><i>${s}px</i></span>`).join('')}</div>`
    const badgeKeys = ['b142', 'b98', 'b176', 'b--', 'b14', 'b9', 'fastBadge', 'hrBadge', 'swBadge']
    await sheet.setViewportSize({ width: 420, height: 900 })
    await sheet.setContent(`<style>
      body{margin:0;padding:16px;background:#000;color:#aaa;font:12px system-ui}
      .row{display:flex;align-items:center;gap:16px;margin:8px 0}
      code{width:80px}
      span{display:flex;flex-direction:column;align-items:center;gap:2px}
      i{font-size:10px;color:#666}
      .bar{display:flex;gap:6px;align-items:center;background:#1b1b1f;padding:6px 10px;border-radius:8px;margin:12px 0}
      .bar img{width:24px;height:24px}
      .bar b{color:#fff;font:600 14px system-ui;margin-right:auto}
      .light{background:#e8eaef}
      .light img{filter:invert(1)}
    </style>
    <h3 style="color:#fff">Badges (status bar icon, white on transparent)</h3>
    ${badgeKeys.map((k) => row(k, [24, 48, 96])).join('')}
    <h3 style="color:#fff">Mock status bar at 24px</h3>
    <div class=bar><b>9:41</b><img src="${all.b142}"><img src="${all.b14}"><img src="${all.b98}"></div>
    <div class="bar light"><b style="color:#000">9:41</b><img src="${all.b142}"><img src="${all.b14}"><img src="${all.b98}"></div>
    <h3 style="color:#fff">Large icons</h3>
    ${['i142', 'i176', 'fastIcon', 'swIcon'].map((k) => row(k, [40, 64, 96])).join('')}`)
    await sleep(300)
    await sheet.screenshot({ path: path.join(OUT, 'badges-dpr2.png'), fullPage: true })
    // the same at 1x (a low-density worst case) and 3x (typical Android phone)
    for (const dpr of [1, 3]) {
      const p = await (await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: 420, height: 900 } })).newPage()
      await p.setContent(await sheet.content())
      await sleep(200)
      await p.screenshot({ path: path.join(OUT, `badges-dpr${dpr}.png`), fullPage: true })
    }
    for (const k of ['b142', 'b14', 'i142', 'fastIcon']) fs.writeFileSync(path.join(OUT, k + '.png'), Buffer.from(all[k].split(',')[1], 'base64'))

    // ---- the Settings rows in the real app ----
    // a fresh context (the test bundle above shares IndexedDB with the app; keep them apart)
    const actx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
    await actx.grantPermissions(['notifications'], { origin: base })
    await actx.addInitScript(() => localStorage.setItem('reps-token', 'testkey'))
    const app = await actx.newPage()
    app.on('pageerror', (e) => console.log('app pageerror', e.message))
    await app.goto(base + '/#/settings')
    await app.locator('h2.section-title', { hasText: 'Notifications' }).waitFor({ state: 'attached', timeout: 15000 }).catch(async () => {
      await app.screenshot({ path: path.join(OUT, 'settings-fail.png') })
    })
    await app.locator('h2.section-title', { hasText: 'Notifications' }).scrollIntoViewIfNeeded()
    await sleep(800)
    const row1 = app.locator('text=Fasting in the notification shade').first()
    check('Settings shows the fasting switch', (await row1.count()) > 0)
    check('Settings shows the heart rate switch', (await app.locator('text=Heart rate in the notification shade').count()) > 0)
    await app.screenshot({ path: path.join(OUT, 'settings.png') })
  } catch (e) {
    console.error(e)
    fails++
  } finally {
    await browser.close()
    srv.kill()
  }
  console.log(fails ? `\n${fails} failed` : '\nall passed')
  process.exit(fails ? 1 : 0)
})()
