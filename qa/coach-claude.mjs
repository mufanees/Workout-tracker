// The coach on the Claude API with per-person budgets. A stand-in Claude API (ANTHROPIC_BASE_URL)
// streams answers with real SSE events and fixed token counts, so costs are exact:
// - the owner picks the model and effort; "auto" plans on Opus and answers on Sonnet
// - a tool round runs and its result goes back; each round is charged
// - a member gets their default model; past their budget, Haiku with a notice
// - Opus planning sessions: counted per conversation, refused once used up
// - Settings → People shows spend and changes a person's model and budget
// npm run build && node qa/coach-claude.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createAccounts } from '../server/accounts.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const seen = [] // { model, effort, fallbacks, beta, tools, toolResult }
const claude = http
  .createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const body = JSON.parse(raw)
    const last = body.messages.at(-1)
    const toolResult = Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result')
    const text = typeof last.content === 'string' ? last.content : ''
    seen.push({ model: body.model, effort: body.output_config?.effort, fallbacks: body.fallbacks, beta: req.headers['anthropic-beta'] || '', tools: body.tools?.length || 0, cache: !!body.cache_control, toolResult })
    const useTool = /remember/i.test(text) && !toolResult
    const id = 'msg_' + crypto.randomUUID().slice(0, 8)
    const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
    // 10,000 input + 1,000 output tokens per call: Sonnet $0.03, Opus $0.06, Haiku $0.0015
    const usage = { input_tokens: 10000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    let out = ev('message_start', { message: { id, type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage } })
    if (useTool) {
      out += ev('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'remember', input: {} } })
      out += ev('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ note: 'Trains at 6 am' }) } })
      out += ev('content_block_stop', { index: 0 })
      out += ev('message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 1000 } })
    } else {
      const reply = /JSON Schema/.test(text) ? JSON.stringify({ notes: ['Prefers mornings'] }) : `Answered on ${body.model} at ${body.output_config?.effort} effort.`
      out += ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      out += ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: reply } })
      out += ev('content_block_stop', { index: 0 })
      out += ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1000 } })
    }
    out += ev('message_stop', {})
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(out)
  })
  .listen(0)
