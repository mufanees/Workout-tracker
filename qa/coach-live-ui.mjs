// Browser walk of the coach during a workout: start a routine, tick a set, open the floating coach,
// ask for more time. A stand-in Gemini reads WORKOUT IN PROGRESS and answers with adjust_workout
// (longer budget, a swap on the exercise already started, an added exercise, one more set). Apply
// changes only this session: sets already done stay, the routine itself is unchanged.
// npm run build && node qa/coach-live-ui.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

let seen = ''
const gemini = http
  .createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const body = JSON.parse(raw)
    seen = JSON.stringify(body.systemInstruction || '')
    const last = body.contents.at(-1).parts[0]
    // exercise names from the context: "  1. Goblet Squat [superset A] ..."
    const names = [...seen.matchAll(/\\n\s+\d+\. ([^[:;\\]+?)(?: \[| target|, rest|: done)/g)].map((m) => m[1].trim())
    const part = last.functionResponse
      ? { text: 'Done: **45 min** total. Apply it and keep going.' }
      : {
          functionCall: {
            name: 'adjust_workout',
            args: {
              reason: 'Uses the extra 10 minutes on the main lifts',
              budget_minutes: 45,
              swaps: [{ from: names[0], to: 'Dumbbell Romanian Deadlift', reps: '8-10', weight_kg: 14 }],
              add: [{ name: 'Hammer Curl', sets: 2, reps: '10-12', weight_kg: 8, after: names[1] }],
              changes: [{ exercise: names[1], sets: 4, weight_kg: 12 }],
            },
          },
        }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }] })}\n\n`)
  })
  .listen(0)
await new Promise((r) => gemini.once('listening', r))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-live-'))
const PORT = 3700 + Math.floor(Math.random() * 200)
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, APP_TOKEN: 'k', GEMINI_API_KEY: 'fake', GEMINI_BASE_URL: `http://127.0.0.1:${gemini.address().port}`, BACKUP_DAYS: '0' }
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100))
const base = `http://127.0.0.1:${PORT}`
const shots = 'qa/shots-coach-live'
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
  const db = (store, k) =>
    p.evaluate(
      async ([store, k]) => {
        const r = indexedDB.open('reps')
        return await new Promise((res) => (r.onsuccess = () => { const q = r.result.transaction(store).objectStore(store).get(k); q.onsuccess = () => res(q.result) }))
      },
      [store, k],
    )
  await p.goto(base + '/#/train')
  await p.locator('.btn-lg:has-text("Start")').first().click()
  await p.waitForFunction(() => location.hash.startsWith('#/live'), null, { timeout: 5000 })
  await wait(1200)
  const before = await db('meta', 'active')
  // tick the first working set of the first exercise
  await p.evaluate(async () => {
    const r = indexedDB.open('reps')
    const db = await new Promise((res) => (r.onsuccess = () => res(r.result)))
    const w = await new Promise((res) => { const q = db.transaction('meta').objectStore('meta').get('active'); q.onsuccess = () => res(q.result) })
    const s = w.exercises[0].sets.find((x) => x.kind !== 'warmup')
    Object.assign(s, { done: true, weight: 12, reps: 10 })
    await new Promise((res) => { const t = db.transaction('meta', 'readwrite'); t.objectStore('meta').put(w, 'active'); t.oncomplete = res })
  })
  await p.reload()
  await p.waitForSelector('.coach-fab', { timeout: 8000 })
  check('coach button floats on the workout', await p.locator('.coach-fab').isVisible())
  await p.screenshot({ path: `${shots}/1-live.png` })
  await p.click('.coach-fab')
  await p.waitForSelector('.sheet .coach-fab-asks', { timeout: 5000 })
  await wait(400)
  await p.screenshot({ path: `${shots}/2-sheet.png` })
  await p.click('.sheet .chip:has-text("10 more minutes")')
  await p.locator('.sheet .proposal button:has-text("Apply")').waitFor({ timeout: 15000 })
  await wait(500)
  check('coach sees the workout in progress', /WORKOUT IN PROGRESS/.test(seen) && /1 of \d+ working sets done/.test(seen), seen.match(/WORKOUT IN PROGRESS[^"]{0,200}/)?.[0])
  const card = await p.textContent('.sheet .proposal')
  check('card lists the changes', /Change today/.test(card) && /45 min/.test(card) && /Hammer Curl/.test(card), card.slice(0, 120))
  await p.screenshot({ path: `${shots}/3-proposal.png` })
  await p.click('.sheet .proposal button:has-text("Apply")')
  await p.waitForSelector('.sheet .proposal-state', { timeout: 5000 })
  await wait(400)
  const after = await db('meta', 'active')
  const ex = await p.evaluate(async () => {
    const r = indexedDB.open('reps')
    const db = await new Promise((res) => (r.onsuccess = () => res(r.result)))
    return await new Promise((res) => { const q = db.transaction('exercises').objectStore('exercises').getAll(); q.onsuccess = () => res(Object.fromEntries(q.result.map((e) => [e.id, e.name]))) })
  })
  const names = after.exercises.map((e) => ex[e.exerciseId])
  check('budget is 45 min', after.timePlan?.budget === 45 && after.timePlan.fixed, String(after.timePlan?.budget))
  check('started exercise keeps its done set', after.exercises[0].exerciseId === before.exercises[0].exerciseId && after.exercises[0].sets.length === 1 && after.exercises[0].sets[0].done)
  check('the swap takes the sets that were left', names[1] === 'Dumbbell Romanian Deadlift' && after.exercises[1].sets.every((s) => !s.done && s.cw === 14 && s.cr === 8), names.join(', '))
  const second = after.exercises.find((e) => e.exerciseId === before.exercises[1].exerciseId)
  check('one more set with the new weight', second && second.sets.filter((s) => s.kind !== 'warmup').length === 4 && second.sets.every((s) => s.done || s.kind === 'warmup' || s.cw === 12))
  check('hammer curl added after it', names[after.exercises.indexOf(second) + 1] === 'Hammer Curl', names.join(', '))
  const routine = await db('routines', before.routineId)
  check('the routine is unchanged', routine.exercises.length === before.exercises.length && routine.exercises[0].exerciseId === before.exercises[0].exerciseId)
  await p.locator('.sheet .proposal').screenshot({ path: `${shots}/4-applied.png` })
  await p.click('.sheet .icon-btn[aria-label="Close"]')
  await wait(500)
  await p.screenshot({ path: `${shots}/5-live-after.png` })
  const live = await p.evaluate(() => document.body.innerText)
  check('live screen shows the new exercises', /Hammer Curl/.test(live) && /Dumbbell Romanian Deadlift/.test(live) && /of 45 min/.test(live))
  await p.goto(base + '/#/coach')
  await wait(800)
  check('same conversation on the Coach tab', /Applied/.test(await p.evaluate(() => document.body.innerText)))
} catch (e) {
  results.push('ERROR ' + e.message.split('\n')[0])
}
console.log(results.join('\n'))
await browser.close()
srv.kill()
gemini.close()
