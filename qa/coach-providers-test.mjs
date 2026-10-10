// Coach on other APIs: a real server against stand-ins for an OpenAI-compatible Chat Completions API and
// Claude's Messages API (SSE formats as documented), plus the status and test endpoints. No real key needed.
//   node qa/coach-providers-test.mjs        (ports PORT_TEST..PORT_TEST+2, default 3831–3833)
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const seen = { openai: {}, anthropic: {} } // provider → scenario → request bodies
const headersSeen = { openai: [], anthropic: [] }
const tagOf = (s) => (String(s).match(/\[([A-Z0-9_]+)\]/) || [])[1]

// ---- OpenAI-compatible stand-in ----
const oaChunk = (delta, finish_reason = null) => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`
const oaUsage = `data: ${JSON.stringify({ id: 'c1', choices: [], usage: { prompt_tokens: 900, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 800 } } })}\n\n`
function quickReply(prompt) {
  if (/Reply with OK/.test(prompt)) return 'OK'
  if (/LIVE WORKOUT/.test(prompt)) return JSON.stringify({ line: 'Push the last set.', adjust: { exercise: 'Goblet Squat', weight_kg: 22 } })
  if (/is starting "/.test(prompt)) return JSON.stringify({ focus: 'Smooth reps.', targets: [{ exercise: 'Goblet Squat', weight_kg: 20, reps: '8-10' }] })
  if (/just finished/.test(prompt)) return JSON.stringify({ takeaway: 'Squat moved up 2 kg.', met: [], missed: [] })
  if (/older chat messages/.test(prompt)) return JSON.stringify({ notes: ['Prefers mornings.'] })
  if (/weekly review/.test(prompt)) return JSON.stringify({ headline: 'Good week', review: '- 3 sessions' })
  return JSON.stringify({ answer: 'live?' })
}
async function openaiHandler(req, res, body) {
  const msgs = body.messages || []
  const athlete = [...msgs].reverse().find((m) => m.role === 'user')?.content || ''
  const sys = msgs.find((m) => m.role === 'system')?.content || ''
  const key = tagOf(athlete) || tagOf(sys) || 'PLAIN'
  ;(seen.openai[key] ||= []).push(body)
  const n = seen.openai[key].length
  const toolMsgs = msgs.filter((m) => m.role === 'tool')
  const jsonErr = (status, error, headers = {}) => (res.writeHead(status, { 'content-type': 'application/json', ...headers }), res.end(JSON.stringify({ error })))
  if (key === 'E401') return jsonErr(401, { message: 'Incorrect API key provided: sk-fake.', type: 'invalid_request_error', code: 'invalid_api_key' })
  if (key === 'E402') return jsonErr(402, { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: 402 })
  if (key === 'E404') return jsonErr(404, { message: `The model \`${body.model}\` does not exist or you do not have access to it.`, type: 'invalid_request_error', code: 'model_not_found' })
  if (key === 'E429') return jsonErr(429, { message: 'Rate limit reached for requests', type: 'requests', code: 'rate_limit_exceeded' }, { 'retry-after': '120' })
  if (key === 'QUOTA') return jsonErr(429, { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' })
  if (key === 'SHORT429' && n === 1) return jsonErr(429, { message: 'slow down', code: 'rate_limit_exceeded' }, { 'retry-after': '1' })
  if (key === 'MAXTOK' && 'max_tokens' in body) return jsonErr(400, { message: 'Invalid max_tokens value, the valid range of max_tokens is [1, 8192]', type: 'invalid_request_error' })
  if (!body.stream) {
    const prompt = msgs.at(-1)?.content || ''
    if (key === 'NOSCHEMA' && body.response_format?.type === 'json_schema') return jsonErr(400, { message: "response_format type 'json_schema' is not supported by this model", type: 'invalid_request_error' })
    let content = quickReply(prompt)
    if (key === 'NOSCHEMA') content = 'Here you go:\n```json\n' + content + '\n```'
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ id: 'x', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10 } }))
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const end = (s) => res.end(s + oaUsage + 'data: [DONE]\n\n')
  switch (key) {
    case 'TOOL':
      if (!toolMsgs.length) {
        res.write(': keep-alive comment\n\n')
        res.write(oaChunk({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: 'call_abc', type: 'function', function: { name: 'list_routines', arguments: '' } }] }))
        return end(oaChunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }) + oaChunk({}, 'tool_calls'))
      }
      return end(oaChunk({ content: `You have ${/ROUTINE-A/.test(toolMsgs[0].content) ? 'Routine A' : 'nothing'}.` }) + oaChunk({}, 'stop'))
    case 'PARALLEL':
      if (!toolMsgs.length)
        return end(
          oaChunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'list_routines', arguments: '{}' } }, { index: 1, id: 'call_2', type: 'function', function: { name: 'training_knowledge', arguments: '{"topic":' } }] }) +
            oaChunk({ tool_calls: [{ index: 1, function: { arguments: '"dumbbells"}' } }] }) +
            oaChunk({}, 'tool_calls'),
        )
      return end(oaChunk({ content: `Got ${toolMsgs.length} results.` }) + oaChunk({}, 'stop'))
    case 'PROPOSE':
      if (!toolMsgs.length)
        return end(
          oaChunk({ content: 'Setting that up. ' }) +
            oaChunk({ tool_calls: [{ index: 0, id: 'call_g', type: 'function', function: { name: 'propose_goal', arguments: '{"metric":"lift",' } }] }) +
            oaChunk({ tool_calls: [{ index: 0, function: { arguments: '"target":100,"reps":3,"exercise":"any","text":"100 kg total"}' } }] }) +
            oaChunk({}, 'tool_calls'),
        )
      return end(oaChunk({ content: 'Tap Approve.' }) + oaChunk({}, 'stop'))
    case 'EMPTY':
      return end(oaChunk({ content: '' }, 'stop'))
    case 'MALFORMED':
      return end(oaChunk({ tool_calls: [{ index: 0, id: 'call_m', type: 'function', function: { name: 'propose_goal', arguments: '{"metric": ' } }] }) + oaChunk({}, 'tool_calls'))
    case 'MIDERR':
      return res.end(oaChunk({ content: 'Half ' }) + `data: ${JSON.stringify({ error: { message: 'Upstream overloaded', code: 503 } })}\n\n`)
    case 'LENGTH':
      return end(oaChunk({ content: 'A long ' }) + oaChunk({ content: 'answer' }, 'length'))
    default:
      res.write(oaChunk({ role: 'assistant', content: '' }))
      for (const t of ['Hel', 'lo ', 'there.']) {
        res.write(oaChunk({ content: t }))
        await sleep(20)
      }
      return end(oaChunk({}, 'stop'))
  }
}

