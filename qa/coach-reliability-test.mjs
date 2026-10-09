// Coach chat reliability on a real server against a stand-in Gemini: long pastes, silent streams,
// empty and malformed answers, rate limits, split SSE chunks, resuming a lost stream, and the
// program library proposal. No real key needed.   node qa/coach-reliability-test.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const seen = {} // scenario → request bodies
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ev = (obj) => `data: ${JSON.stringify(obj)}\n\n`
const cand = (parts, finishReason) => ({ candidates: [{ content: { role: 'model', parts }, ...(finishReason ? { finishReason } : {}) }] })
let silentClosed = false

/** The athlete's latest typed message (not a tool result). */
const lastText = (body) => {
  for (let i = body.contents.length - 1; i >= 0; i--) {
    const c = body.contents[i]
    const t = c.role === 'user' && c.parts.find((p) => typeof p.text === 'string')
    if (t) return t.text
  }
  return ''
}

const gemini = http
  .createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const body = JSON.parse(raw)
    const text = lastText(body)
    const key = (text.match(/\[(\w+)\]/) || [])[1] || 'PLAIN'
    ;(seen[key] ||= []).push(body)
    const n = seen[key].length
    const toolResult = body.contents.at(-1).parts[0]?.functionResponse
    const sse = () => res.writeHead(200, { 'content-type': 'text/event-stream' })
    switch (key) {
      case 'LONG':
        sse()
        return res.end(ev(cand([{ text: `Got ${text.length} characters.` }], 'STOP')))
      case 'SILENT':
        sse()
        res.write(ev(cand([{ text: 'Thinking about ' }])))
        req.socket.on('close', () => (silentClosed = true))
        return // never another byte
      case 'EMPTY':
        sse()
        return res.end(ev(cand([], 'STOP')))
      case 'MALFORMED':
        sse()
        return res.end(ev({ candidates: [{ finishReason: 'MALFORMED_FUNCTION_CALL', finishMessage: 'Malformed function call: ...' }] }))
      case 'MAXTOK':
        sse()
        return res.end(ev(cand([], 'MAX_TOKENS')))
      case 'CATALOG':
      case 'BADID':
        sse()
        if (toolResult) return res.end(ev(cand([{ text: toolResult.response.error ? 'No such program.' : 'Tap Approve to start it.' }], 'STOP')))
        return res.end(ev(cand([{ functionCall: { name: 'propose_catalog_program', args: { id: key === 'CATALOG' ? 'buff-dudes-12' : 'nope', reason: 'You asked for it' } }, thoughtSignature: 'sig-abc' }], 'STOP')))
      case 'RATE':
        res.writeHead(429, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota.', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '120s' }] } }))
      case 'DAILY':
        res.writeHead(429, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ error: { code: 429, message: 'Quota exceeded.', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }))
      case 'BUSY':
        // Short per-minute limit once, then fine: the server should wait and carry on.
        if (n === 1) {
          res.writeHead(429, { 'content-type': 'application/json' })
          return res.end(JSON.stringify({ error: { code: 429, message: 'Slow down.', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1s' }] } }))
        }
        sse()
        return res.end(ev(cand([{ text: 'Made it.' }], 'STOP')))
      case 'SPLIT': {
        sse()
        const whole = ev(cand([{ text: 'Split ' }])).replace(/\n/g, '\r\n') + ev(cand([{ text: 'chunks work.' }], 'STOP'))
        const cuts = [7, 40, whole.indexOf('\r\n\r\n') + 2, whole.length - 30, whole.length]
        let at = 0
        for (const c of cuts) {
          res.write(whole.slice(at, c))
          at = c
          await sleep(60)
        }
        return res.end()
      }
      case 'GARBLED':
        sse()
        return res.end('data: {"candidates": [{"content": {"parts": [{"text": "ha\n\n' + ev(cand([{ text: 'Still here.' }], 'STOP')))
      case 'MIDERROR':
        sse()
        return res.end(ev(cand([{ text: 'Half ' }])) + ev({ error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } }))
      case 'RESUME':
        sse()
        res.write(ev(cand([{ text: 'Part one. ' }])))
        await sleep(1500)
        return res.end(ev(cand([{ text: 'Part two.' }], 'STOP')))
      default:
        sse()
        return res.end(ev(cand([{ text: 'Hello.' }], 'STOP')))
    }
  })
  .listen(0)
await new Promise((r) => gemini.once('listening', r))

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-coach-rel-'))
const PORT = Number(process.env.PORT_TEST || 3200)
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, APP_TOKEN: 'k', GEMINI_API_KEY: 'fake', GEMINI_BASE_URL: `http://127.0.0.1:${gemini.address().port}`, BACKUP_DAYS: '0', COACH_IDLE_MS: '2000' }
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await sleep(100)
const base = `http://127.0.0.1:${PORT}`
const results = []
const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`)

const post = (body, signal) => fetch(base + '/api/coach', { method: 'POST', signal, headers: { authorization: 'Bearer k', 'content-type': 'application/json' }, body: JSON.stringify(body) })
const events = (sse) => sse.split('\n\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5)))
async function chat(messages, extra = {}) {
  const t0 = Date.now()
  const r = await post({ messages, context: 'TRAINING DATA', ...extra })
  const list = events(await r.text())
  return { status: r.status, list, text: list.filter((e) => e.t).map((e) => e.t).join(''), error: list.find((e) => e.error)?.error || '', done: list.some((e) => e.done), ms: Date.now() - t0 }
}
const say = (content) => [{ role: 'user', content }]

try {
  // 1. A long paste arrives whole; older history stays bounded.
  const paste = '[LONG] Switch me to this program:\n' + 'Phase 1 Day 1: goblet squat 3x10, floor press 3x10, row 3x10. '.repeat(400) + 'END-OF-PASTE'
  const old = Array.from({ length: 4 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `old ${i} ` + 'x'.repeat(9000) }))
  const long = await chat([...old, { role: 'user', content: paste }])
  const sentLast = lastText(seen.LONG[0])
  check('long paste (>8k) arrives intact', paste.length > 20000 && sentLast === paste && long.text.includes(`Got ${paste.length}`), `${paste.length} chars sent, ${sentLast.length} received`)
  check('older messages still trimmed to 8k', seen.LONG[0].contents.slice(0, -1).every((c) => c.parts[0].text.length <= 8000))

  // 2. Gemini goes silent mid-answer: readable timeout, connection closed, Gemini request dropped.
  const silent = await chat(say('[SILENT] plan please'))
  check('silent stream → readable timeout', /stopped responding/.test(silent.error) && silent.text.startsWith('Thinking about'), silent.error.slice(0, 80))
  check('silent stream → connection closed promptly', silent.ms < 8000, `${silent.ms} ms`)
  await sleep(200)
  check('silent stream → request to Gemini aborted', silentClosed)

  // 3. Empty finish: one retry forced to words, then a useful message.
  const empty = await chat(say('[EMPTY] hi'))
  check('empty answer retried once, forcing text', seen.EMPTY.length === 2 && seen.EMPTY[1].toolConfig?.functionCallingConfig?.mode === 'NONE', `${seen.EMPTY.length} requests`)
  check('empty answer → useful message, not "…"', /without an answer/.test(empty.text) && empty.done, empty.text.slice(0, 80))

  // 4. MALFORMED_FUNCTION_CALL: retried once, then explained.
  const bad = await chat(say('[MALFORMED] build me a 12 week program'))
  check('malformed call retried once', seen.MALFORMED.length === 2)
  check('malformed call → readable message', /garbled/.test(bad.text) && /phase/.test(bad.text) && bad.done, bad.text.slice(0, 90))

  // 5. MAX_TOKENS with nothing written.
  const max = await chat(say('[MAXTOK] the whole program please'))
  check('MAX_TOKENS → "too long" message', /too long/.test(max.text), max.text.slice(0, 80))

  // 6. Program library: proposal event, prompt and declaration, thought signature echoed.
  const cat = await chat(say('[CATALOG] Switch my plan to the Buff Dudes 12 week program'))
  const prop = cat.list.find((e) => e.proposal)?.proposal
  check('propose_catalog_program → proposal event', prop?.tool === 'propose_catalog_program' && prop.args.id === 'buff-dudes-12', JSON.stringify(prop || {}).slice(0, 100))
  check('then the model answers', /Approve/.test(cat.text) && cat.done)
  const req0 = seen.CATALOG[0]
  check('tool declared to Gemini', req0.tools[0].functionDeclarations.some((d) => d.name === 'propose_catalog_program'))
  const sys = req0.systemInstruction.parts[0].text
  check('system prompt has PROGRAM LIBRARY with buff-dudes-12', /PROGRAM LIBRARY/.test(sys) && /buff-dudes-12/.test(sys) && /propose_catalog_program/.test(sys))
  check('planning question uses the bigger output budget', req0.generationConfig.maxOutputTokens === 65536)
  const echoed = seen.CATALOG[1]?.contents.find((c) => c.role === 'model')?.parts[0]
  check('thought signature sent back unchanged', echoed?.thoughtSignature === 'sig-abc' && echoed.functionCall?.name === 'propose_catalog_program')
  const badId = await chat(say('[BADID] start the nope program'))
  const badResp = seen.BADID[1]?.contents.at(-1).parts[0].functionResponse.response
  check('unknown program id → no card, ids returned to the model', !badId.list.some((e) => e.proposal) && /buff-dudes-12/.test(badResp?.error || ''), badResp?.error?.slice(0, 80))

  // 7. Rate limits.
  const rate = await chat(say('[RATE] hi'))
  check('429 per-minute → plain free-limit message', /free Gemini limit/.test(rate.error) && rate.ms < 3000, `${rate.error.slice(0, 90)} · ${rate.ms} ms`)
  const daily = await chat(say('[DAILY] hi'))
  check('429 daily → says daily limit', /daily limit/.test(daily.error) && seen.DAILY.length === 1, daily.error.slice(0, 80))
  const busy = await chat(say('[BUSY] hi'))
  check('short 429 waited out, then answered', busy.text === 'Made it.' && busy.done && seen.BUSY.length === 2, `${busy.text} ${busy.error}`)

  // 8. SSE framing: a JSON event split across network chunks (CRLF), and a garbled event.
  const split = await chat(say('[SPLIT] hi'))
  check('split SSE chunk parses', split.text === 'Split chunks work.' && split.done, JSON.stringify(split.text))
  const garbled = await chat(say('[GARBLED] hi'))
  check('garbled SSE event skipped, reply survives', garbled.text === 'Still here.' && garbled.done && !garbled.error, garbled.error || garbled.text)
  const mid = await chat(say('[MIDERROR] hi'))
  check('error inside the stream → friendly message', /overloaded/.test(mid.error) && mid.text === 'Half ', mid.error)

  // 9. Lost connection: the reply keeps running on the server and can be picked up again.
  const ctrl = new AbortController()
  const r = await post({ messages: say('[RESUME] long one'), context: '', run: 'run-test-123' }, ctrl.signal)
  const reader = r.body.getReader()
  await reader.read() // first event arrives…
  ctrl.abort() // …then the phone loses the stream
  await sleep(300)
  const resumed = await chat([], { resume: 'run-test-123' })
  check('resume replays and finishes the reply', resumed.text === 'Part one. Part two.' && resumed.done, JSON.stringify(resumed.text))
  check('Gemini asked only once for the resumed reply', seen.RESUME.length === 1)
  const gone = await chat([], { resume: 'run-never' })
  check('resume of an unknown run → clear message', /no longer on the server/.test(gone.error))
} catch (e) {
  results.push('ERROR ' + (e.stack || e.message))
}
console.log(results.join('\n'))
const failed = results.filter((r) => !r.startsWith('PASS')).length
console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed) console.log(log.slice(-2000))
srv.kill()
gemini.closeAllConnections?.()
gemini.close()
process.exit(failed ? 1 : 0)
