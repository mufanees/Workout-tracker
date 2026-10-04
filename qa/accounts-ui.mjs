// Browser walk of accounts: owner signs in, invites, a friend joins from the link, owner turns access off,
// friend signs out. Google's script is replaced by a stand-in button that hands over a test-signed token.
// npm run build && node qa/accounts-ui.mjs
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-ui-'))
const shots = 'qa/shots-accounts'
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
const jwks = http.createServer((req, res) => res.end(JSON.stringify({ keys: [jwk] }))).listen(0)
await new Promise((r) => jwks.once('listening', r))
const CLIENT = 'test-client.apps.googleusercontent.com'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const idToken = (claims) => {
  const h = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
  const p = b64({ iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, ...claims })
  return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`
}
const PORT = 3600 + Math.floor(Math.random() * 300)
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, GOOGLE_CLIENT_ID: CLIENT, ADMIN_EMAIL: 'owner@example.com', GOOGLE_JWKS_URL: `http://127.0.0.1:${jwks.address().port}/certs`, BACKUP_DAYS: '0' }
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100))
const base = `http://127.0.0.1:${PORT}`

const GSI = `window.google={accounts:{id:{
  initialize(o){window.__gcb=o.callback},
  renderButton(el){const b=document.createElement('button');b.className='fake-g';b.textContent='Continue with Google';b.onclick=()=>window.__gcb({credential:window.__cred});el.replaceChildren(b)}}}}`
const browser = await chromium.launch()
const results = []
const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`)
async function device(cred, scheme = 'light') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GSI }))
  await ctx.addInitScript((c) => (window.__cred = c), cred)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => results.push('PAGEERROR ' + e.message))
  return page
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  // Owner, fresh device
  const owner = await device(idToken({ sub: 'g-owner', email: 'owner@example.com', name: 'Alex Owner' }))
  await owner.goto(base + '/#/train')
  await owner.waitForSelector('.signin-nudge', { timeout: 8000 })
  check('Train shows the sign-in card', true)
  await wait(1500)
  await owner.screenshot({ path: `${shots}/1-train-nudge.png` })
  await owner.click('.signin-nudge')
  await owner.waitForSelector('.fake-g')
  await owner.screenshot({ path: `${shots}/2-settings-signed-out.png`, fullPage: true })
  await owner.click('.fake-g')
  await owner.waitForSelector('.account-row', { timeout: 8000 })
  check('owner signed in', (await owner.textContent('.account-row')).includes('owner'))
  await owner.waitForSelector('.people')
  check('owner sees People', true)
  check('owner sees connector link', !!(await owner.$('.connector-row code')))
  await owner.fill('.people input[type=text]', 'Sam')
  await owner.click('.people .btn-primary')
  await owner.waitForSelector('.people .connector-row code')
  const inviteUrl = (await owner.textContent('.people .connector-row code')).trim()
  check('invite link made', /#\/join\/\w+/.test(inviteUrl), inviteUrl)
  await wait(600)
  await owner.locator('.people').scrollIntoViewIfNeeded()
  await owner.screenshot({ path: `${shots}/3-owner-people.png`, fullPage: true })
  await owner.goto(base + '/#/train')
  await owner.waitForTimeout(800)
  check('nudge gone once signed in', !(await owner.$('.signin-nudge')))

  // Friend opens the invite link on their phone
  const friend = await device(idToken({ sub: 'g-sam', email: 'sam@example.com', name: 'Sam Friend' }), 'dark')
  await friend.goto(inviteUrl)
  await friend.waitForSelector('.join-screen .fake-g', { timeout: 8000 })
  await wait(1500)
  await friend.screenshot({ path: `${shots}/4-join.png` })
  await friend.click('.fake-g')
  await friend.waitForFunction(() => location.hash.startsWith('#/train'), null, { timeout: 8000 })
  check('friend joined and lands on Train', true)
  await friend.goto(base + '/#/settings')
  await friend.waitForSelector('.account-row')
  check('friend is a member', (await friend.textContent('.account-row')).includes('sam@example.com') && !(await friend.$('.people')))
  await friend.screenshot({ path: `${shots}/5-friend-settings.png`, fullPage: true })

  // Used link
  const third = await device(idToken({ sub: 'g-3', email: 'x@example.com' }))
  await third.goto(inviteUrl)
  await third.waitForSelector('text=already been used', { timeout: 8000 })
  check('used invite link says so', true)
  await wait(1500)
  await third.screenshot({ path: `${shots}/6-join-used.png` })

  // Owner sees Sam and turns access off
  await owner.goto(base + '/#/settings')
  await owner.waitForSelector('.person')
  check('owner sees the member', (await owner.textContent('.person')).includes('sam@example.com'))
  await owner.screenshot({ path: `${shots}/7-owner-member.png`, fullPage: true })
  await owner.click('.person [role=switch], .person button, .person input')
  await owner.waitForSelector('text=Turn off')
  await owner.click('.sheet button:has-text("Turn off"), dialog button:has-text("Turn off"), button:has-text("Turn off") >> nth=-1')
  await owner.waitForSelector('.person.off', { timeout: 8000 })
  check('access turned off', true)
  const r = await fetch(base + '/api/auth/me', { headers: { authorization: 'Bearer ' + (await friend.evaluate(() => localStorage.getItem('reps-token'))) } })
  check('friend session ended', r.status === 401, String(r.status))

  // Owner signs out: local copy cleared
  await owner.goto(base + '/#/settings')
  await owner.waitForSelector('text=Sign out')
  await owner.click('button.setting:has-text("Sign out")')
  await owner.click('button:has-text("Sign out") >> nth=-1')
  await owner.waitForFunction(() => !localStorage.getItem('reps-token'), null, { timeout: 8000 })
  await owner.waitForTimeout(1500)
  check('owner signed out', !(await owner.evaluate(() => localStorage.getItem('gloop-account'))))
} catch (e) {
  results.push('ERROR ' + e.message.split('\n')[0])
}
console.log(results.join('\n'))
await browser.close()
srv.kill()
jwks.close()