// ---- Claude Messages API stand-in ----
const an = (type, obj) => `event: ${type}\ndata: ${JSON.stringify({ type, ...obj })}\n\n`
const anStart = (input = 50) => an('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', content: [], model: 'm', stop_reason: null, usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 } } })
const anStop = (reason, out = 20) => an('message_delta', { delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: out } }) + an('message_stop', {})
const anThinking = (i) => an('content_block_start', { index: i, content_block: { type: 'thinking', thinking: '', signature: '' } }) + an('content_block_delta', { index: i, delta: { type: 'signature_delta', signature: 'SIG-xyz' } }) + an('content_block_stop', { index: i })
const anText = (i, parts) => an('content_block_start', { index: i, content_block: { type: 'text', text: '' } }) + parts.map((t) => an('content_block_delta', { index: i, delta: { type: 'text_delta', text: t } })).join('') + an('content_block_stop', { index: i })
const anTool = (i, id, name, chunks) =>
  an('content_block_start', { index: i, content_block: { type: 'tool_use', id, name, input: {} } }) + chunks.map((c) => an('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: c } })).join('') + an('content_block_stop', { index: i })
async function anthropicHandler(req, res, body) {
  headersSeen.anthropic.push({ key: req.headers['x-api-key'], version: req.headers['anthropic-version'] })
  const msgs = body.messages || []
  const athlete = [...msgs].reverse().find((m) => m.role === 'user' && typeof m.content === 'string')?.content || ''
  const sys = (Array.isArray(body.system) ? body.system.map((b) => b.text).join('\n') : body.system) || ''
  const key = tagOf(athlete) || tagOf(sys) || 'PLAIN'
  ;(seen.anthropic[key] ||= []).push(body)
  const n = seen.anthropic[key].length
  const results = msgs.flatMap((m) => (Array.isArray(m.content) ? m.content.filter((b) => b.type === 'tool_result') : []))
  const err = (status, type, message, headers = {}) => (res.writeHead(status, { 'content-type': 'application/json', ...headers }), res.end(JSON.stringify({ type: 'error', error: { type, message } })))
  if (key === 'E401') return err(401, 'authentication_error', 'invalid x-api-key')
  if (key === 'E404') return err(404, 'not_found_error', `model: ${body.model}`)
  if (key === 'E429') return err(429, 'rate_limit_error', 'Number of request tokens has exceeded your per-minute rate limit', { 'retry-after': '120' })
  if (key === 'CREDITS') return err(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.')
  if (key === 'EFFORT' && body.output_config?.effort) return err(400, 'invalid_request_error', 'output_config.effort: Extra inputs are not permitted')
  if (key === 'BUSY' && n === 1) return err(529, 'overloaded_error', 'Overloaded', { 'retry-after': '1' })
  if (!body.stream) {
    const prompt = msgs.at(-1)?.content || ''
    if (key === 'NOSCHEMA' && body.output_config?.format) return err(400, 'invalid_request_error', 'output_config.format.schema: unsupported schema feature')
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ id: 'msg_q', type: 'message', role: 'assistant', content: [{ type: 'text', text: quickReply(prompt) }], stop_reason: 'end_turn', usage: { input_tokens: 80, output_tokens: 30, cache_read_input_tokens: 3000 } }))
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  switch (key) {
    case 'TOOL':
      if (!results.length) return res.end(anStart() + an('ping', {}) + anThinking(0) + anTool(1, 'toolu_1', 'list_routines', ['', '{}']) + anStop('tool_use'))
      return res.end(anStart() + anText(0, [`You have ${/ROUTINE-A/.test(results[0].content) ? 'Routine A' : 'nothing'}.`]) + anStop('end_turn'))
    case 'PROPOSE':
      if (!results.length) return res.end(anStart() + anText(0, ['Setting that up. ']) + anTool(1, 'toolu_g', 'propose_goal', ['{"metric": "lift", ', '"target": 100, "reps": 3, ', '"exercise": "any", "text": "100 kg total"}']) + anStop('tool_use'))
      return res.end(anStart() + anText(0, ['Tap Approve.']) + anStop('end_turn'))
    case 'EMPTY':
      return res.end(anStart() + anStop('end_turn', 0))
    case 'REFUSAL':
      return res.end(anStart() + anStop('refusal', 0))
    case 'PAUSE':
      if (n === 1) return res.end(anStart() + anText(0, ['Working… ']) + anStop('pause_turn'))
      return res.end(anStart() + anText(0, ['done.']) + anStop('end_turn'))
    case 'MIDERR':
      return res.end(anStart() + anText(0, ['Half ']) + an('error', { error: { type: 'overloaded_error', message: 'Overloaded' } }))
    default:
      return res.end(anStart() + an('ping', {}) + anThinking(0) + anText(1, ['Hel', 'lo ', 'there.']) + anStop('end_turn'))
  }
}

// ---- Gemini ping only (status/test on the default provider) ----
async function geminiHandler(req, res, body) {
  ;(seen.gemini ||= []).push({ url: req.url, body })
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] }))
}

