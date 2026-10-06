import { DatabaseSync } from 'node:sqlite'
import crypto from 'node:crypto'
const { createPush } = await import('/home/user/Workout-tracker/server/push.mjs')
const db = new DatabaseSync(':memory:')
db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
const sent = []
globalThis.fetch = async (url, opts) => (sent.push({ url, opts }), new Response('', { status: 201 }))
const push = createPush(db, { subject: 'mailto:me@example.com' })
const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123'
push.subscribe(endpoint)
push.schedule({ key: 'fast', at: Date.now() - 1, title: 'Fast complete', body: 'You reached 16 hours.' })
push.schedule({ key: 'rest', at: Date.now() + 60000, title: 'Rest is over', body: 'later' })
await new Promise((r) => setTimeout(r, 2600))
console.log('pushes sent:', sent.length, sent[0]?.url, sent[0]?.opts.headers.TTL)
const auth = sent[0].opts.headers.Authorization
const [, t, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/)
const [h, c, sig] = t.split('.')
const claims = JSON.parse(Buffer.from(c, 'base64url'))
const raw = Buffer.from(k, 'base64url')
const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' })
const ok = crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))
console.log('jwt aud', claims.aud, 'sig valid', ok, 'key matches', k === push.publicKey)
console.log('inbox:', JSON.stringify(push.take(endpoint)), 'second take:', JSON.stringify(push.take(endpoint)))
process.exit(0)
