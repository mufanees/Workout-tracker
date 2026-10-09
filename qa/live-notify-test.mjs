// Server side of the live fasting notification (server/push.mjs): recurring `fast-live` jobs, text
// written when the service worker asks, backlog collapsing, cancel, swipe-away and expiry.
// node qa/live-notify-test.mjs   (starts its own server on PORT, default 3600, in a fresh data dir)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const dir = fs.mkdtempSync(path.join(process.env.SCRATCH || os.tmpdir(), 'gloop-live-'))
const PORT = Number(process.env.PORT || 3600)
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, APP_TOKEN: 'testkey', BACKUP_DAYS: '0' }
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100))

const base = `http://127.0.0.1:${PORT}`
const api = async (p, body, token = 'testkey') => {
  const r = await fetch(base + p, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let j = null
  try {
    j = await r.json()
  } catch {}
  return { status: r.status, body: j }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  if (!ok) fails++
}
const db = () => new DatabaseSync(path.join(dir, 'reps.db'), { readOnly: true })
const job = (key) => {
  const d = db()
  try {
    return d.prepare('SELECT * FROM push_jobs WHERE key = ?').get(key) || null
  } finally {
    d.close()
  }
}
const H = 3600000
const M = 60000
const EP = 'https://push.invalid/device-1' // delivery fails (no such host); the inbox is what we test
const inbox = async (endpoint = EP) => (await api('/api/push/inbox', { endpoint }, null)).body.messages

try {
  check('server up', (await api('/api/health')).status === 200)
  check('subscribe', (await api('/api/push/subscribe', { endpoint: EP })).status === 200)

  // 1. a running 18:6 fast, 14h 20m in; the first live push in 1.5 s, then every minute, with the goal as a mark
  const now = Date.now()
  const start = now - (14 * H + 20 * M)
  const goalAt = start + 18 * H
  const data = { kind: 'fast', start, goal: 18, label: '18:6', tz: 'UTC', locale: 'en-US' }
  const mark = now + 30000
  let r = await api('/api/push/schedule', { key: 'fast-live', at: now + 1500, title: 'x', body: 'y', tag: 'gloop-fast', every: M, marks: [mark], until: goalAt + 24 * H, data })
  check('schedule a live job', r.status === 200)
  check('job stored with every/marks/data', job('fast-live')?.every === M && JSON.parse(job('fast-live').data).start === start)
  await sleep(4500)
  const j1 = job('fast-live')
  check('after firing, the job stays (recurring)', !!j1)
  check('next time is the earlier mark, not +1 min', j1?.at === mark, `at=${j1 && j1.at - now}ms from start, mark=${mark - now}`)
  let msgs = await inbox()
  check('inbox has one message', msgs.length === 1, JSON.stringify(msgs))
  const m = msgs[0] || {}
  check('title written at delivery', /^Fasting 14h 2\dm · 18:6$/.test(m.title), m.title)
  const expectAt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(goalAt)
  check('body: goal time and time to go', m.body === `Goal at ${expectAt} · 3h 3${9}m to go` || /^Goal at .+ · 3h 3\dm to go$/.test(m.body), m.body)
  check('tag and data reach the worker', m.tag === 'gloop-fast' && m.data?.kind === 'fast' && m.data?.start === start)
  check('inbox empties after reading', (await inbox()).length === 0)

  // 2. after the mark, back on the one-minute grid from the first time
  await sleep(mark - Date.now() + 3000)
  const j2 = job('fast-live')
  check('after the mark, next step on the grid', j2 && j2.at === now + 1500 + M, j2 && `at=+${j2.at - now}`)
  msgs = await inbox()
  check('mark delivered a fresh text', msgs.length === 1 && /^Fasting 14h 2\dm/.test(msgs[0].title))

  // 3. backlog (phone offline): several live rows collapse to the newest; a normal message is kept
  await api('/api/push/schedule', { key: 'fast', at: Date.now() - 1, title: 'Fast complete', body: 'You reached 18:6.' })
  for (let i = 0; i < 2; i++) {
    await api('/api/push/schedule', { key: 'fast-live', at: Date.now() - 1, title: 'x', body: 'y', tag: 'gloop-fast', every: M, until: goalAt + 24 * H, data })
    await sleep(2600)
  }
  msgs = await inbox()
  const live = msgs.filter((x) => x.tag === 'gloop-fast')
  check('backlog collapses to one live message', live.length === 1, `${msgs.length} messages`)
  check('one-off "fast" job still delivered, without data', msgs.some((x) => x.title === 'Fast complete' && !x.data) && !job('fast'))

  // 4. text once the goal has passed
  const past = { ...data, start: Date.now() - 20 * H - 5 * M }
  await api('/api/push/schedule', { key: 'fast-live', at: Date.now() - 1, title: 'x', body: 'y', tag: 'gloop-fast', every: M, until: Date.now() + H, data: past })
  await sleep(2600)
  msgs = await inbox()
  check('goal reached text', /^Fasting 20h 0\dm · 18:6$/.test(msgs[0]?.title) && /^Goal reached at .+ · \+2h 0\dm$/.test(msgs[0]?.body), `${msgs[0]?.title} / ${msgs[0]?.body}`)

  // 5. cancel (fast ended or edited)
  check('job exists before cancel', !!job('fast-live'))
  await api('/api/push/cancel', { key: 'fast-live' })
  check('cancel removes it', !job('fast-live'))

  // 6. swipe-away from the service worker: only a subscribed endpoint, only live keys
  await api('/api/push/schedule', { key: 'fast-live', at: Date.now() + H, title: 'x', body: 'y', tag: 'gloop-fast', every: 15 * M, data })
  await api('/api/push/schedule', { key: 'eat', at: Date.now() + H, title: 'Eat', body: 'z' })
  r = await api('/api/push/dismiss', { endpoint: 'https://push.invalid/stranger', key: 'fast-live' }, null)
  check('dismiss from an unknown device is ignored', r.body?.ok === false && !!job('fast-live'))
  r = await api('/api/push/dismiss', { endpoint: EP, key: 'eat' }, null)
  check('dismiss cannot cancel other jobs', !!job('eat'))
  r = await api('/api/push/dismiss', { endpoint: EP, key: 'fast-live' }, null)
  check('dismiss from the device stops the live job', r.body?.ok === true && !job('fast-live'))

  // 7. expiry: past `until`, it fires its last time and is removed
  await api('/api/push/schedule', { key: 'fast-live', at: Date.now() - 1, title: 'x', body: 'y', tag: 'gloop-fast', every: M, until: Date.now() + 1000, data })
  await sleep(2600)
  check('expired live job removed', !job('fast-live'))
  await inbox()

  // 8. guards and the old one-shot path
  r = await api('/api/push/schedule', { key: 'fast-live', at: Date.now(), title: 'x', every: 1000, data })
  check('every under a minute refused', r.status === 400)
  r = await api('/api/push/schedule', { key: 'rest', at: Date.now() - 1, title: 'Rest is over', body: 'Next: Squat', tag: 'rest' })
  await sleep(2600)
  msgs = await inbox()
  check('one-shot rest job unchanged', msgs.length === 1 && msgs[0].title === 'Rest is over' && msgs[0].tag === 'rest' && !job('rest'))
  check('schedule needs auth', (await api('/api/push/schedule', { key: 'k', at: 1, title: 't' }, null)).status === 401)
} catch (e) {
  console.error(e)
  fails++
} finally {
  srv.kill()
}
console.log(fails ? `\n${fails} failed` : '\nall passed')
process.exit(fails ? 1 : 0)
