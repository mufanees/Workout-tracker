// A new member builds their own program with the coach: "Build my own program" on Train opens the
// coach, which asks its questions first; their answers go to their profile (save_profile) and a
// program comes back as a card; approving it puts Day 1 on Train. The owner's background (stiff
// shoulder, dumbbells at home) is in nobody's instructions: each coach knows only its own person's
// profile, memory and logs. A stand-in Claude API scripts the turns.
// npm run build && node qa/coach-own-program.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createAccounts } from '../server/accounts.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const PROGRAM = {
  name: 'Sam’s Gym 3×45',
  days_per_week: 3,
  minutes: 45,
  summary: 'Full body three times a week on the gym machines and dumbbells, built around your knee.',
  routines: [
    { name: 'Day 1 · Full Body A', exercises: [{ name: 'Goblet Squat', sets: 3, reps: '8-10' }, { name: 'Bent-Over Dumbbell Row', sets: 3, reps: '8-10' }] },
    { name: 'Day 2 · Full Body B', exercises: [{ name: 'Dumbbell Romanian Deadlift', sets: 3, reps: '8-10' }, { name: 'Dumbbell Floor Press', sets: 3, reps: '8-10' }] },
  ],
}
const systems = []
const claude = http
  .createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const body = JSON.parse(raw)
    systems.push(typeof body.system === 'string' ? body.system : JSON.stringify(body.system))
    const msgs = body.messages
    const last = msgs.at(-1)
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user' && typeof m.content === 'string')?.content || ''
    const results = Array.isArray(last.content) ? last.content.filter((b) => b.type === 'tool_result') : []
    const prevCall = results.length ? msgs.at(-2).content.find((b) => b.type === 'tool_use')?.name : null
    let block
    if (/Build me a program/.test(lastUser)) {
      block = { type: 'text', text: 'A few questions first:\n1. Main goal? (e.g. build muscle)\n2. Days a week and minutes? (e.g. 3 × 45)\n3. Equipment?\n4. Experience?\n5. Injuries?' }
    } else if (!results.length) {
      block = { type: 'tool_use', id: 'toolu_p', name: 'save_profile', input: { goals: 'Build muscle', schedule: '3 days a week, 45 min', equipment: 'Gym with dumbbells', injuries: 'Left knee: no deep lunges', preferences: '1 year lifting' } }
    } else if (prevCall === 'save_profile') {
      block = { type: 'tool_use', id: 'toolu_q', name: 'propose_program', input: PROGRAM }
    } else {
      block = { type: 'text', text: 'Here’s your program. Approve it and Day 1 is on Train.' }
    }
    const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
    const usage = { input_tokens: 1000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    let out = ev('message_start', { message: { id: 'msg_' + crypto.randomUUID().slice(0, 8), type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage } })
    if (block.type === 'text') {
      out += ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      out += ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: block.text } })
    } else {
      out += ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } })
      out += ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
    }
    out += ev('content_block_stop', { index: 0 })
    out += ev('message_delta', { delta: { stop_reason: block.type === 'text' ? 'end_turn' : 'tool_use', stop_sequence: null }, usage: { output_tokens: 100 } })
    out += ev('message_stop', {})
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(out)
  })
  .listen(0)
