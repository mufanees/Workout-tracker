// Cardio session walkthrough: first-time setup sheet, warm-up grace (no nag), main in and out of
// zone 2, live time in every zone, cool-down stretches with a line timer, the summary. Portrait
// 390×844 and landscape 844×390 / 740×360. A fake Bluetooth strap sends whatever window.__hr says;
// page.clock runs the minutes by.
// Run on a fresh DATA_DIR: PORT=3500 node qa/walk-cardio.cjs
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const PORT = process.env.PORT || 3000
const BASE = `http://localhost:${PORT}`
const OUT = __dirname + '/shots-cardio/'
require('fs').mkdirSync(OUT, { recursive: true })

const PORTRAIT = { width: 390, height: 844 }
const LAND = { width: 844, height: 390 }
const LAND_SMALL = { width: 740, height: 360 }

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const ctx = await browser.newContext({ viewport: PORTRAIT, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: process.env.SCHEME || 'dark' })
  await ctx.addInitScript(() => {
    localStorage.setItem('reps-token', 'testkey')
    window.__hr = 100
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
  await page.clock.install()
  const errors = []
  const fails = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()))
  const check = (ok, what) => (ok ? console.log('ok  ', what) : (fails.push(what), console.log('FAIL', what)))
  const shot = async (n, full) => {
    await page.waitForTimeout(450)
    await page.screenshot({ path: OUT + n + '.png', fullPage: !!full })
  }
  const all = async (n) => {
    await shot(n + '-portrait')
    await page.setViewportSize(LAND)
    await shot(n + '-landscape')
    await page.setViewportSize(LAND_SMALL)
    await shot(n + '-landscape-360')
    await page.setViewportSize(PORTRAIT)
  }
  const hr = (v) => page.evaluate((x) => (window.__hr = x), v)
  const run = (t) => page.clock.runFor(t)
  const text = (sel) => page.locator(sel).first().innerText()
  const noScroll = async (label) => {
    const over = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight)
    check(over <= 1, `${label}: no page scroll in landscape (overflow ${over}px)`)
  }

  await page.goto(BASE + '/')
  await page.waitForSelector('.page-head')
  await page.waitForTimeout(1500)
  check((await text('.cardio-quick')).includes('Cardio'), 'new person: quick start says Cardio')
  await shot('01-train-new')
  await page.locator('.quick-starts').screenshot({ path: OUT + '01b-quick-start-new.png' })

  await page.locator('.cardio-quick .cq-main').tap()
  await page.waitForSelector('.sheet')
  check(await page.locator('.sheet-foot .btn-primary').isDisabled(), 'setup sheet: Start waits for an activity')
  await page.locator('.sheet .chip', { hasText: 'Elliptical' }).tap()
  await shot('02-setup-sheet')
  check((await text('.sheet-foot .btn-primary')).includes('Elliptical · zone 2'), 'setup sheet: Start Elliptical · zone 2')
  await page.locator('.sheet-foot .btn-primary').tap()
  await page.waitForSelector('.cardio')
  check((await page.locator('.tabbar').count()) === 0, 'no tab bar on the session')
  await page.locator('.cardio .hr-connect').tap()
  await run(4000)
  await page.waitForTimeout(300)

  // warm-up at 100 bpm: below zone 2, but no nag
  await run('02:00')
  check((await text('.cd-status')).includes('Warming up · zone alerts from 5:00'), 'warm-up: says alerts start at 5:00')
  check((await page.locator('.cardio.alert').count()) === 0, 'warm-up: no alert')
  await all('03-warmup')
  await page.setViewportSize(LAND)
  await noScroll('warm-up')
  await page.setViewportSize(PORTRAIT)

  // warm-up hands over to main by itself; HR comes up into zone 2
  await hr(118)
  await run('02:50')
  await hr(132)
  await run('01:30')
  check(/elliptical/i.test(await text('.cardio-steps li.on')), 'main starts on its own after 5 min')
  check((await text('.cd-status')).includes('In zone 2'), 'main: in zone')
  await all('04-main-in-zone')

  // drop out of zone: alert after 15 s
  await hr(106)
  await run('00:25')
  check((await page.locator('.cardio.alert').count()) === 1, 'main below zone: alert shows')
  check((await text('.cd-status')).includes('Pick it up'), 'main below zone: pick it up')
  await all('05-main-below')
  await hr(152)
  await run('00:25')
  check((await text('.cd-status')).includes('Ease off'), 'main above zone: ease off')
  await shot('06-main-above-portrait')
  await hr(134)
  await run('03:00')
  check((await page.locator('.cardio.alert').count()) === 0, 'back in zone: alert clears')
  const cells = await page.locator('.cardio-zones .zb-cells li b').allInnerTexts()
  check(cells.filter((c) => c !== '0:00').length >= 3, 'zone breakdown has time in 3+ zones: ' + cells.join(' '))
  await all('07-zone-breakdown')
  await page.setViewportSize(LAND_SMALL)
  await noScroll('main 360')
  await page.setViewportSize(PORTRAIT)

  // cool-down: stretches with per-line timers that roll on
  await page.locator('.cardio-action', { hasText: 'Cool down' }).tap()
  await hr(112)
  await run('00:05')
  check((await page.locator('.cardio-stretches .cs-row').count()) === 5, 'cool-down: 5 stretches')
  await all('08-cooldown')
  await page.locator('.cs-row').first().locator('.cs-timer').tap()
  await run('00:12')
  check((await page.locator('.cs-row.timing').count()) === 1, 'stretch timer running on its line')
  await all('09-stretch-timer')
  for (const [vp, name] of [[LAND, '844×390'], [LAND_SMALL, '740×360']]) {
    await page.setViewportSize(vp)
    await page.waitForTimeout(300)
    await noScroll('cool-down ' + name)
    const fits = await page.evaluate(() => {
      const list = document.querySelector('.cardio-stretches ul')
      const last = [...document.querySelectorAll('.cs-row')].pop()
      return last.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1 && list.scrollHeight <= list.clientHeight + 1
    })
    check(fits, `cool-down ${name}: all 5 stretches visible without scrolling`)
  }
  await page.setViewportSize(PORTRAIT)
  await run('00:55')
  check((await page.locator('.cs-row').first().getAttribute('class')).includes('on'), 'first stretch ticked when its timer ran out')
  check((await page.locator('.cs-row').nth(1).getAttribute('class')).includes('timing'), 'next stretch timer started on its own')
  await shot('10-stretch-next-portrait')

  // settings sheet from the session
  await page.locator('.cardio-head .icon-btn[aria-label="Session settings"]').tap()
  await page.waitForSelector('.sheet')
  await shot('11-session-sheet')
  await page.locator('.sheet-head .icon-btn').tap()
  await page.waitForTimeout(400)

  await run('01:00')
  await page.locator('.cardio-action .btn-primary', { hasText: 'Finish' }).tap()
  await page.waitForSelector('.hr-card')
  await page.waitForTimeout(1500)
  check(/warm-up/i.test(await text('.cp-row')), 'summary shows the three parts')
  await shot('12-summary', true)
  await run('00:20')
  await page.waitForTimeout(1500)
  const synced = await page.evaluate(async () => {
    const r = await fetch('/api/sync', { method: 'POST', headers: { authorization: 'Bearer testkey', 'content-type': 'application/json' }, body: JSON.stringify({ since: 0, changes: [] }) })
    const j = await r.json()
    const w = j.changes.find((c) => c.store === 'workouts' && c.data && c.data.cardio)
    return w ? w.data.cardio : null
  })
  check(!!synced && synced.mainStart && synced.cooldownStart && synced.stretches.length === 5, 'saved workout carries its cardio timeline: ' + JSON.stringify(synced && { mainStart: !!synced.mainStart, cooldownStart: !!synced.cooldownStart }))

  // Train remembers the choice
  await page.goto(BASE + '/#/train')
  await page.waitForTimeout(1200)
  check((await text('.cardio-quick')).includes('Elliptical'), 'quick start remembers Elliptical')
  await page.locator('.quick-starts').screenshot({ path: OUT + '13-quick-start-remembered.png' })

  // the strength panel: zone breakdown + grace with a target zone
  await page.locator('.quick-starts button', { hasText: 'Empty workout' }).tap()
  await page.waitForSelector('.live')
  await page.evaluate(() => 0)
  await hr(100)
  await run('00:30')
  if (await page.locator('.hr-connect').count()) await page.locator('.hr-connect').tap()
  await run('00:40')
  await page.locator('.hr-panel .tag-btn').tap()
  await page.locator('.action-list .action', { hasText: 'Zone 2' }).first().tap()
  await run('00:30')
  check((await text('.hr-panel')).includes('zone alerts from 5:00'), 'strength with a target: grace line')
  check((await page.locator('.hr-alert').count()) === 0, 'strength in grace: no alert')
  await shot('14-strength-panel')

  console.log(errors.join('\n') || 'no errors')
  console.log(fails.length ? `${fails.length} FAILED` : 'all checks passed')
  await browser.close()
})()
