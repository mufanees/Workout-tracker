// End-to-end test of accounts on a real server process, with a stand-in for Google's signing keys.
// node qa/accounts-test.mjs   (needs nothing running)
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-acc-'))
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
const jwks = http.createServer((req, res) => res.end(JSON.stringify({ keys: [jwk] }))).listen(0)
await new Promise((r) => jwks.once('listening', r))
const JWKS = `http://127.0.0.1:${jwks.address().port}/certs`
const CLIENT = 'test-client.apps.googleusercontent.com'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function idToken(claims, { key = privateKey, kid = 'k1' } = {}) {
  const h = b64({ alg: 'RS256', kid, typ: 'JWT' })
  const p = b64({ iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, ...claims })
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key).toString('base64url')
  return `${h}.${p}.${sig}`
}

// the owner's existing data, written the old way (before accounts existed)
const PORT = 3200 + Math.floor(Math.random() * 300)
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, APP_TOKEN: 'legacy-key', GOOGLE_CLIENT_ID: CLIENT, ADMIN_EMAIL: 'Owner@Example.com', GOOGLE_JWKS_URL: JWKS, COACH_DAILY_LIMIT: '2', GEMINI_API_KEY: 'fake', GEMINI_BASE_URL: 'http://127.0.0.1:9', BACKUP_DAYS: '0' }
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100))

const base = `http://127.0.0.1:${PORT}`
const api = async (p, { token, body, method } = {}) => {
  const r = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let j = null
  try { j = await r.json() } catch {}
  return { status: r.status, body: j }
}
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`)
const rec = (id, name) => ({ store: 'routines', id, updatedAt: Date.now(), deleted: false, data: { id, name, folder: '', notes: '', order: 0, exercises: [], updatedAt: Date.now() } })
const names = (r) => (r.body?.changes || []).filter((c) => c.store === 'routines').map((c) => c.data.name).sort().join(',')

// 1. the old key still works and is the owner
let r = await api('/api/sync', { token: 'legacy-key', body: { since: 0, changes: [rec('r-owner', 'Owner routine')] } })
check('legacy APP_TOKEN syncs as before', r.status === 200 && names(r) === 'Owner routine')
const ownerDb = r.body.dbId

// 2. the owner signs in with Google (email matched case-insensitively) and gets the same data
r = await api('/api/auth/google', { body: { credential: idToken({ sub: 'g-owner', email: 'owner@example.com', name: 'Owner' }) } })
check('owner signs in with Google', r.status === 200 && r.body.user.id === 'owner' && r.body.user.role === 'admin', r.body?.error)
const ownerTok = r.body.token
r = await api('/api/sync', { token: ownerTok, body: { since: 0, changes: [] } })
check('owner session sees the existing data', names(r) === 'Owner routine' && r.body.dbId === ownerDb)

// 3. a stranger without an invite is refused
r = await api('/api/auth/google', { body: { credential: idToken({ sub: 'g-friend', email: 'friend@example.com', name: 'Friend' }) } })
check('no invite → refused', r.status === 403 && r.body.code === 'invite', r.body?.error)

// 4. bad tokens
r = await api('/api/auth/google', { body: { credential: idToken({ sub: 'g-x', email: 'owner@example.com' }, { key: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }) } })
check('forged signature → 401', r.status === 401)
r = await api('/api/auth/google', { body: { credential: idToken({ sub: 'g-owner', email: 'owner@example.com', aud: 'someone-else' }) } })
check('token for another app → 401', r.status === 401)
r = await api('/api/auth/google', { body: { credential: idToken({ sub: 'g-owner', email: 'owner@example.com', exp: 1000 }) } })
check('expired token → 401', r.status === 401)

// 5. the owner invites; the friend joins with the link
r = await api('/api/admin/invite', { token: ownerTok, body: { note: 'Sam' } })
const code = r.body?.code
check('owner creates an invite', r.status === 200 && !!code)
r = await api(`/api/auth/invite?code=${code}`)
check('invite link is valid', r.body?.ok === true)
r = await api('/api/auth/google', { body: { credential: idToken({ sub: 'g-friend', email: 'friend@example.com', name: 'Friend' }), invite: code } })
check('friend joins with the invite', r.status === 200 && r.body.user.role === 'member', r.body?.error)
const friendTok = r.body.token
const friendId = r.body.user.id
r = await api('/api/auth/google', { body: { credential: idToken({ sub: 'g-third', email: 'third@example.com' }), invite: code } })
check('used invite can’t be reused', r.status === 403)
r = await api('/api/auth/google', { body: { credential: idToken({ sub: 'g-friend', email: 'friend@example.com' }) } })
check('friend signs in again later without an invite', r.status === 200 && r.body.user.id === friendId)

// 6. isolation
r = await api('/api/sync', { token: friendTok, body: { since: 0, changes: [rec('r-friend', 'Friend routine')] } })
check('friend sees only their own data', names(r) === 'Friend routine' && r.body.dbId !== ownerDb, names(r))
r = await api('/api/sync', { token: ownerTok, body: { since: 0, changes: [] } })
check('owner doesn’t see the friend’s data', names(r) === 'Owner routine', names(r))
// same record id in both accounts stays separate
await api('/api/sync', { token: friendTok, body: { since: 0, changes: [rec('r-owner', 'Friend overwrite attempt')] } })
r = await api('/api/sync', { token: ownerTok, body: { since: 0, changes: [] } })
check('same record id in another account can’t touch the owner’s', names(r) === 'Owner routine', names(r))

// 7. Claude connector links are per person
const mcpCall = async (tok) => (await fetch(`${base}/mcp/${tok}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_routines', arguments: {} } }) })).json()
const friendMe = (await api('/api/auth/me', { token: friendTok })).body.user
let m = await mcpCall(friendMe.mcpToken)
check('friend’s connector link reads the friend’s data', JSON.stringify(m).includes('Friend overwrite attempt') && !JSON.stringify(m).includes('Owner routine'))
m = await mcpCall('legacy-key')
check('old connector link (APP_TOKEN) is still the owner’s', JSON.stringify(m).includes('Owner routine'))
r = await fetch(`${base}/mcp/not-a-token`, { method: 'POST', body: '{}' })
check('unknown connector link → 401', r.status === 401)