await new Promise((r) => claude.once('listening', r))

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-own-'))
const MEMBER = 'member-token-' + crypto.randomUUID()
{
  createAccounts({ dataDir: dir, appToken: 'k', clientId: 'test' })
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path.join(dir, 'accounts.db'))
  db.prepare("INSERT INTO users (id, google_sub, email, name, role, created, mcp_token) VALUES ('m1', 'sub-m1', 'sam@example.com', 'Sam Lee', 'member', ?, 'mcp-m1')").run(Date.now())
  db.prepare('INSERT INTO sessions (hash, user_id, created, seen) VALUES (?, ?, ?, ?)').run(crypto.createHash('sha256').update(MEMBER).digest('hex'), 'm1', Date.now(), Date.now())
  db.close()
}
const PORT = 3700 + Math.floor(Math.random() * 200)
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, APP_TOKEN: 'k', GOOGLE_CLIENT_ID: 'test', ANTHROPIC_API_KEY: 'fake', ANTHROPIC_BASE_URL: `http://127.0.0.1:${claude.address().port}`, GEMINI_API_KEY: '', BACKUP_DAYS: '0' }
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100))
const base = `http://127.0.0.1:${PORT}`
const shots = 'qa/shots-own-program'
fs.mkdirSync(shots, { recursive: true })
const results = []
const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.addInitScript((t) => localStorage.setItem('reps-token', t), MEMBER)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => results.push('PAGEERROR ' + e.message))
  await p.goto(base + '/#/train')
  await p.waitForSelector('.plan-own', { timeout: 10000 })
  await wait(1500)
  await p.locator('.plan-card').scrollIntoViewIfNeeded()
  await p.locator('.plan-card').screenshot({ path: `${shots}/1-train.png` })
  await p.click('.plan-own')
  await p.waitForFunction(() => /Main goal\?/.test(document.body.innerText), null, { timeout: 15000 })
  check('the coach asks its questions first', !(await p.$('.proposal')))
  check('a member’s coach isn’t told about the owner', !/stiff shoulder|dumbbells at home|parent|About this athlete/i.test(systems.at(-1)) && /Who they are: what PROFILE/.test(systems.at(-1)))
  check('a new member isn’t assumed to be on the Comeback plan', /Program: none yet/.test(systems.at(-1)) && !/Currently week/.test(systems.at(-1)))
  await wait(500)
  await p.screenshot({ path: `${shots}/2-questions.png` })
  await p.fill('#coach-input', 'Build muscle. 3 days, 45 min. Gym. 1 year. Left knee, no deep lunges.')
  await p.keyboard.press('Enter')
  await p.waitForSelector('.proposal button:has-text("Approve")', { timeout: 15000 })
  await wait(500)
  const chips = await p.locator('.mem-chip').allTextContents()
  check('answers saved to their profile', chips.some((c) => /Saved to your profile/.test(c) && /goals/.test(c)), chips.join(' | '))
  check('one reply: profile, then program card', /New program: Sam’s Gym 3×45/.test(await p.textContent('.proposal')))
  await p.locator('.bubble.coach').last().screenshot({ path: `${shots}/3-program.png` })
  await p.click('.proposal button:has-text("Approve")')
  await p.waitForSelector('.proposal-state', { timeout: 5000 })
  await p.goto(base + '/#/train')
  await p.reload()
  await p.waitForSelector('.plan-title', { timeout: 8000 })
  await wait(600)
  check('Train shows Day 1 of their program', /Day 1 · Full Body A/.test(await p.textContent('.plan-title')) && /Sam’s Gym/.test(await p.textContent('.plan-eyebrow')))
  // the program card's menu offers a new one
  await p.click('.plan-eyebrow')
  await p.waitForSelector('text=Build a new program', { timeout: 4000 })
  check('program menu offers a new program', true)

  await fetch(base + '/api/coach', { method: 'POST', headers: { authorization: `Bearer ${MEMBER}`, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Thanks!' }], context: 'Today: test' }) }).then((r) => r.text())
  check('their next message comes with the saved profile', /Goals: Build muscle/.test(systems.at(-1)) && /Injuries and limits: Left knee/.test(systems.at(-1)))
  // nobody's coach is told about anyone else, the owner included
  await fetch(base + '/api/coach', { method: 'POST', headers: { authorization: 'Bearer k', 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Build me a program of my own.' }], context: 'Today: test' }) }).then((r) => r.text())
  const ownerSys = systems.at(-1)
  check('the owner’s coach has no built-in description either', !/stiff shoulder|dumbbells at home|parent|About this athlete/i.test(ownerSys) && /PROFILE\n\(not filled in yet\)/.test(ownerSys))
  check('and it doesn’t see the member’s profile', !/Left knee|Build muscle/.test(ownerSys))
} catch (e) {
  results.push('ERROR ' + e.message.split('\n')[0])
}
console.log(results.join('\n'))
if (results.some((r) => !r.startsWith('PASS'))) console.log(log.slice(-1500))
await browser.close()
srv.kill()
claude.close()