await new Promise((r) => claude.once('listening', r))

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-claude-'))
// A member, signed in (their session token is what the app keeps).
const MEMBER = 'member-token-' + crypto.randomUUID()
{
  const acc = createAccounts({ dataDir: dir, appToken: 'k', clientId: 'test' })
  void acc
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path.join(dir, 'accounts.db'))
  db.prepare("INSERT INTO users (id, google_sub, email, name, role, created, mcp_token) VALUES ('m1', 'sub-m1', 'sam@example.com', 'Sam Lee', 'member', ?, 'mcp-m1')").run(Date.now())
  db.prepare('INSERT INTO sessions (hash, user_id, created, seen) VALUES (?, ?, ?, ?)').run(crypto.createHash('sha256').update(MEMBER).digest('hex'), 'm1', Date.now(), Date.now())
  db.close()
}
const PORT = 3700 + Math.floor(Math.random() * 200)
const env = {
  ...process.env,
  PORT: String(PORT),
  DATA_DIR: dir,
  APP_TOKEN: 'k',
  GOOGLE_CLIENT_ID: 'test',
  ANTHROPIC_API_KEY: 'fake',
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${claude.address().port}`,
  GEMINI_API_KEY: '',
  COACH_MONTHLY_BUDGET: '0.05', // a member's budget runs out after two Sonnet answers
  COACH_OPUS_SESSIONS: '1',
  BACKUP_DAYS: '0',
}
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100))
const base = `http://127.0.0.1:${PORT}`
const results = []
const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`)
const near = (a, b) => Math.abs(a - b) < 1e-6

/** One chat request; returns { text, notice, meta, error }. */
async function chat(token, content, extra = {}) {
  const r = await fetch(base + '/api/coach', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content }], context: 'Today: test', ...extra }) })
  const out = { text: '', notice: '', meta: null, error: '' }
  for (const line of (await r.text()).split('\n\n')) {
    if (!line.startsWith('data: ')) continue
    const ev = JSON.parse(line.slice(6))
    if (ev.t) out.text += ev.t
    if (ev.notice) out.notice = ev.notice
    if (ev.meta) out.meta = ev.meta
    if (ev.error) out.error = ev.error
  }
  return out
}
const plan = async (token) => (await (await fetch(base + '/api/coach/status', { headers: { authorization: `Bearer ${token}` } })).json()).plan

try {
  // ---- the owner ----
  let r = await chat('k', 'How was my week?', { model: 'opus', effort: 'medium' })
  let s = seen.at(-1)
  check('owner picks Opus at medium', s.model === 'claude-opus-5-5' && s.effort === 'medium' && r.meta?.model === 'Opus', JSON.stringify(s))
  check('Opus asks for refusal fallbacks and caching', s.fallbacks === 'default' && /server-side-fallback-2026-07-01/.test(s.beta) && s.cache && s.tools > 10)
  check('cost is exact', near(r.meta.usd, 0.06), String(r.meta?.usd))
  r = await chat('k', 'Plan my next training block', { model: 'auto', effort: 'auto' })
  check('auto plans on Opus', seen.at(-1).model === 'claude-opus-5-5' && seen.at(-1).effort === 'medium')
  r = await chat('k', 'How was my week?', { model: 'auto', effort: 'auto' })
  check('auto answers on Sonnet at low', seen.at(-1).model === 'claude-sonnet-5-5' && seen.at(-1).effort === 'low')
  r = await chat('k', 'Please remember I train at 6 am', { model: 'haiku', effort: 'low' })
  const two = seen.slice(-2)
  check('a tool round runs and its result goes back', two[0].toolResult === false && two[1].toolResult === true && /Answered on claude-haiku-5-5/.test(r.text))
  check('Haiku asks no fallbacks', two.every((x) => !x.fallbacks))
  check('both rounds charged', near(r.meta.usd, 0.003), String(r.meta.usd))
  const mine = await plan('k')
  check('owner spend adds up', near(mine.spent, 0.06 + 0.06 + 0.03 + 0.003) && mine.admin, String(mine.spent))

  // ---- a member ($0.05 budget, 1 Opus session) ----
  r = await chat(MEMBER, 'How was my week?', { model: 'opus', effort: 'medium' })
  check('member can’t pick a model: gets the default', seen.at(-1).model === 'claude-sonnet-5-5' && seen.at(-1).effort === 'low' && !r.notice)
  r = await chat(MEMBER, 'And yesterday?')
  check('second answer still Sonnet (budget reached after it)', seen.at(-1).model === 'claude-sonnet-5-5')
  r = await chat(MEMBER, 'And today?')
  check('past the budget: Haiku with a notice', seen.at(-1).model === 'claude-haiku-5-5' && /budget/.test(r.notice), r.notice)
  r = await chat(MEMBER, 'Plan my program', { opus: 'plan-a' })
  check('an Opus planning session runs on Opus despite the budget', seen.at(-1).model === 'claude-opus-5-5' && seen.at(-1).effort === 'medium' && r.meta.opus)
  r = await chat(MEMBER, 'Make day 2 shorter', { opus: 'plan-a' })
  check('the same session continues', seen.at(-1).model === 'claude-opus-5-5')
  r = await chat(MEMBER, 'Another plan', { opus: 'plan-b' })
  check('a second session is refused (1 a month): Haiku with a notice', seen.at(-1).model === 'claude-haiku-5-5' && /Opus planning session/.test(r.notice), r.notice)
  let p = await plan(MEMBER)
  check('member plan: budget spent excludes Opus sessions', near(p.budgetSpent, 0.03 + 0.03 + 0.0015 + 0.0015) && p.opusUsed === 1 && !p.admin, JSON.stringify({ b: p.budgetSpent, s: p.spent, o: p.opusUsed }))
  // quick calls go through the same budget
  const qr = await fetch(base + '/api/coach/quick', { method: 'POST', headers: { authorization: `Bearer ${MEMBER}`, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'condense', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] }) })
  const qj = await qr.json()
  check('quick call on Haiku past the budget, JSON read', seen.at(-1).model === 'claude-haiku-5-5' && qr.ok && qj.notes?.[0] === 'Prefers mornings', JSON.stringify(qj))

  // the owner raises Sam's budget and gives them Opus
  const set = await fetch(base + '/api/admin/coach', { method: 'POST', headers: { authorization: 'Bearer k', 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm1', model: 'opus', budget: 10 }) })
  check('owner changes a person’s coach', set.ok)
  r = await chat(MEMBER, 'How was my week?')
  check('member now on Opus (full model)', seen.at(-1).model === 'claude-opus-5-5' && !r.notice)
  const denied = await fetch(base + '/api/admin/coach', { method: 'POST', headers: { authorization: `Bearer ${MEMBER}`, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm1', budget: -1 }) })
  check('a member can’t change budgets', denied.status === 403)
  await fetch(base + '/api/admin/coach', { method: 'POST', headers: { authorization: 'Bearer k', 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm1', model: null, budget: null }) })

  // ---- the app ----
  const browser = await chromium.launch()
  const shots = 'qa/shots-coach-claude'
  fs.mkdirSync(shots, { recursive: true })
  const open = async (token) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await ctx.addInitScript((t) => localStorage.setItem('reps-token', t), token)
    const pg = await ctx.newPage()
    pg.on('pageerror', (e) => results.push('PAGEERROR ' + e.message))
    return pg
  }
  const owner = await open('k')
  await owner.goto(base + '/#/coach')
  await owner.waitForSelector('.model-pick select', { timeout: 10000 })
  await owner.selectOption('.model-pick select', 'opus:medium')
  await owner.fill('#coach-input', 'How was my week?')
  await owner.keyboard.press('Enter')
  await owner.waitForSelector('.reply-meta', { timeout: 10000 })
  check('owner’s pick reaches the server', seen.at(-1).model === 'claude-opus-5-5' && seen.at(-1).effort === 'medium')
  check('owner sees model and cost under the reply', /Opus · medium · \$0\.060/.test(await owner.textContent('.reply-meta')), await owner.textContent('.reply-meta'))
  await new Promise((r) => setTimeout(r, 1200))
  await owner.screenshot({ path: `${shots}/1-owner-coach.png` })
  await owner.goto(base + '/#/settings')
  await owner.waitForSelector('.person-coach-sum', { timeout: 10000 })
  await owner.click('.person-coach-sum')
  await owner.waitForSelector('.person-coach-edit')
  check('People shows Sam’s spend', /Sonnet · low/.test(await owner.textContent('.person-coach-sum')) && /\$0\.\d+ this month/.test(await owner.textContent('.person-coach-note')), await owner.textContent('.person-coach-sum'))
  await owner.locator('.person-coach').scrollIntoViewIfNeeded()
  await owner.locator('.settings-group.people').screenshot({ path: `${shots}/2-people.png` })
  await owner.selectOption('.person-coach-edit label:has-text("Opus planning") select', '3')
  await new Promise((r) => setTimeout(r, 600))
  check('changing Opus sessions saves', /Opus 1\/3/.test(await owner.textContent('.person-coach-sum')), await owner.textContent('.person-coach-sum'))

  const member = await open(MEMBER)
  await member.goto(base + '/#/coach')
  await member.waitForSelector('.composer', { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 800))
  check('member has no model drop-down', !(await member.$('.model-pick select')))
  const toggle = member.locator('button.model-pick')
  check('member sees Opus plan with sessions left', /Opus plan · 2/.test(await toggle.textContent()), await toggle.textContent())
  await toggle.click()
  await member.fill('#coach-input', 'Plan my next 4 weeks')
  await member.keyboard.press('Enter')
  await member.waitForSelector('.bubble.coach', { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 600))
  check('member’s planning question runs on Opus', seen.at(-1).model === 'claude-opus-5-5')
  check('member doesn’t see costs', !(await member.$('.reply-meta')))
  await member.screenshot({ path: `${shots}/3-member-coach.png` })
  await browser.close()
} catch (e) {
  results.push('ERROR ' + e.message.split('\n')[0])
}
console.log(results.join('\n'))
if (results.some((r) => !r.startsWith('PASS'))) console.log(log.slice(-2000))
srv.kill()
claude.close()
