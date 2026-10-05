// Gloop server: serves the built PWA, signs people in, and stores each person's synced data in
// their own SQLite file.
// No dependencies beyond Node 22.13+ (uses the built-in node:sqlite).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createMcpHandler } from './mcp.mjs'
import { createPush } from './push.mjs'
import { coachEnabled, createCoach, friendlyError } from './coach.mjs'
import { videoInfo } from './video.mjs'
import { createAccounts } from './accounts.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3000)
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, '..', 'data'))
const DIST = path.resolve(process.env.DIST_DIR || path.join(ROOT, '..', 'dist'))
const TOKEN = process.env.APP_TOKEN || ''
const STORES = new Set(['exercises', 'routines', 'workouts', 'settings', 'body', 'fasts', 'readings', 'coach', 'days'])
const MAX_BODY = 20 * 1024 * 1024

fs.mkdirSync(DATA_DIR, { recursive: true })
try {
  fs.accessSync(DATA_DIR, fs.constants.W_OK)
} catch {
  const uid = process.getuid?.()
  console.error(
    `\nGloop can't write to ${DATA_DIR}, so it can't save your data.\n` +
      `The app runs as user ${uid ?? 'node'}. In Coolify, attach a Volume Mount (not a Directory/bind mount) at ${DATA_DIR}.\n` +
      `If you must use a host directory, run on the server: sudo chown -R ${uid ?? 1000}:${uid ?? 1000} <that directory>\n`,
  )
  process.exit(1)
}
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const accounts = createAccounts({
  dataDir: DATA_DIR,
  appToken: TOKEN,
  clientId: GOOGLE_CLIENT_ID,
  adminEmail: ADMIN_EMAIL,
  coachDailyLimit: Number(process.env.COACH_DAILY_LIMIT ?? 60),
  jwksUrl: process.env.GOOGLE_JWKS_URL || undefined,
})
/** No sign-in configured at all: the server is open, as before (everything is the owner's). */
const OPEN = !TOKEN && !GOOGLE_CLIENT_ID

// ---- one context per person: their own database, sync, connector, reminders and coach ----
// The owner's database is the original reps.db; everyone else's is users/<id>.db.
const USERS_DIR = path.join(DATA_DIR, 'users')
fs.mkdirSync(USERS_DIR, { recursive: true })
const dbFile = (id) => (id === 'owner' ? path.join(DATA_DIR, 'reps.db') : path.join(USERS_DIR, `${id.replace(/[^a-zA-Z0-9_-]/g, '')}.db`))
const contexts = new Map()

function openContext(userId) {
  const have = contexts.get(userId)
  if (have) return have
  const db = new DatabaseSync(dbFile(userId))
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS records (
      store TEXT NOT NULL,
      id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      seq INTEGER NOT NULL,
      PRIMARY KEY (store, id)
    );
    CREATE INDEX IF NOT EXISTS records_seq ON records (seq);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  // A random id for this database, so clients notice if it's been replaced or reset and re-upload.
  db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('dbId', crypto.randomUUID())
  const dbId = db.prepare('SELECT value FROM meta WHERE key = ?').get('dbId').value
  const q = {
    maxSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM records'),
    get: db.prepare('SELECT updated_at FROM records WHERE store = ? AND id = ?'),
    row: db.prepare('SELECT store, id, updated_at, deleted, data, seq FROM records WHERE store = ? AND id = ?'),
    upsert: db.prepare(`
      INSERT INTO records (store, id, updated_at, deleted, data, seq) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (store, id) DO UPDATE SET
        updated_at = excluded.updated_at, deleted = excluded.deleted, data = excluded.data, seq = excluded.seq
    `),
    since: db.prepare('SELECT store, id, updated_at, deleted, data, seq FROM records WHERE seq > ? ORDER BY seq'),
    all: db.prepare('SELECT store, id, updated_at, deleted, data FROM records WHERE deleted = 0 ORDER BY store, id'),
  }
  const mcp = createMcpHandler({ db, q, rootDir: ROOT })
  const push = createPush(db, { subject: process.env.PUSH_CONTACT || 'mailto:gloop@localhost' })
  const coach = createCoach({ db, q, mcp, push })
  const ctx = { id: userId, db, q, dbId, mcp, push, coach }
  contexts.set(userId, ctx)
  return ctx
}

