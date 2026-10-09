// Web push without dependencies. Notifications are scheduled on the server (so they fire with the
// app closed), delivered as empty pushes signed with VAPID, and the service worker fetches the text.
// Empty pushes need no payload encryption, which keeps this small.
import crypto from 'node:crypto'
import { fastLiveText } from '../shared/live.mjs'

const b64u = (buf) => Buffer.from(buf).toString('base64url')

export function createPush(db, { subject = 'mailto:reps@localhost' } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS push_jobs (key TEXT PRIMARY KEY, at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, tag TEXT);
    CREATE TABLE IF NOT EXISTS push_inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, tag TEXT, at INTEGER NOT NULL);
  `)
  // Recurring "live" jobs (the fasting notification): `every` ms until `until`, plus exact `marks`
  // (like the goal time); `data` travels to the service worker, and the text is written when it asks.
  for (const sql of [
    'ALTER TABLE push_jobs ADD COLUMN every INTEGER',
    'ALTER TABLE push_jobs ADD COLUMN until INTEGER',
    'ALTER TABLE push_jobs ADD COLUMN marks TEXT',
    'ALTER TABLE push_jobs ADD COLUMN data TEXT',
    'ALTER TABLE push_jobs ADD COLUMN origin INTEGER',
    'ALTER TABLE push_inbox ADD COLUMN data TEXT',
  ]) {
    try {
      db.exec(sql)
    } catch {
      /* column already there */
    }
  }

  // VAPID key pair, created once and kept in the database.
  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?')
  const setMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
  let jwk = getMeta.get('vapid')?.value
  if (!jwk) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    jwk = JSON.stringify(privateKey.export({ format: 'jwk' }))
    setMeta.run('vapid', jwk)
  }
  const priv = crypto.createPrivateKey({ key: JSON.parse(jwk), format: 'jwk' })
  const pub = crypto.createPublicKey(priv).export({ format: 'jwk' })
  const publicKey = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]))

  function vapidHeader(endpoint) {
    const aud = new URL(endpoint).origin
    const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
    const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }))
    const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key: priv, dsaEncoding: 'ieee-p1363' })
    return `vapid t=${header}.${claims}.${b64u(sig)}, k=${publicKey}`
  }

  const q = {
    addSub: db.prepare('INSERT OR IGNORE INTO push_subs (endpoint, created) VALUES (?, ?)'),
    delSub: db.prepare('DELETE FROM push_subs WHERE endpoint = ?'),
    subs: db.prepare('SELECT endpoint FROM push_subs'),
    hasSub: db.prepare('SELECT 1 FROM push_subs WHERE endpoint = ?'),
    schedule: db.prepare('INSERT OR REPLACE INTO push_jobs (key, at, title, body, tag, every, until, marks, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    reschedule: db.prepare('UPDATE push_jobs SET at = ? WHERE key = ?'),
    job: db.prepare('SELECT * FROM push_jobs WHERE key = ?'),
    cancel: db.prepare('DELETE FROM push_jobs WHERE key = ?'),
    due: db.prepare('SELECT * FROM push_jobs WHERE at <= ?'),
    inboxAdd: db.prepare('INSERT INTO push_inbox (endpoint, title, body, tag, at, data) VALUES (?, ?, ?, ?, ?, ?)'),
    inboxTake: db.prepare('SELECT title, body, tag, data FROM push_inbox WHERE endpoint = ? ORDER BY id'),
    inboxClear: db.prepare('DELETE FROM push_inbox WHERE endpoint = ? OR at < ?'),
  }

  async function deliver(endpoint, live = false) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        // live updates are worth less once stale, and needn't wake a dozing phone at once
        headers: { TTL: live ? '900' : '3600', Urgency: live ? 'normal' : 'high', Authorization: vapidHeader(endpoint), 'Content-Length': '0' },
      })
      if (res.status === 404 || res.status === 410) q.delSub.run(endpoint) // subscription expired
      else if (!res.ok) console.warn('push failed', res.status, await res.text().catch(() => ''))
    } catch (e) {
      console.warn('push error', e.message)
    }
  }

  async function tick() {
    const jobs = q.due.all(Date.now())
    if (!jobs.length) return
    const subs = q.subs.all()
    const now = Date.now()
    for (const job of jobs) {
      const next = nextAt(job, now)
      if (next != null) q.reschedule.run(next, job.key)
      else q.cancel.run(job.key)
      if (job.until != null && now > job.until) continue // expired live job: drop quietly
      for (const { endpoint } of subs) {
        q.inboxAdd.run(endpoint, job.title, job.body, job.tag, now, job.data ?? null)
        await deliver(endpoint, !!job.data)
      }
    }
  }
  setInterval(() => void tick(), 2000).unref()

  /** The next time a recurring job fires: the next step of `every` from its first time, or an earlier mark. */
  function nextAt(job, now) {
    if (!job.every) return null
    const origin = job.origin ?? job.at // the grid stays on the first time, even after a mark
    let next = origin + job.every * Math.max(1, Math.ceil((now - origin + 1) / job.every))
    let marks = []
    try {
      marks = JSON.parse(job.marks || '[]')
    } catch {
      /* none */
    }
    for (const m of marks) if (Number.isFinite(m) && m > now && m < next) next = m
    return job.until != null && next > job.until ? null : next
  }

  /** Text for an inbox row, written now so it's current when shown. */
  function render(row) {
    let data = null
    try {
      data = row.data ? JSON.parse(row.data) : null
    } catch {
      /* plain message */
    }
    if (data?.kind === 'fast' && Number.isFinite(data.start) && Number.isFinite(data.goal)) {
      const t = fastLiveText(data)
      return { title: t.title, body: t.body, tag: row.tag, data }
    }
    return data ? { title: row.title, body: row.body, tag: row.tag, data } : { title: row.title, body: row.body, tag: row.tag }
  }

  const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Math.round(Number(v)) : null)

  return {
    publicKey,
    subscribe(endpoint) {
      if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint)) throw Object.assign(new Error('Bad subscription'), { status: 400 })
      q.addSub.run(endpoint, Date.now())
    },
    unsubscribe(endpoint) {
      q.delSub.run(endpoint)
    },
    schedule({ key, at, title, body, tag, every, until, marks, data }) {
      if (!key || !Number.isFinite(at) || !title) throw Object.assign(new Error('Bad job'), { status: 400 })
      const ev = num(every)
      if (ev != null && ev < 60000) throw Object.assign(new Error('Too frequent'), { status: 400 })
      const mk = Array.isArray(marks) ? marks.filter((m) => Number.isFinite(m)).slice(0, 20) : []
      const dt = data && typeof data === 'object' ? JSON.stringify(data).slice(0, 2000) : null
      q.schedule.run(String(key), Math.round(at), String(title), String(body || ''), tag ? String(tag) : null, ev, num(until), mk.length ? JSON.stringify(mk) : null, dt, Math.round(at))
    },
    /** The scheduled job under `key`, or null (for tests and checks). */
    job(key) {
      return q.job.get(String(key)) || null
    },
    /** A swipe-away from the service worker stops a live job; only for subscribed devices and live keys. */
    dismiss(endpoint, key) {
      if (!q.hasSub.get(String(endpoint))) return false
      if (!['fast-live'].includes(key)) return true
      q.cancel.run(key)
      return true
    },
    cancel(key) {
      q.cancel.run(String(key))
    },
    /** The service worker asks what to show; the unguessable endpoint URL identifies the device. */
    take(endpoint) {
      const rows = q.inboxTake.all(String(endpoint))
      q.inboxClear.run(String(endpoint), Date.now() - 86400000)
      // a backlog of live updates (the phone was offline) collapses to the newest per tag
      const lastLive = new Map()
      rows.forEach((r, i) => r.data && lastLive.set(r.tag, i))
      return rows.filter((r, i) => !r.data || lastLive.get(r.tag) === i).map(render)
    },
  }
}
