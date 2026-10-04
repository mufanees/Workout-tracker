// The coach's physio/OT knowledge on a real server: a stand-in Gemini asks for stretches, and we
// check the tool, its answer, the system prompt and the library. node qa/rehab-test.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const seen = []
const gemini = http
  .createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const body = JSON.parse(raw)
    seen.push(body)
    const last = body.contents.at(-1).parts[0]
    const part = last.functionResponse
      ? { text: `Here you go: ${String(last.functionResponse.response.result).split('\n')[0]}` }
      : { functionCall: { name: 'find_stretches', args: { area: 'elbow', goal: 'tennis elbow', equipment: 'dumbbells' } } }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }] })}\n\n`)
  })
  .listen(0)
await new Promise((r) => gemini.once('listening', r))

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-rehab-'))
const PORT = 3400 + Math.floor(Math.random() * 200)
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, APP_TOKEN: 'k', GEMINI_API_KEY: 'fake', GEMINI_BASE_URL: `http://127.0.0.1:${gemini.address().port}`, BACKUP_DAYS: '0' }
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100))
const base = `http://127.0.0.1:${PORT}`
const results = []
const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`)

try {
  const r = await fetch(base + '/api/coach', { method: 'POST', headers: { authorization: 'Bearer k', 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'My outer elbow hurts when I grip. Stretches?' }], context: '' }) })
  const sse = await r.text()
  const events = sse.split('\n\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5)))
  check('coach answers', r.status === 200 && events.some((e) => e.done), String(r.status))
  check('tool status sent to the app', events.some((e) => e.tool === 'find_stretches'))
  const tools = seen[0].tools[0].functionDeclarations.map((d) => d.name)
  check('find_stretches offered to the model', tools.includes('find_stretches'))
  const sys = seen[0].systemInstruction.parts[0].text
  check('system prompt has physio/OT rules', /Red flags/.test(sys) && /find_stretches/.test(sys) && /occupational therapy/i.test(sys))
  const toolResult = String(seen[1]?.contents.at(-1).parts[0].functionResponse?.response?.result || '')
  check('tool returns elbow rehab with doses', /Eccentric Wrist Extension/.test(toolResult) && /Dose:/.test(toolResult) && /1\. /.test(toolResult), toolResult.split('\n')[0])
  const text = events.filter((e) => e.t).map((e) => e.t).join('')
  check('model got the result and answered', /Here you go/.test(text))

  // MCP library has the rehab exercises, so routines can use them by name
  const m = await fetch(base + '/mcp/k', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_exercises', arguments: { query: 'nerve glide' } } }) })
  const mj = await m.json()
  const mt = JSON.stringify(mj)
  check('library has rehab exercises (MCP search)', /Median Nerve Glide/.test(mt) && /Sciatic Nerve Glide/.test(mt), mt.slice(0, 120))
  const k = await fetch(base + '/mcp/k', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_exercises', arguments: { query: 'chin tuck' } } }) })
  check('chin tuck in library', /Chin Tuck/.test(JSON.stringify(await k.json())))
} catch (e) {
  results.push('ERROR ' + e.message)
}
console.log(results.join('\n'))
if (results.some((r) => !r.startsWith('PASS'))) console.log(log.slice(-1500))
srv.kill()
gemini.close()
