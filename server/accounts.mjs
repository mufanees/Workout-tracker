// Accounts: Google sign-in, invite-only, one database per person.
//
// The accounts database (/data/accounts.db) holds who exists, their sign-in sessions, invite
// codes and how much of the shared coach each person used today. Everyone's training data lives
// in their own SQLite file (server.mjs opens one context per person), so nothing can mix.
// The owner is user "owner": their database is the original /data/reps.db and the old
// APP_TOKEN still signs in as them.
//
// Sign-in uses Google Identity Services in the app: the browser gets a Google ID token (a JWT
// signed by Google) and posts it here; we check the signature against Google's published keys,
// the audience (our client id), issuer, expiry and that the email is verified. No client secret
// is needed for this flow.
import crypto from 'node:crypto'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DAY = 86400000
const INVITE_DAYS = 14
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const rand = (n) => crypto.randomBytes(n).toString('base64url')

export function createAccounts({ dataDir, appToken = '', clientId = '', adminEmail = '', coachDailyLimit = 60, jwksUrl = 'https://www.googleapis.com/oauth2/v3/certs' }) {
  const db = new DatabaseSync(path.join(dataDir, 'accounts.db'))
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_sub TEXT UNIQUE,
      email TEXT,
      name TEXT,
      picture TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      created INTEGER NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      mcp_token TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
    CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, created_by TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, note TEXT, used_by TEXT, used_at INTEGER);
    CREATE TABLE IF NOT EXISTS coach_use (user_id TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (user_id, day));
  `)
  const admin = adminEmail.trim().toLowerCase()
  // The owner always exists: their data is the original database.
  db.prepare("INSERT OR IGNORE INTO users (id, role, created, mcp_token, email) VALUES ('owner', 'admin', ?, ?, ?)").run(Date.now(), rand(24), admin || null)
  if (admin) db.prepare("UPDATE users SET email = ? WHERE id = 'owner' AND (email IS NULL OR email = '')").run(admin)

  const q = {
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    bySub: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
    byMcp: db.prepare('SELECT * FROM users WHERE mcp_token = ?'),
    users: db.prepare('SELECT * FROM users ORDER BY created'),
    active: db.prepare('SELECT id FROM users WHERE disabled = 0'),
    claimOwner: db.prepare("UPDATE users SET google_sub = ?, email = ?, name = ?, picture = ? WHERE id = 'owner'"),
    profile: db.prepare('UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?'),
    addUser: db.prepare("INSERT INTO users (id, google_sub, email, name, picture, role, created, mcp_token) VALUES (?, ?, ?, ?, ?, 'member', ?, ?)"),
    setDisabled: db.prepare("UPDATE users SET disabled = ? WHERE id = ? AND id != 'owner'"),
    newMcp: db.prepare('UPDATE users SET mcp_token = ? WHERE id = ?'),
    session: db.prepare('SELECT * FROM sessions WHERE hash = ?'),
    addSession: db.prepare('INSERT INTO sessions (hash, user_id, created, seen) VALUES (?, ?, ?, ?)'),
    seen: db.prepare('UPDATE sessions SET seen = ? WHERE hash = ?'),
    endSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
    endAll: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    invite: db.prepare('SELECT * FROM invites WHERE code = ?'),
    addInvite: db.prepare('INSERT INTO invites (code, created_by, created, expires, note) VALUES (?, ?, ?, ?, ?)'),
    useInvite: db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL'),
    dropInvite: db.prepare('DELETE FROM invites WHERE code = ? AND used_by IS NULL'),
    openInvites: db.prepare('SELECT * FROM invites WHERE used_by IS NULL AND expires > ? ORDER BY created DESC'),
    useToday: db.prepare('SELECT n FROM coach_use WHERE user_id = ? AND day = ?'),
    bump: db.prepare('INSERT INTO coach_use (user_id, day, n) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1'),
  }

  const pub = (u) => u && { id: u.id, email: u.email || '', name: u.name || '', picture: u.picture || '', role: u.role, disabled: !!u.disabled }
  const today = () => new Date().toISOString().slice(0, 10)

  // ---- Google ID tokens ----
  let keys = null
  let keysAt = 0
  async function googleKeys(force = false) {
    if (!keys || force || Date.now() - keysAt > 6 * 3600000) {
      const r = await fetch(jwksUrl)
      if (!r.ok) throw Object.assign(new Error('Couldn’t reach Google to check the sign-in. Try again.'), { status: 502 })
      keys = (await r.json()).keys || []
      keysAt = Date.now()
    }
    return keys
  }
  const part = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
  async function verifyGoogle(token) {
    const bad = (m = 'That sign-in didn’t check out. Try again.') => Object.assign(new Error(m), { status: 401 })
    if (!clientId) throw Object.assign(new Error('Google sign-in isn’t set up on this server (GOOGLE_CLIENT_ID).'), { status: 503 })
    const bits = String(token || '').split('.')
    if (bits.length !== 3) throw bad()
    let header, payload
    try {
      header = part(bits[0])
      payload = part(bits[1])
    } catch {
      throw bad()
    }
    if (header.alg !== 'RS256') throw bad()
    let jwk = (await googleKeys()).find((k) => k.kid === header.kid)
    if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === header.kid) // Google rotated its keys
    if (!jwk) throw bad()
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${bits[0]}.${bits[1]}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(bits[2], 'base64url'))
    if (!ok) throw bad()
    if (payload.aud !== clientId) throw bad()
    if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw bad()
    if (!payload.exp || payload.exp * 1000 < Date.now() - 60000) throw bad('That sign-in expired. Try again.')
    if (!payload.sub || !payload.email || payload.email_verified === false) throw bad('Your Google account’s email isn’t verified.')
    return payload
  }

  function newSession(userId) {
    const token = rand(32)
    const now = Date.now()
    q.addSession.run(sha(token), userId, now, now)
    return token
  }

  /** Sign in with a Google ID token. New people need an invite; the owner is recognised by ADMIN_EMAIL. */
  async function signIn({ credential, invite }) {
    const g = await verifyGoogle(credential)
    const email = String(g.email).toLowerCase()
    const name = g.name || g.given_name || email.split('@')[0]
    const picture = g.picture || ''
    let user = q.bySub.get(g.sub)
    if (!user && admin && email === admin) {
      const owner = q.user.get('owner')
      if (!owner.google_sub) {
        q.claimOwner.run(g.sub, email, name, picture)
        user = q.user.get('owner')
      }
    }
    if (user) {
      if (user.disabled) throw Object.assign(new Error('Your access to this Gloop has been turned off. Ask the person who invited you.'), { status: 403 })
      q.profile.run(email, name, picture, user.id)
    } else {
      const inv = invite ? q.invite.get(String(invite)) : null
      if (!inv) throw Object.assign(new Error('You need an invite to join this Gloop. Ask the owner for a link.'), { status: 403, code: 'invite' })
      if (inv.used_by) throw Object.assign(new Error('That invite has already been used. Ask for a new one.'), { status: 403, code: 'invite' })
      if (inv.expires < Date.now()) throw Object.assign(new Error('That invite has expired. Ask for a new one.'), { status: 403, code: 'invite' })
      const id = 'u_' + crypto.randomBytes(6).toString('hex')
      db.exec('BEGIN')
      try {
        if (!q.useInvite.run(id, Date.now(), inv.code).changes) throw Object.assign(new Error('That invite has already been used.'), { status: 403, code: 'invite' })
        q.addUser.run(id, g.sub, email, name, picture, Date.now(), rand(24))
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
      user = q.user.get(id)
    }
    return { token: newSession(user.id), user: pub(q.user.get(user.id)) }
  }

  /** Who is calling: the old APP_TOKEN (the owner) or a session token. Null if neither. */
  function resolve(token) {
    if (!token) return null
    if (appToken) {
      const a = Buffer.from(token)
      const b = Buffer.from(appToken)
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return pub(q.user.get('owner'))
    }
    const h = sha(token)
    const s = q.session.get(h)
    if (!s) return null
    const u = q.user.get(s.user_id)
    if (!u || u.disabled) return null
    if (Date.now() - s.seen > 3600000) q.seen.run(Date.now(), h)
    return pub(u)
  }

  /** The user a Claude connector link belongs to (/mcp/<token>); the old APP_TOKEN is the owner's. */
  function resolveMcp(token) {
    if (!token) return null
    const viaApp = appToken && resolve(token)
    if (viaApp) return viaApp
    const u = q.byMcp.get(String(token))
    return u && !u.disabled ? pub(u) : null
  }

  return {
    db,
    enabled: () => !!clientId,
    clientId,
    signIn,
    resolve,
    resolveMcp,
    signOut(token) {
      if (token) q.endSession.run(sha(token))
    },
    me(id) {
      const u = q.user.get(id)
      return { ...pub(u), mcpToken: u.mcp_token }
    },
    /** Everyone whose data should be open (for background jobs: reminders, the weekly review). */
    activeIds: () => q.active.all().map((r) => r.id),
    // ---- the owner's tools ----
    people() {
      const day = today()
      return {
        users: q.users.all().map((u) => ({ ...pub(u), created: u.created, coachToday: q.useToday.get(u.id, day)?.n || 0 })),
        invites: q.openInvites.all(Date.now()).map((i) => ({ code: i.code, created: i.created, expires: i.expires, note: i.note || '' })),
        coachLimit: coachDailyLimit,
      }
    },
    invite(byId, note) {
      const code = rand(12)
      q.addInvite.run(code, byId, Date.now(), Date.now() + INVITE_DAYS * DAY, note ? String(note).slice(0, 80) : null)
      return { code, expires: Date.now() + INVITE_DAYS * DAY }
    },
    revokeInvite: (code) => q.dropInvite.run(String(code)),
    setDisabled(id, disabled) {
      q.setDisabled.run(disabled ? 1 : 0, String(id))
      if (disabled) q.endAll.run(String(id))
    },
    newMcpToken(id) {
      q.newMcp.run(rand(24), id)
      return q.user.get(id).mcp_token
    },
    /** One coach request by `user`: false when they've used today's share (the owner has no limit). */
    coachTake(user) {
      if (user.role === 'admin' || !coachDailyLimit) return true
      const n = q.useToday.get(user.id, today())?.n || 0
      if (n >= coachDailyLimit) return false
      q.bump.run(user.id, today())
      return true
    },
    inviteInfo(code) {
      const i = q.invite.get(String(code || ''))
      if (!i) return { ok: false, reason: 'missing' }
      if (i.used_by) return { ok: false, reason: 'used' }
      if (i.expires < Date.now()) return { ok: false, reason: 'expired' }
      return { ok: true }
    },
  }
}