const stand = http
  .createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const body = raw ? JSON.parse(raw) : {}
    if (req.url.endsWith('/chat/completions')) return headersSeen.openai.push(req.headers.authorization), openaiHandler(req, res, body)
    if (req.url === '/v1/messages') return anthropicHandler(req, res, body)
    if (req.url.startsWith('/v1beta/models/')) return geminiHandler(req, res, body)
    res.writeHead(404).end()
  })
  .listen(0)
await new Promise((r) => stand.once('listening', r))
const STAND = `http://127.0.0.1:${stand.address().port}`

// ---- app servers ----
const PORT0 = Number(process.env.PORT_TEST || 3831)
const procs = []
const logs = {}
async function boot(name, port, extra) {
  const dir = fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), `gloop-coach-${name}-`))
  const env = { ...process.env, PORT: String(port), DATA_DIR: dir, APP_TOKEN: 'k', BACKUP_DAYS: '0', COACH_IDLE_MS: '3000', ...extra }
  for (const k of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_PLAN_MODEL', 'GEMINI_BASE_URL', 'COACH_PROVIDER', 'COACH_API_KEY', 'COACH_BASE_URL', 'COACH_MODEL', 'COACH_PLAN_MODEL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) if (!(k in extra)) delete env[k]
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  procs.push(p)
  logs[name] = ''
  p.stdout.on('data', (d) => (logs[name] += d))
  p.stderr.on('data', (d) => (logs[name] += d))
  for (let i = 0; i < 60 && !logs[name].includes('listening'); i++) await sleep(100)
  return `http://127.0.0.1:${port}`
}
const OA = await boot('openai', PORT0, { COACH_PROVIDER: 'openai', COACH_API_KEY: 'sk-fake', COACH_BASE_URL: `${STAND}/v1`, COACH_MODEL: 'deepseek-chat', COACH_PLAN_MODEL: 'big-planner' })
const AN = await boot('anthropic', PORT0 + 1, { COACH_PROVIDER: 'anthropic', COACH_API_KEY: 'sk-ant-fake', COACH_BASE_URL: STAND, COACH_MODEL: 'claude-haiku-5-5', COACH_PLAN_MODEL: 'claude-sonnet-5-5' })
const OFF = await boot('off', PORT0 + 2, { COACH_PROVIDER: 'openai', COACH_BASE_URL: `${STAND}/v1`, COACH_MODEL: 'x' })