// 8. owner-only tools
r = await api('/api/admin/people', { token: friendTok })
check('members can’t see the people list', r.status === 403)
r = await api('/api/admin/people', { token: ownerTok })
check('owner sees people and no pending invites', r.status === 200 && r.body.users.length === 2 && r.body.invites.length === 0)

// 9. coach daily limit (2 for members, owner unlimited); Gemini is unreachable here so calls fail with 502 but count
for (let i = 0; i < 2; i++) await api('/api/coach/quick', { token: friendTok, body: { kind: 'pre', context: 'x' } })
r = await api('/api/coach/quick', { token: friendTok, body: { kind: 'pre', context: 'x' } })
check('member hits the daily coach limit', r.status === 429, r.body?.error)
for (let i = 0; i < 3; i++) r = await api('/api/coach/quick', { token: ownerTok, body: { kind: 'pre', context: 'x' } })
check('owner has no coach limit', r.status !== 429)

// 10. turning someone off signs them out everywhere
await api('/api/admin/access', { token: ownerTok, body: { id: friendId, disabled: true } })
r = await api('/api/sync', { token: friendTok, body: { since: 0, changes: [] } })
check('turned-off member is locked out', r.status === 401)
r = await api('/api/auth/google', { body: { credential: idToken({ sub: 'g-friend', email: 'friend@example.com' }) } })
check('turned-off member can’t sign back in', r.status === 403)
m = await mcpCall(friendMe.mcpToken)
check('turned-off member’s connector link stops working', !m.result)

// 11. sign out ends the session
await api('/api/auth/logout', { token: ownerTok, body: {} })
r = await api('/api/sync', { token: ownerTok, body: { since: 0, changes: [] } })
check('signed-out session no longer works', r.status === 401)
check('files: owner reps.db, friend users/<id>.db, accounts.db', fs.existsSync(path.join(dir, 'reps.db')) && fs.existsSync(path.join(dir, 'users', friendId + '.db')) && fs.existsSync(path.join(dir, 'accounts.db')))

srv.kill()
jwks.close()
console.log(results.join('\n'))
const failed = results.filter((x) => x.startsWith('FAIL')).length
console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} passed`)
if (failed) console.log(log.slice(-2000))
fs.rmSync(dir, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
