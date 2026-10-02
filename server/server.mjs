// Reps server: serves the built PWA and stores synced data in SQLite.
// No dependencies beyond Node 22.13+ (uses the built-in node:sqlite).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createMcpHandler } from './mcp.mjs'
import { createPush } from './push.mjs'
import { coachEnabled, streamCoach } from './coach.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3000)
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, '..', 'data'))
const DIST = path.resolve(process.env.DIST_DIR || path.join(ROOT, '..', 'dist'))
const TOKEN = process.env.APP_TOKEN || ''
const STORES = new Set(['exercises', 'routines', 'workouts', 'settings', 'body', 'fasts', 'readings'])
const MAX_BODY = 20 * 1024 * 1024

fs.mkdirSync(DATA_DIR, { recursive: true })
const db = new DatabaseSync(path.join(DATA_DIR, 'reps.db'))
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
const DB_ID = db.prepare('SELECT value FROM meta WHERE key = ?').get('dbId').value

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

function authorized(req) {
  if (!TOKEN) return true
  const header = req.headers.authorization || ''
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '')
  const want = Buffer.from(TOKEN)
  return given.length === want.length && crypto.timingSafeEqual(given, want)
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

// Last write wins, decided by the client's updatedAt. Every accepted write gets
// a new server sequence number so clients can ask "what changed since N".
function sync(body) {
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
    dbId: DB_ID,
    changes: rows.map((r) => ({
      store: r.store,
      id: r.id,
      updatedAt: r.updated_at,
      deleted: !!r.deleted,
      data: JSON.parse(r.data),
    })),
  }
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

const mcp = createMcpHandler({ db, q, rootDir: ROOT })
const push = createPush(db, { subject: process.env.PUSH_CONTACT || 'mailto:reps@localhost' })

// ---- nightly backups: /data/backups/reps-YYYY-MM-DD.db, newest BACKUP_DAYS kept ----
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const BACKUP_DAYS = Number(process.env.BACKUP_DAYS || 14)
function backup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    const file = path.join(BACKUP_DIR, `reps-${new Date().toISOString().slice(0, 10)}.db`)
    if (!fs.existsSync(file)) {
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
      console.log('backup written', file)
    }
    const old = fs.readdirSync(BACKUP_DIR).filter((f) => /^reps-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(BACKUP_DAYS)
    for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f))
  } catch (e) {
    console.error('backup failed', e)
  }
}
if (BACKUP_DAYS > 0) {
  backup()
  setInterval(backup, 3600000).unref() // checks hourly, writes once per day
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  try {
    if (pathname === '/api/health') return send(res, 200, { ok: true, auth: !!TOKEN })
    if (pathname === '/api/push/inbox' && req.method === 'POST') return send(res, 200, { messages: push.take((await readBody(req)).endpoint) })
    // MCP for assistants. The token can be in the path (/mcp/<token>) for clients that can't send headers.
    if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
      const pathToken = pathname.slice(5)
      const ok = !TOKEN || authorized(req) || (pathToken.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(pathToken), Buffer.from(TOKEN)))
      if (!ok) return send(res, 401, { error: 'Unauthorized' })
      if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' }, { allow: 'POST' })
      const out = await mcp(await readBody(req))
      if (out == null) {
        res.writeHead(202)
        return res.end()
      }
      return send(res, 200, out)
    }
    if (pathname.startsWith('/api/')) {
      if (!authorized(req)) return send(res, 401, { error: 'Unauthorized' })
      if (pathname === '/api/sync' && req.method === 'POST') return send(res, 200, sync(await readBody(req)))
      if (pathname === '/api/coach/status') return send(res, 200, { enabled: coachEnabled() })
      if (pathname === '/api/coach' && req.method === 'POST') {
        if (!coachEnabled()) return send(res, 503, { error: 'Set ANTHROPIC_API_KEY on the server to turn on the coach.' })
        return streamCoach(await readBody(req), res)
      }
      if (pathname === '/api/push/key') return send(res, 200, { key: push.publicKey })
      if (pathname === '/api/push/subscribe' && req.method === 'POST') return push.subscribe((await readBody(req)).endpoint), send(res, 200, { ok: true })
      if (pathname === '/api/push/unsubscribe' && req.method === 'POST') return push.unsubscribe((await readBody(req)).endpoint), send(res, 200, { ok: true })
      if (pathname === '/api/push/schedule' && req.method === 'POST') return push.schedule(await readBody(req)), send(res, 200, { ok: true })
      if (pathname === '/api/push/cancel' && req.method === 'POST') return push.cancel((await readBody(req)).key), send(res, 200, { ok: true })
      if (pathname === '/api/export' && req.method === 'GET') {
        const data = q.all.all().map((r) => ({ store: r.store, id: r.id, updatedAt: r.updated_at, data: JSON.parse(r.data) }))
        return send(res, 200, { exportedAt: new Date().toISOString(), records: data }, {
          'content-disposition': `attachment; filename="reps-backup-${new Date().toISOString().slice(0, 10)}.json"`,
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
  console.log(`Reps listening on :${PORT} (data: ${DATA_DIR})`)
  if (!TOKEN) console.warn('APP_TOKEN is not set: anyone who can reach this server can read and change your data.')
})

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => (db.close(), process.exit(0))))