const results = []
const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`)
const H = { authorization: 'Bearer k', 'content-type': 'application/json' }
const events = (sse) => sse.split('\n\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5)))
async function chat(base, messages, extra = {}) {
  const t0 = Date.now()
  const r = await fetch(base + '/api/coach', { method: 'POST', headers: H, body: JSON.stringify({ messages, context: 'TRAINING DATA', routines: 'ROUTINE-A: Goblet Squat 3x10', ...extra }) })
  const list = r.headers.get('content-type')?.includes('event-stream') ? events(await r.text()) : [await r.json()]
  return { status: r.status, list, text: list.filter((e) => e.t).map((e) => e.t).join(''), error: list.find((e) => e.error)?.error || '', done: list.some((e) => e.done), ms: Date.now() - t0 }
}
const say = (content) => [{ role: 'user', content }]
const quick = async (base, body) => {
  const r = await fetch(base + '/api/coach/quick', { method: 'POST', headers: H, body: JSON.stringify({ context: 'TRAINING DATA', ...body }) })
  return { status: r.status, json: await r.json() }
}
const status = async (base) => (await fetch(base + '/api/coach/status', { headers: H })).json()
const test = async (base) => (await fetch(base + '/api/coach/test', { method: 'POST', headers: H })).json()

try {
  // ===== OpenAI-compatible =====
  const plain = await chat(OA, say('hi'))
  check('openai: text streams', plain.text === 'Hello there.' && plain.done && !plain.error, JSON.stringify(plain.text))
  const req0 = seen.openai.PLAIN[0]
  check('openai: request shape (model, system first, tools as JSON Schema, stream usage)', req0.model === 'deepseek-chat' && req0.messages[0].role === 'system' && /TRAINING DATA/.test(req0.messages[0].content) && req0.tools.some((t) => t.type === 'function' && t.function.name === 'propose_goal' && t.function.parameters.type === 'object') && req0.stream === true && req0.tool_choice === 'auto')
  check('openai: Bearer key sent', headersSeen.openai[0] === 'Bearer sk-fake')
  check('openai: schemas lower-case (no Gemini dialect)', !JSON.stringify(req0.tools).includes('"OBJECT"') && !JSON.stringify(req0.tools).includes('"STRING"'))

  const tool = await chat(OA, say('[TOOL] what routines do I have?'))
  const t2 = seen.openai.TOOL[1]
  const asst = t2?.messages.find((m) => m.role === 'assistant' && m.tool_calls)
  const toolMsg = t2?.messages.find((m) => m.role === 'tool')
  check('openai: tool round trip (list_routines → answer)', tool.text === 'You have Routine A.' && tool.list.some((e) => e.tool === 'list_routines'), tool.text || tool.error)
  check('openai: assistant tool_calls + role tool reply with tool_call_id', asst?.tool_calls[0].id === 'call_abc' && asst.tool_calls[0].function.name === 'list_routines' && toolMsg?.tool_call_id === 'call_abc')

  const par = await chat(OA, say('[PARALLEL] two things'))
  const pReq = seen.openai.PARALLEL[1]
  check('openai: parallel calls assembled by index (split arguments)', par.text === 'Got 2 results.' && pReq.messages.filter((m) => m.role === 'tool').map((m) => m.tool_call_id).join() === 'call_1,call_2' && /dumbbell/i.test(pReq.messages.filter((m) => m.role === 'tool')[1].content), par.text)

  const prop = await chat(OA, say('[PROPOSE] I want a 100 kg total goal'))
  const pe = prop.list.find((e) => e.proposal)?.proposal
  check('openai: proposal tool → proposal SSE event', pe?.tool === 'propose_goal' && pe.args.target === 100 && pe.args.metric === 'lift', JSON.stringify(pe || {}).slice(0, 90))
  check('openai: text before and after the proposal', prop.text === 'Setting that up. Tap Approve.' && prop.done, prop.text)
  check('openai: planning question uses COACH_PLAN_MODEL', seen.openai.PROPOSE[0].model === 'big-planner')

  const empty = await chat(OA, say('[EMPTY] hi'))
  check('openai: empty answer retried once with tool_choice none', seen.openai.EMPTY.length === 2 && seen.openai.EMPTY[1].tool_choice === 'none' && /without an answer/.test(empty.text), empty.text.slice(0, 60))
  const mal = await chat(OA, say('[MALFORMED] hi'))
  check('openai: unparseable tool arguments → retried, then explained', seen.openai.MALFORMED.length === 2 && /garbled/.test(mal.text) && /DeepSeek/.test(mal.text), mal.text.slice(0, 80))
  const len = await chat(OA, say('[LENGTH] hi'))
  check('openai: finish length → cut-short note', /cut short/.test(len.text), len.text)
  const maxtok = await chat(OA, say('[MAXTOK] hi'))
  check('openai: 400 on max_tokens → retried without it', maxtok.text === 'Hello there.' && seen.openai.MAXTOK.length === 2 && !('max_tokens' in seen.openai.MAXTOK[1]), maxtok.error)

  const e401 = await chat(OA, say('[E401] hi'))
  check('openai: 401 → key rejected', /COACH_API_KEY was rejected by DeepSeek/.test(e401.error), e401.error)
  let st = await status(OA)
  check('status: lastError after 401 (code key, status 401)', st.lastError?.status === 401 && st.lastError.code === 'key' && /rejected/.test(st.lastError.message), JSON.stringify(st.lastError))
  const e402 = await chat(OA, say('[E402] hi'))
  check('openai: 402 → out of credits', /out of credits/.test(e402.error) && seen.openai.E402.length === 1, e402.error)
  const quota = await chat(OA, say('[QUOTA] hi'))
  check('openai: 429 insufficient_quota → credits, no retries', /out of credits/.test(quota.error) && seen.openai.QUOTA.length === 1, quota.error)
  const e404 = await chat(OA, say('[E404] hi'))
  check('openai: 404 model → set COACH_MODEL', /doesn’t know the model “deepseek-chat”/.test(e404.error) && /COACH_MODEL/.test(e404.error), e404.error)
  const e429 = await chat(OA, say('[E429] hi'))
  check('openai: 429 with long Retry-After → rate-limit message at once', /rate-limiting/.test(e429.error) && e429.ms < 3000 && seen.openai.E429.length === 1, `${e429.error} · ${e429.ms} ms`)
  const short = await chat(OA, say('[SHORT429] hi'))
  check('openai: short 429 retried after Retry-After', short.text === 'Hello there.' && seen.openai.SHORT429.length === 2, short.error)
  const mid = await chat(OA, say('[MIDERR] hi'))
  check('openai: error inside the stream → friendly, partial text kept', mid.text === 'Half ' && /overloaded/.test(mid.error), mid.error)

  // quick JSON calls
  const pre = await quick(OA, { kind: 'pre', routine: 'A', exercises: ['Goblet Squat'] })
  const preReq = seen.openai.PLAIN.at(-1)
  check('openai quick pre: json_schema response_format, parsed', pre.status === 200 && pre.json.targets?.[0]?.exercise === 'Goblet Squat' && preReq.response_format?.type === 'json_schema' && preReq.response_format.json_schema.strict === false && preReq.response_format.json_schema.schema.type === 'object', JSON.stringify(pre.json).slice(0, 80))
  const wk = await quick(OA, { kind: 'workout', workoutId: 'w1' })
  check('openai quick workout → takeaway', wk.json.text === 'Squat moved up 2 kg.', JSON.stringify(wk.json))
  const cond = await quick(OA, { kind: 'condense', messages: [{ role: 'user', content: 'I train mornings' }, { role: 'assistant', content: 'Noted' }] })
  check('openai quick condense → notes', cond.json.notes?.[0] === 'Prefers mornings.', JSON.stringify(cond.json))
  const live = await quick(OA, { kind: 'live', state: { moment: 'between', next: 'Goblet Squat' } })
  check('openai quick live → line + adjust', live.status === 200 && live.json.line === 'Push the last set.' && live.json.adjust?.weight_kg === 22, JSON.stringify(live.json))
  const nos = await quick(OA, { kind: 'pre', routine: 'A', exercises: ['Goblet Squat'], context: '[NOSCHEMA]' })
  const nsReq = seen.openai.NOSCHEMA
  check('openai quick: json_schema rejected → json_object + schema in prompt, fenced JSON parsed', nos.json.focus === 'Smooth reps.' && nsReq.length === 2 && nsReq[1].response_format?.type === 'json_object' && /JSON Schema/.test(nsReq[1].messages.at(-1).content), JSON.stringify(nos.json).slice(0, 80))
  const q401 = await quick(OA, { kind: 'pre', routine: 'A', exercises: [], context: '[E401]' })
  check('openai quick: 401 → 502 with readable error', q401.status === 502 && /rejected/.test(q401.json.error), q401.json.error)

  // test + status
  const tOk = await test(OA)
  check('test endpoint (openai): ok, reply, ms', tOk.ok === true && tOk.reply === 'OK' && tOk.provider === 'openai' && tOk.model === 'deepseek-chat' && typeof tOk.ms === 'number', JSON.stringify(tOk))
  st = await status(OA)
  check('status fields (openai)', st.enabled && st.provider === 'openai' && st.model === 'deepseek-chat' && st.planModel === 'big-planner' && st.lastOk > st.lastError.at && st.todayCalls > 10 && st.label === 'DeepSeek', JSON.stringify({ ...st, lastError: !!st.lastError }).slice(0, 200))
  const noAuth = await fetch(OA + '/api/coach/test', { method: 'POST' })
  check('test endpoint needs auth', noAuth.status === 401)

  // ===== Anthropic =====
  const ap = await chat(AN, [
    { role: 'user', content: 'earlier' },
    { role: 'user', content: 'hi again' },
  ])
  const a0 = seen.anthropic.PLAIN[0]
  check('anthropic: text streams (thinking skipped)', ap.text === 'Hello there.' && ap.done && !ap.error, ap.text || ap.error)
  check('anthropic: headers x-api-key + anthropic-version', headersSeen.anthropic[0].key === 'sk-ant-fake' && headersSeen.anthropic[0].version === '2023-06-01')
  check('anthropic: system as top-level blocks, static block cached', Array.isArray(a0.system) && a0.system[0].cache_control?.type === 'ephemeral' && /personal trainer/.test(a0.system[0].text) && /TRAINING DATA/.test(a0.system[1].text) && !/Today is/.test(a0.system[0].text))
  check('anthropic: tools with input_schema, last one cached', a0.tools.every((t) => t.input_schema?.type === 'object') && a0.tools.at(-1).cache_control?.type === 'ephemeral' && a0.tools.filter((t) => t.cache_control).length === 1)
  check('anthropic: consecutive user turns merged, max_tokens + effort set, no thinking param', a0.messages.length === 1 && a0.messages[0].content === 'earlier\n\nhi again' && a0.max_tokens === 16000 && a0.output_config?.effort === 'low' && !('thinking' in a0))
  st = await status(AN)
  check('anthropic: usage recorded (cache reads)', st.lastUsage?.cacheRead >= 4000 && st.lastUsage.rounds === 1, JSON.stringify(st.lastUsage))
  check('anthropic: usage logged', /coach: anthropic claude-haiku-5-5 · 1 round\(s\) · in 50 \(cached 4000\) · out 20/.test(logs.anthropic), logs.anthropic.match(/coach: anthropic.*/)?.[0])

  const at = await chat(AN, say('[TOOL] what routines?'))
  const a2 = seen.anthropic.TOOL[1]
  const aAsst = a2?.messages[1]
  const aRes = a2?.messages[2]
  check('anthropic: tool round trip (list_routines → answer)', at.text === 'You have Routine A.', at.text || at.error)
  check('anthropic: assistant content echoed (thinking with signature + tool_use)', aAsst?.role === 'assistant' && aAsst.content[0].type === 'thinking' && aAsst.content[0].signature === 'SIG-xyz' && aAsst.content[1].type === 'tool_use' && aAsst.content[1].id === 'toolu_1' && JSON.stringify(aAsst.content[1].input) === '{}' && !JSON.stringify(aAsst).includes('_json'), JSON.stringify(aAsst).slice(0, 160))
  check('anthropic: tool_result block with tool_use_id', aRes?.role === 'user' && aRes.content[0].type === 'tool_result' && aRes.content[0].tool_use_id === 'toolu_1')
  check('anthropic: turns alternate user/assistant/user', a2.messages.map((m) => m.role).join() === 'user,assistant,user')

  const aprop = await chat(AN, say('[PROPOSE] 100 kg total goal please'))
  const ape = aprop.list.find((e) => e.proposal)?.proposal
  check('anthropic: input_json_delta assembled → proposal SSE event', ape?.tool === 'propose_goal' && ape.args.target === 100 && ape.args.exercise === 'any', JSON.stringify(ape || {}).slice(0, 90))
  check('anthropic: planning → plan model + medium effort', seen.anthropic.PROPOSE[0].model === 'claude-sonnet-5-5' && seen.anthropic.PROPOSE[0].output_config.effort === 'medium')
  check('anthropic: text after the proposal', aprop.text === 'Setting that up. Tap Approve.', aprop.text)

  const aempty = await chat(AN, say('[EMPTY] hi'))
  check('anthropic: empty → retried with tool_choice none', seen.anthropic.EMPTY.length === 2 && seen.anthropic.EMPTY[1].tool_choice?.type === 'none' && /Claude came back without an answer/.test(aempty.text), aempty.text.slice(0, 60))
  const aref = await chat(AN, say('[REFUSAL] hi'))
  check('anthropic: refusal → declined message', /Claude declined/.test(aref.text), aref.text)
  const apause = await chat(AN, say('[PAUSE] hi'))
  check('anthropic: pause_turn → sent back, continues', apause.text === 'Working… done.' && seen.anthropic.PAUSE.length === 2 && seen.anthropic.PAUSE[1].messages.at(-1).role === 'assistant', apause.text)
  const aeff = await chat(AN, say('[EFFORT] hi'))
  check('anthropic: 400 on effort → retried without it', aeff.text === 'Hello there.' && seen.anthropic.EFFORT.length === 2 && !seen.anthropic.EFFORT[1].output_config?.effort, aeff.error)
  const abusy = await chat(AN, say('[BUSY] hi'))
  check('anthropic: 529 overloaded retried', abusy.text === 'Hello there.' && seen.anthropic.BUSY.length === 2, abusy.error)
  const amid = await chat(AN, say('[MIDERR] hi'))
  check('anthropic: error event mid-stream → overloaded message', amid.text === 'Half ' && /Claude is overloaded/.test(amid.error), amid.error)

  const a401 = await chat(AN, say('[E401] hi'))
  check('anthropic: 401 → key rejected', /COACH_API_KEY was rejected by Claude/.test(a401.error), a401.error)
  const a404 = await chat(AN, say('[E404] hi'))
  check('anthropic: 404 → model not found', /doesn’t know the model “claude-haiku-5-5”/.test(a404.error), a404.error)
  const a429 = await chat(AN, say('[E429] hi'))
  check('anthropic: 429 → rate limit', /rate-limiting/.test(a429.error) && seen.anthropic.E429.length === 1, a429.error)
  const acred = await chat(AN, say('[CREDITS] hi'))
  check('anthropic: credit balance too low → out of credits', /out of credits/.test(acred.error), acred.error)

  const apre = await quick(AN, { kind: 'pre', routine: 'A', exercises: ['Goblet Squat'] })
  const aq = seen.anthropic.PLAIN.at(-1)
  check('anthropic quick pre: structured output (json_schema, closed objects), no tool_choice/prefill', apre.json.targets?.[0]?.weight_kg === 20 && aq.output_config?.format?.type === 'json_schema' && aq.output_config.format.schema.additionalProperties === false && aq.output_config.format.schema.properties.targets.items.additionalProperties === false && !aq.tool_choice && aq.messages.length === 1 && aq.max_tokens === 4096, JSON.stringify(aq.output_config || {}).slice(0, 120))
  const awk = await quick(AN, { kind: 'workout', workoutId: 'w2' })
  check('anthropic quick workout', awk.json.text === 'Squat moved up 2 kg.')
  const acond = await quick(AN, { kind: 'condense', messages: [{ role: 'user', content: 'x' }] })
  check('anthropic quick condense', acond.json.notes?.length === 1)
  const alive = await quick(AN, { kind: 'live', state: { moment: 'start' } })
  const aliveReq = seen.anthropic.PLAIN.at(-1)
  check('anthropic quick live → line + adjust (nested optional object closed)', alive.json.line === 'Push the last set.' && alive.json.adjust?.exercise === 'Goblet Squat' && aliveReq.output_config.format.schema.properties.adjust.additionalProperties === false, JSON.stringify(alive.json))
  const ans = await quick(AN, { kind: 'pre', routine: 'A', exercises: ['Goblet Squat'], context: '[NOSCHEMA]' })
  check('anthropic quick: schema rejected → plain JSON fallback', ans.json.focus === 'Smooth reps.' && seen.anthropic.NOSCHEMA.length === 2 && !seen.anthropic.NOSCHEMA[1].output_config.format && /JSON Schema/.test(seen.anthropic.NOSCHEMA[1].messages[0].content))
  const atest = await test(AN)
  check('test endpoint (anthropic)', atest.ok && atest.reply === 'OK' && atest.provider === 'anthropic', JSON.stringify(atest))

  // ===== not configured =====
  const off = await status(OFF)
  check('status without a key: disabled + plain problem', off.enabled === false && /No API key on the server: set COACH_API_KEY/.test(off.problem) && off.provider === 'openai', JSON.stringify(off).slice(0, 160))
  const offTest = await test(OFF)
  check('test without a key: ok false with the problem', offTest.ok === false && /COACH_API_KEY/.test(offTest.error), JSON.stringify(offTest))
  const offChat = await fetch(OFF + '/api/coach', { method: 'POST', headers: H, body: JSON.stringify({ messages: say('hi') }) })
  const offBody = await offChat.json()
  check('chat without a key: 503 with the problem', offChat.status === 503 && /COACH_API_KEY/.test(offBody.error), offBody.error)
} catch (e) {
  results.push('ERROR ' + (e.stack || e.message))
}

// ===== Gemini default: status + test (separate server so env defaults apply) =====
try {
  const GM = await boot('gemini', PORT0 + 3 > 3839 ? PORT0 : PORT0 + 3, { GEMINI_API_KEY: 'g-fake', GEMINI_BASE_URL: STAND })
  const gs = await status(GM)
  check('status (gemini default): provider + default model', gs.enabled && gs.provider === 'gemini' && gs.model === 'gemini-3.5-flash' && gs.keyVar === 'GEMINI_API_KEY' && gs.label === 'Gemini', JSON.stringify(gs).slice(0, 160))
  const gt = await test(GM)
  check('test endpoint (gemini)', gt.ok && gt.reply === 'OK' && /gemini-3\.5-flash:generateContent/.test(seen.gemini?.[0]?.url || ''), JSON.stringify(gt))
} catch (e) {
  results.push('ERROR ' + (e.stack || e.message))
}

console.log(results.join('\n'))
const failed = results.filter((r) => !r.startsWith('PASS')).length
console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed) for (const [k, v] of Object.entries(logs)) console.log(`--- ${k} log ---\n${v.slice(-1500)}`)
for (const p of procs) p.kill()
stand.closeAllConnections?.()
stand.close()
process.exit(failed ? 1 : 0)
