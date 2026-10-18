// Browser walk of a coach program adjustment: the athlete approves a program, does Day 1 and Day 2,
// then the coach adjusts it (renamed, same days). Train must carry on at Day 3 in the same week,
// not restart at Day 1. Also repairs data already reset by the old behaviour (new routine ids,
// start moved to today), and screenshots the structured program card and a sectioned reply.
// npm run build && node qa/program-adjust-ui.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const day = (name, list) => ({ name, exercises: list.map(([n, sets, reps, superset, notes]) => ({ name: n, sets, reps, superset, notes })) })
const program = (name) => ({
  name,
  days_per_week: 3,
  minutes: 35,
  summary: 'Rebuilt for no bench and adjustable dumbbells: each superset uses one weight. Supersets 1 and 2 fit 25 min; on 35-min days add a 3rd round of superset 1 and do superset 3.',
  routines: [
    day('Day 1 · Full Body', [
      ['Goblet Squat', 2, '8-10', 1, '12 kg. 3rd round on 35-min days'],
      ['Bent-Over Dumbbell Row', 2, '6-8', 1, '12 kg per hand, same as squat. 3rd round on 35-min days'],
      ['Dumbbell Floor Press', 2, '8-10', 2, '12 kg per hand, neutral grip'],
      ['Dumbbell Romanian Deadlift', 2, '8-10', 2, '12 kg per hand, same as press'],
      ['Rear Delt Fly', 2, '12-15', 3, '35-min days only. Light, ~4 kg'],
      ['Dead Bug', 2, '8 / side', 3, '35-min days only'],
    ]),
    day('Day 2 · Full Body', [
      ['Farmer Squat', 2, '8-10', 1, '10 kg per hand. 3rd round on 35-min days'],
      ['Dumbbell Shoulder Press', 2, '6-8', 1, '10 kg, seated, 2 reps in reserve'],
      ['Hammer Curl', 2, '10-12', 3, '35-min days only. ~8 kg'],
    ]),
    day('Day 3 · Full Body', [
      ['Dumbbell Step Ups', 2, '8 / side', 1, '10 kg per hand, bottom stair or sturdy step'],
      ['Prone Y-T Raise', 2, '8 each', 3, '35-min days only. No weight'],
    ]),
  ],
})
const REPLY = `I've rebuilt Phase 1 so the exercises change with the time you have, not just the sets. Tap **Approve** to use it.

### How it scales
- **25-min day:** supersets 1 and 2, 2 rounds each.
- **35-min day:** add a 3rd round of superset 1, then superset 3.

### Weights
- **Day 1:** Goblet Squat + Row at **12 kg**, then Floor Press + RDL at **24 kg**.
- **Day 2:** Farmer Squat + Shoulder Press at **20 kg**.

> Change weights only between supersets.`
let next = program('Buff Dudes Phase 1')
const gemini = http
  .createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const body = JSON.parse(raw)
    const last = body.contents.at(-1).parts[0]
    const part = last.functionResponse ? { text: REPLY } : { functionCall: { name: 'propose_program', args: next } }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }] })}\n\n`)
  })
  .listen(0)
await new Promise((r) => gemini.once('listening', r))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-prog-'))
const PORT = 3700 + Math.floor(Math.random() * 200)
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, APP_TOKEN: 'k', GEMINI_API_KEY: 'fake', GEMINI_BASE_URL: `http://127.0.0.1:${gemini.address().port}`, BACKUP_DAYS: '0' }
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100))
const base = `http://127.0.0.1:${PORT}`
const shots = 'qa/shots-program'
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
  const idb = (fn, arg) =>
    p.evaluate(
      async ([src, arg]) => {
        const r = indexedDB.open('reps')
        const db = await new Promise((res) => (r.onsuccess = () => res(r.result)))
        const all = (s) => new Promise((res) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result) })
        const put = (s, v) => new Promise((res) => { const t = db.transaction(s, 'readwrite'); t.objectStore(s).put(v, v.id); t.oncomplete = res })
        return await new Function('all', 'put', 'arg', `return (${src})(all, put, arg)`)(all, put, arg)
      },
      [fn.toString(), arg],
    )
  const approve = async (question) => {
    await p.goto(base + '/#/coach')
    await p.waitForSelector('textarea, input[placeholder="Ask your coach"]', { timeout: 10000 })
    await p.fill('textarea, input[placeholder="Ask your coach"]', question)
    await p.keyboard.press('Enter')
    await p.locator('.proposal button:has-text("Approve")').last().waitFor({ timeout: 15000 })
    await wait(500)
  }
  const train = async () => {
    await p.goto(base + '/#/train')
    await p.reload()
    await p.waitForSelector('.plan-card', { timeout: 8000 })
    await wait(600)
    return { title: await p.textContent('.plan-title'), eyebrow: await p.textContent('.plan-eyebrow') }
  }

  await approve('Set up Buff Dudes phase 1 for me')
  await p.click('.proposal button:has-text("Approve")')
  await p.waitForSelector('.proposal-state', { timeout: 5000 })
  let t = await train()
  check('new program starts at Day 1', /Day 1/.test(t.title), t.title)

  // Day 1 eight days ago (last week), Day 2 yesterday.
  await idb(async (all, put, arg) => {
    const s = (await all('settings'))[0]
    const rs = await all('routines')
    const [d1, d2] = s.program.routineIds.map((id) => rs.find((r) => r.id === id))
    s.program.start -= 8 * 86400000
    s.updatedAt = Date.now()
    await put('settings', s)
    for (const [r, ago] of [[d1, 8], [d2, 1]]) {
      const start = Date.now() - ago * 86400000
      await put('workouts', { id: 'w-' + ago, name: r.name, routineId: r.id, start, end: start + 1800000, notes: '', exercises: r.exercises, updatedAt: Date.now() })
    }
  })
  t = await train()
  check('after Day 2 the next is Day 3', /Day 3/.test(t.title), t.title)
  const week = t.eyebrow.match(/Week (\d+)/)?.[1]
  check('week 2 of the program', week === '2', t.eyebrow)

  // The coach adjusts it, renamed, same days.
  next = program('Buff Dudes Phase 1 · 25/35 min')
  next.routines[0].exercises[0].notes = '14 kg. 3rd round on 35-min days'
  await approve('Make the exercises scale with the time I have')
  const card = p.locator('.proposal').last()
  check('card says it updates the program', /Updated program/.test(await card.textContent()))
  check('supersets are grouped', (await card.locator('.pday-label').count()) >= 3)
  check('weights and 35-min tags pulled out', /12 kg per hand/.test(await card.locator('.pmove-load').allTextContents().then((x) => x.join('|'))) && (await card.locator('.pmove-tag').count()) >= 3)
  await card.scrollIntoViewIfNeeded()
  await card.screenshot({ path: `${shots}/1-proposal.png` })
  const bubble = p.locator('.bubble.coach').last()
  check('reply has sections', (await bubble.locator('.md-sec').count()) === 2 && (await bubble.locator('.md-row').count()) === 4)
  await bubble.screenshot({ path: `${shots}/2-reply.png` })
  await card.locator('button:has-text("Approve")').click()
  await wait(800)
  t = await train()
  check('after the adjustment it is still Day 3', /Day 3/.test(t.title), t.title)
  check('and still week 2', t.eyebrow.match(/Week (\d+)/)?.[1] === '2', t.eyebrow)
  check('renamed program shows', /25\/35/.test(t.eyebrow), t.eyebrow)
  const after = await idb(async (all) => {
    const s = (await all('settings'))[0]
    const rs = await all('routines')
    return { ids: s.program.routineIds, first: rs.find((r) => r.id === s.program.routineIds[0]), count: rs.filter((r) => /Day \d · Full Body/.test(r.name) && !r.deleted).length }
  })
  check('routines updated in place, no duplicates', after.count === 3, String(after.count))
  await p.locator('.plan-card').screenshot({ path: `${shots}/3-train.png` })

  // Data already reset by the old behaviour: fresh copies of the routines, start moved to today.
  await idb(async (all, put) => {
    const s = (await all('settings'))[0]
    const rs = await all('routines')
    const ids = []
    for (const id of s.program.routineIds) {
      const r = rs.find((x) => x.id === id)
      const copy = { ...r, id: id + '-v2', updatedAt: Date.now() }
      await put('routines', copy)
      ids.push(copy.id)
    }
    const d = new Date()
    s.program = { ...s.program, routineIds: ids, start: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
    s.updatedAt = Date.now()
    await put('settings', s)
  })
  t = await train()
  check('already-reset data picks up at Day 3 again', /Day 3/.test(t.title), t.title)
  check('and week 2 again', t.eyebrow.match(/Week (\d+)/)?.[1] === '2', t.eyebrow)
} catch (e) {
  results.push('ERROR ' + e.message.split('\n')[0])
}
console.log(results.join('\n'))
await browser.close()
srv.kill()
gemini.close()
