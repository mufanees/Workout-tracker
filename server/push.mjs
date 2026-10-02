// Web push without dependencies. Notifications are scheduled on the server (so they fire with the
// app closed), delivered as empty pushes signed with VAPID, and the service worker fetches the text.
// Empty pushes need no payload encryption, which keeps this small.
import crypto from 'node:crypto'

const b64u = (buf) => Buffer.from(buf).toString('base64url')

export function createPush(db, { subject = 'mailto:reps@localhost' } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS push_jobs (key TEXT PRIMARY KEY, at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, tag TEXT);
    CREATE TABLE IF NOT EXISTS push_inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, tag TEXT, at INTEGER NOT NULL);
  `)

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
    schedule: db.prepare('INSERT OR REPLACE INTO push_jobs (key, at, title, body, tag) VALUES (?, ?, ?, ?, ?)'),
    cancel: db.prepare('DELETE FROM push_jobs WHERE key = ?'),
    due: db.prepare('SELECT * FROM push_jobs WHERE at <= ?'),
    inboxAdd: db.prepare('INSERT INTO push_inbox (endpoint, title, body, tag, at) VALUES (?, ?, ?, ?, ?)'),
    inboxTake: db.prepare('SELECT title, body, tag FROM push_inbox WHERE endpoint = ? ORDER BY id'),
    inboxClear: db.prepare('DELETE FROM push_inbox WHERE endpoint = ? OR at < ?'),
  }

  async function deliver(endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { TTL: '3600', Urgency: 'high', Authorization: vapidHeader(endpoint), 'Content-Length': '0' },
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
    for (const job of jobs) {
      q.cancel.run(job.key)
      for (const { endpoint } of subs) {
        q.inboxAdd.run(endpoint, job.title, job.body, job.tag, Date.now())
        await deliver(endpoint)
      }
    }
  }
  setInterval(() => void tick(), 2000).unref()

  return {
    publicKey,
    subscribe(endpoint) {
      if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint)) throw Object.assign(new Error('Bad subscription'), { status: 400 })
      q.addSub.run(endpoint, Date.now())
    },
    unsubscribe(endpoint) {
      q.delSub.run(endpoint)
    },
    schedule({ key, at, title, body, tag }) {
      if (!key || !Number.isFinite(at) || !title) throw Object.assign(new Error('Bad job'), { status: 400 })
      q.schedule.run(String(key), Math.round(at), String(title), String(body || ''), tag ? String(tag) : null)
    },
    cancel(key) {
      q.cancel.run(String(key))
    },
    /** The service worker asks what to show; the unguessable endpoint URL identifies the device. */
    take(endpoint) {
      const msgs = q.inboxTake.all(String(endpoint))
      q.inboxClear.run(String(endpoint), Date.now() - 86400000)
      return msgs
    },
  }
}