// Last write wins, decided by the client's updatedAt. Every accepted write gets
// a new server sequence number so clients can ask "what changed since N".
function sync({ db, q, dbId }, body) {
  const since = Number(body.since) || 0
  const changes = Array.isArray(body.changes) ? body.changes : []
  let seq = q.maxSeq.get().seq
  const rejected = []
  db.exec('BEGIN')
  try {
    for (const c of changes) {
      if (!c || !STORES.has(c.store) || typeof c.id !== 'string' || !c.id || c.id.length > 200) continue
      const updatedAt = Number(c.updatedAt) || 0
      const existing = q.get.get(c.store, c.id)
      if (existing && existing.updated_at > updatedAt) {
        rejected.push([c.store, c.id])
        continue
      }
      q.upsert.run(c.store, c.id, updatedAt, c.deleted ? 1 : 0, JSON.stringify(c.data ?? null), ++seq)
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  const rows = q.since.all(since)
  // Send back the winning version of anything we refused, so the client converges.
  const included = new Set(rows.map((r) => r.store + ':' + r.id))
  for (const [store, id] of rejected) if (!included.has(store + ':' + id)) rows.push(q.row.get(store, id))
  return {
    seq,
    dbId,
    changes: rows.map((r) => ({
      store: r.store,
      id: r.id,
      updatedAt: r.updated_at,
      deleted: !!r.deleted,
      data: JSON.parse(r.data),
    })),
  }
}

const bearer = (req) => {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : ''
}
/** The signed-in person for this request, or null. */
function whoIs(req) {
  if (OPEN) return accounts.me('owner')
  return accounts.resolve(bearer(req))
}

function send(res, status, body, headers = {}) {
  const json = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers })
  res.end(json)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function serveStatic(req, res, pathname) {
  let rel
  try {
    rel = decodeURIComponent(pathname)
  } catch {
    return send(res, 400, { error: 'Bad request' })
  }
  if (rel.endsWith('/')) rel += 'index.html'
  const file = path.join(DIST, path.normalize(rel))
  const inside = file.startsWith(DIST + path.sep)
  let target = inside && fs.existsSync(file) && fs.statSync(file).isFile() ? file : null
  if (!target) {
    if (path.extname(rel)) return send(res, 404, { error: 'Not found' })
    target = path.join(DIST, 'index.html') // SPA fallback
    if (!fs.existsSync(target)) return send(res, 503, { error: 'App not built. Run npm run build.' })
  }
  const ext = path.extname(target)
  const immutable = target.includes(path.sep + 'assets' + path.sep)
  res.writeHead(200, {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(target).pipe(res)
}

// Open everyone's context at start, so reminders and the weekly review run for each person.
for (const id of accounts.activeIds()) openContext(id)

// ---- nightly backups: backups/reps-YYYY-MM-DD.db (the owner), backups/users/<id>-YYYY-MM-DD.db,
// backups/accounts-YYYY-MM-DD.db; the newest BACKUP_DAYS of each kept ----
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const BACKUP_DAYS = Number(process.env.BACKUP_DAYS || 14)
function backupOne(dbh, dir, prefix) {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${prefix}-${new Date().toISOString().slice(0, 10)}.db`)
  if (!fs.existsSync(file)) {
    dbh.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
    console.log('backup written', file)
  }
  const re = new RegExp(`^${prefix}-\\d{4}-\\d{2}-\\d{2}\\.db$`)
  const old = fs.readdirSync(dir).filter((f) => re.test(f)).sort().reverse().slice(BACKUP_DAYS)
  for (const f of old) fs.rmSync(path.join(dir, f))
}
function backup() {
  try {
    backupOne(accounts.db, BACKUP_DIR, 'accounts')
    for (const ctx of contexts.values()) {
      if (ctx.id === 'owner') backupOne(ctx.db, BACKUP_DIR, 'reps')
      else backupOne(ctx.db, path.join(BACKUP_DIR, 'users'), ctx.id)
    }
  } catch (e) {
    console.error('backup failed', e)
  }
}
if (BACKUP_DAYS > 0) {
  backup()
  setInterval(backup, 3600000).unref() // checks hourly, writes once per day
}

const coachOff = () => ({ error: 'Set GEMINI_API_KEY on the server to turn on the coach.' })
const coachOut = (limit) => ({ error: `You’ve used today’s ${limit} coach messages. They reset at midnight (UTC).` })

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const { pathname } = url
  try {
    if (pathname === '/api/health') return send(res, 200, { ok: true, auth: !!TOKEN || accounts.enabled(), accounts: accounts.enabled() })
    // The service worker asks for its notification text; the unguessable endpoint URL says whose it is.
    if (pathname === '/api/push/inbox' && req.method === 'POST') {
      const { endpoint } = await readBody(req)
      for (const ctx of contexts.values()) {
        const messages = ctx.push.take(endpoint)
        if (messages.length) return send(res, 200, { messages })
      }
      return send(res, 200, { messages: [] })
    }
    // ---- signing in (no session needed) ----
    if (pathname === '/api/auth/config') return send(res, 200, { googleClientId: accounts.clientId || null })
    if (pathname === '/api/auth/invite' && req.method === 'GET') return send(res, 200, accounts.inviteInfo(url.searchParams.get('code')))
    if (pathname === '/api/auth/google' && req.method === 'POST') {
      try {
        const out = await accounts.signIn(await readBody(req))
        openContext(out.user.id)
        return send(res, 200, out)
      } catch (e) {
        if (!e.status) console.error(e)
        return send(res, e.status || 500, { error: e.status ? e.message : 'Sign-in failed', code: e.code })
      }
    }
    // MCP for assistants: each person has their own link (/mcp/<their token>); the old APP_TOKEN is the owner's.
    if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
      const user = OPEN ? accounts.me('owner') : accounts.resolveMcp(pathname.slice(5)) || accounts.resolve(bearer(req))
      if (!user) return send(res, 401, { error: 'Unauthorized' })
      if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' }, { allow: 'POST' })
      const out = await openContext(user.id).mcp(await readBody(req))
      if (out == null) {
        res.writeHead(202)
        return res.end()
      }
      return send(res, 200, out)
    }
    if (pathname.startsWith('/api/')) {
      const user = whoIs(req)
      if (!user) return send(res, 401, { error: 'Unauthorized' })
      const ctx = openContext(user.id)
      // ---- the signed-in person ----
      if (pathname === '/api/auth/me') return send(res, 200, { user: accounts.me(user.id), accounts: accounts.enabled() })
      if (pathname === '/api/auth/logout' && req.method === 'POST') return accounts.signOut(bearer(req)), send(res, 200, { ok: true })
      if (pathname === '/api/auth/mcp-token' && req.method === 'POST') return send(res, 200, { mcpToken: accounts.newMcpToken(user.id) })
      // ---- the owner's tools ----
      if (pathname.startsWith('/api/admin/')) {
        if (user.role !== 'admin') return send(res, 403, { error: 'Only the owner can do that.' })
        if (pathname === '/api/admin/people') return send(res, 200, accounts.people())
        if (pathname === '/api/admin/invite' && req.method === 'POST') return send(res, 200, accounts.invite(user.id, (await readBody(req)).note))
        if (pathname === '/api/admin/invite/revoke' && req.method === 'POST') return accounts.revokeInvite((await readBody(req)).code), send(res, 200, { ok: true })
        if (pathname === '/api/admin/access' && req.method === 'POST') {
          const b = await readBody(req)
          accounts.setDisabled(b.id, !!b.disabled)
          if (!b.disabled) openContext(String(b.id))
          return send(res, 200, { ok: true })
        }
        return send(res, 404, { error: 'Not found' })
      }
      if (pathname === '/api/sync' && req.method === 'POST') return send(res, 200, sync(ctx, await readBody(req)))
      if (pathname === '/api/video-info') return send(res, 200, await videoInfo(url.searchParams.get('url')))
      if (pathname === '/api/coach/status') return send(res, 200, { enabled: coachEnabled() })
      if (pathname === '/api/coach' && req.method === 'POST') {
        if (!coachEnabled()) return send(res, 503, coachOff())
        if (!accounts.coachTake(user)) return send(res, 429, coachOut(accounts.people().coachLimit))
        return ctx.coach.streamChat(await readBody(req), res)
      }
      if (pathname === '/api/coach/quick' && req.method === 'POST') {
        if (!coachEnabled()) return send(res, 503, coachOff())
        if (!accounts.coachTake(user)) return send(res, 429, coachOut(accounts.people().coachLimit))
        try {
          return send(res, 200, await ctx.coach.quick(await readBody(req)))
        } catch (e) {
          return send(res, e.status === 400 && !e.gemini ? 400 : 502, { error: friendlyError(e) })
        }
      }
      if (pathname === '/api/push/key') return send(res, 200, { key: ctx.push.publicKey })
      if (pathname === '/api/push/subscribe' && req.method === 'POST') return ctx.push.subscribe((await readBody(req)).endpoint), send(res, 200, { ok: true })
      if (pathname === '/api/push/unsubscribe' && req.method === 'POST') return ctx.push.unsubscribe((await readBody(req)).endpoint), send(res, 200, { ok: true })
      if (pathname === '/api/push/schedule' && req.method === 'POST') return ctx.push.schedule(await readBody(req)), send(res, 200, { ok: true })
      if (pathname === '/api/push/cancel' && req.method === 'POST') return ctx.push.cancel((await readBody(req)).key), send(res, 200, { ok: true })
      if (pathname === '/api/export' && req.method === 'GET') {
        const data = ctx.q.all.all().map((r) => ({ store: r.store, id: r.id, updatedAt: r.updated_at, data: JSON.parse(r.data) }))
        return send(res, 200, { exportedAt: new Date().toISOString(), records: data }, {
          'content-disposition': `attachment; filename="gloop-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        })
      }
      return send(res, 404, { error: 'Not found' })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' })
    return serveStatic(req, res, pathname)
  } catch (e) {
    console.error(e)
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Server error' })
  }
})

server.listen(PORT, () => {
  console.log(`Gloop listening on :${PORT} (data: ${DATA_DIR})`)
  if (OPEN) console.warn('Neither APP_TOKEN nor GOOGLE_CLIENT_ID is set: anyone who can reach this server can read and change your data.')
  else if (GOOGLE_CLIENT_ID && !ADMIN_EMAIL) console.warn('GOOGLE_CLIENT_ID is set but ADMIN_EMAIL isn’t: nobody can sign in as the owner with Google (the APP_TOKEN still works).')
})

for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () =>
    server.close(() => {
      for (const ctx of contexts.values()) ctx.db.close()
      accounts.db.close()
      process.exit(0)
    }),
  )
