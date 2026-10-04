// Browser walk of the coach's mobility plan: a stand-in Gemini proposes a week, the athlete
// approves it in the chat, Train shows today's card, a routine's warm-up and cool-down pick up the
// add-ons (the routine itself unchanged), and today's standalone session starts with its moves.
// npm run build && node qa/mobility-ui.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (n) => key(new Date(Date.now() + n * 86400000))
const PLAN = {
  scope: 'week',
  summary: 'Shoulder prep on lifting days, a hips and upper-back session on rest days.',
  days: [
    { date: day(0), intensity: 'hard', focus: 'shoulder prep before pressing', warmup: ['Wall Slide × 10', 'Isometric External Rotation · 30 s × 3'], cooldown: ['Doorway Pec Stretch · 30 s / side'], session: { name: 'Mobility · evening reset', minutes: 10, moves: [{ name: 'Thoracic Open Book', sets: 1, reps: 8, cue: 'Follow the hand with your eyes' }, { name: '90/90 Hip Switch', sets: 2, reps: 8 }, { name: 'Half-Kneeling Hip Flexor Stretch', sets: 2, seconds: 30, cue: 'Squeeze the glute' }] } },
    { date: day(1), intensity: 'rest', focus: 'hips and upper back', session: { name: 'Mobility · hips', minutes: 15, moves: [{ name: 'Cat-Cow', reps: 10 }] } },
    { date: day(2), intensity: 'moderate', warmup: ['Cat-Cow × 8'], cooldown: ['Figure-4 Glute Stretch · 30 s / side'] },
  ],
}
const gemini = http
  .createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const body = JSON.parse(raw)
    const last = body.contents.at(-1).parts[0]
    const part = last.functionResponse ? { text: 'Built into your week. Approve it and it shows on Train.' } : { functionCall: { name: 'propose_mobility_plan', args: PLAN } }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }] })}\n\n`)
  })
  .listen(0)
await new Promise((r) => gemini.once('listening', r))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-mob-'))
const PORT = 3700 + Math.floor(Math.random() * 200)
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, APP_TOKEN: 'k', GEMINI_API_KEY: 'fake', GEMINI_BASE_URL: `http://127.0.0.1:${gemini.address().port}`, BACKUP_DAYS: '0' }
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100))
const base = `http://127.0.0.1:${PORT}`
const shots = 'qa/shots-mobility'
fs.mkdirSync(shots, { recursive: true })
const results = []
const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(() => localStorage.setItem('reps-token', 'k'))
  const p = await ctx.newPage()
  p.on('pageerror', (e) => results.push('PAGEERROR ' + e.message))
  await p.goto(base + '/#/coach')
  await p.waitForSelector('textarea, input[placeholder="Ask your coach"]', { timeout: 10000 })
  await p.fill('textarea, input[placeholder="Ask your coach"]', 'Can you build shoulder and hip mobility into my week?')
  await p.keyboard.press('Enter')
  await p.waitForSelector('.proposal button:has-text("Approve")', { timeout: 15000 })
  const card = await p.textContent('.proposal')
  check('proposal shows the week', /Mobility this week/.test(card) && /Wall Slide/.test(card) && /rest/.test(card), card.slice(0, 80))
  await wait(400)
  await p.locator('.proposal').screenshot({ path: `${shots}/1-proposal.png` })
  await p.click('.proposal button:has-text("Approve")')
  await p.waitForSelector('.proposal-state', { timeout: 5000 })
  check('approved', /Approved/.test(await p.textContent('.proposal-state')))

  await p.goto(base + '/#/train')
  await p.waitForSelector('.mobility-card', { timeout: 8000 })
  const t = await p.textContent('.mobility-card')
  check('Train card shows today', /Hard day/.test(t) && /In your warm-up/.test(t) && /Start 10 min/.test(t), t.slice(0, 100))
  await p.click('.mob-toggle')
  await wait(300)
  check('week view lists the days', (await p.$$('.mob-week li')).length === 3)
  await p.locator('.mobility-card').scrollIntoViewIfNeeded()
  await wait(600)
  await p.locator('.mobility-card').screenshot({ path: `${shots}/2-train-card.png` })

  // Start the standalone session
  await p.click('.mobility-card .btn-primary')
  await p.waitForFunction(() => location.hash.startsWith('#/live'), null, { timeout: 5000 })
  await wait(1200)
  const live = await p.evaluate(() => document.body.innerText)
  check('session starts with its moves', /Thoracic Open Book/.test(live) && /90\/90 Hip Switch/.test(live) && /Half-Kneeling Hip Flexor Stretch/.test(live))
  await p.screenshot({ path: `${shots}/3-session.png` })
  const active = await p.evaluate(async () => {
    const r = indexedDB.open('reps')
    return await new Promise((res) => (r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').get('active'); q.onsuccess = () => res(q.result) }))
  })
  check('session tagged with the plan day', active?.mobility && active.exercises.length === 3, JSON.stringify({ m: active?.mobility, n: active?.exercises?.length }))

  // Discard it and start today's planned routine from Train: the add-ons join its warm-up and cool-down
  const db = (store, k) =>
    p.evaluate(
      async ([store, k]) => {
        const r = indexedDB.open('reps')
        return await new Promise((res) => (r.onsuccess = () => { const q = r.result.transaction(store).objectStore(store).get(k); q.onsuccess = () => res(q.result) }))
      },
      [store, k],
    )
  // throw away the running session (as if discarded) so Train offers today's routine again
  await p.evaluate(async () => {
    const r = indexedDB.open('reps')
    await new Promise((res) => (r.onsuccess = () => { const t = r.result.transaction('meta', 'readwrite'); t.objectStore('meta').delete('active'); t.oncomplete = res }))
  })
  await p.goto(base + '/#/train')
  await p.reload()
  await wait(1500)
  await p.locator('.btn-lg:has-text("Start")').first().click()
  const discard = p.locator('button:has-text("Discard & start")')
  await wait(500)
  if (await discard.count()) await discard.click()
  await p.waitForFunction(() => location.hash.startsWith('#/live'), null, { timeout: 5000 })
  await wait(1200)
  const a2 = await db('meta', 'active')
  const rid = await db('routines', a2.routineId)
  check('routine warm-up gets the add-ons', a2.warmup.includes('Wall Slide × 10') && a2.warmup.length === (rid.warmup?.length || 0) + 2, `${rid.warmup?.length} → ${a2.warmup.length}`)
  check('add-ons come before the ramp-up set', /ramp-?up/i.test(a2.warmup.at(-1)) || !(rid.warmup || []).some((l) => /ramp-?up/i.test(l)), a2.warmup.at(-1))
  check('cool-down gets the add-on', a2.cooldown.includes('Doorway Pec Stretch · 30 s / side'))
  check('the routine itself is unchanged', !(rid.warmup || []).includes('Wall Slide × 10'), rid.name)
  const head = p.locator('.checklist').first()
  await head.scrollIntoViewIfNeeded()
  await p.screenshot({ path: `${shots}/4-routine-warmup.png` })
} catch (e) {
  results.push('ERROR ' + e.message.split('\n')[0])
}
console.log(results.join('\n'))
await browser.close()
srv.kill()
gemini.close()
