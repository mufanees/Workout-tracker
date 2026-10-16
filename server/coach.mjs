// AI coach on Google's Gemini API, any OpenAI-compatible API, or Claude (REST, no SDK; COACH_PROVIDER picks).
//
// - Chat streams over SSE. The model can call tools: read-only look-ups (reusing the MCP tools),
//   memory (notes, commitments) that the server writes into the synced "coach" store, and
//   proposals (routine changes, goals, profile edits) that the app shows for one-tap approval.
// - The coach's memory (your profile, notes, goals, open commitments) goes into every request.
// - Short JSON calls produce pre-workout targets, a post-workout takeaway and chat condensing.
// - A background job writes a weekly review on Sunday evening and sends a notification.
import crypto from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { priceOf, recordUsage, spendReport } from './usage.mjs'
import { knowledgeLookup, searchLibrary } from '../shared/coachKnowledge.mjs'
import { findStretches } from '../shared/rehabKnowledge.mjs'
import { matchExercise } from '../shared/planImport.mjs'
import { videoInfo } from './video.mjs'
import { COACH_SYSTEM, COACH_TOOLS, QUICK, isPlanning, systemText as buildSystem, toGemini, toJsonSchema, trimHistory, ymd as ymdShared } from '../shared/coachSpec.mjs'
import { PROGRAM_CATALOG } from '../shared/programs.mjs'

// ---- which API the coach runs on (env only, no code change to switch) -----------------
//
// COACH_PROVIDER: 'gemini' (default) | 'openai' (any OpenAI-compatible Chat Completions API: OpenRouter,
// DeepSeek, Groq, Together, Mistral, OpenAI…) | 'anthropic' (Claude Messages API).
// COACH_API_KEY, COACH_BASE_URL, COACH_MODEL, COACH_PLAN_MODEL; the GEMINI_* names still work for Gemini.
const env = process.env
const PROVIDER_RAW = String(env.COACH_PROVIDER || 'gemini').trim().toLowerCase()
const PROVIDER = { claude: 'anthropic', 'openai-compatible': 'openai', openrouter: 'openai', deepseek: 'openai', groq: 'openai' }[PROVIDER_RAW] || PROVIDER_RAW
const IS_GEMINI = PROVIDER === 'gemini'
const CONFIG_ERROR = ['gemini', 'openai', 'anthropic'].includes(PROVIDER) ? '' : `COACH_PROVIDER “${PROVIDER_RAW}” isn’t one of gemini, openai, anthropic.`
const KEY_VAR = env.COACH_API_KEY ? 'COACH_API_KEY' : IS_GEMINI && env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY' : PROVIDER === 'openai' && env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : IS_GEMINI ? 'GEMINI_API_KEY' : 'COACH_API_KEY'
const API_KEY = () => env[KEY_VAR] || ''
const DEFAULT_BASE = { gemini: 'https://generativelanguage.googleapis.com', anthropic: 'https://api.anthropic.com', openai: 'https://api.openai.com/v1' }
const BASE = String(env.COACH_BASE_URL || (IS_GEMINI ? env.GEMINI_BASE_URL : '') || DEFAULT_BASE[PROVIDER] || '')
  .trim()
  .replace(/\/+$/, '')
  .replace(/\/chat\/completions$/, '')
  .replace(PROVIDER === 'anthropic' ? /\/v1(\/messages)?$/ : /$^/, '')
const HOST = (() => {
  try {
    return new URL(BASE).host
  } catch {
    return ''
  }
})()
const defaultModel = () => {
  if (IS_GEMINI) return 'gemini-3.5-flash'
  if (PROVIDER === 'anthropic') return 'claude-haiku-5-5'
  if (/deepseek/.test(HOST)) return 'deepseek-chat'
  return '' // OpenAI-compatible APIs all name models differently: COACH_MODEL is required
}
const MODEL_VAR = env.COACH_MODEL ? 'COACH_MODEL' : IS_GEMINI ? 'GEMINI_MODEL' : 'COACH_MODEL'
const MODEL = env.COACH_MODEL || (IS_GEMINI ? env.GEMINI_MODEL : '') || defaultModel()
const PLAN_VAR = env.COACH_PLAN_MODEL ? 'COACH_PLAN_MODEL' : IS_GEMINI ? 'GEMINI_PLAN_MODEL' : 'COACH_PLAN_MODEL'
// Optional stronger model for planning questions and weekly reviews; defaults to MODEL.
const PLAN_MODEL = env.COACH_PLAN_MODEL || (IS_GEMINI ? env.GEMINI_PLAN_MODEL : '') || MODEL
// The coach's model, picked per person in Settings → Coach (on Claude: Haiku, Sonnet or Opus):
//   fast     – MODEL for chat, PLAN_MODEL for planning and the weekly review (the default, as before)
//   balanced – PLAN_MODEL for everything
//   deep     – DEEP_MODEL (Claude Opus 5.5 on Claude, else PLAN_MODEL) for everything, more thinking
// Live in-workout lines always use MODEL: they have to be quick.
const DEEP_MODEL = env.COACH_DEEP_MODEL || (PROVIDER === 'anthropic' ? 'claude-opus-5-5' : PLAN_MODEL)
export const COACH_LEVELS = ['fast', 'balanced', 'deep']
const levelOf = (v) => (COACH_LEVELS.includes(v) ? v : 'fast')
/** Which model and how much thinking a request gets. `effort` only reaches Claude. */
function pick(level, planning) {
  if (level === 'deep') return { model: DEEP_MODEL, effort: planning ? 'high' : 'medium' }
  if (level === 'balanced') return { model: PLAN_MODEL, effort: planning ? 'medium' : 'low' }
  return { model: planning ? PLAN_MODEL : MODEL, effort: planning ? 'medium' : 'low' }
}

/** What the athlete calls the service in messages. */
const LABEL = IS_GEMINI
  ? 'Gemini'
  : PROVIDER === 'anthropic'
    ? 'Claude'
    : /openrouter/.test(HOST)
      ? 'OpenRouter'
      : /deepseek/.test(HOST)
        ? 'DeepSeek'
        : /groq/.test(HOST)
          ? 'Groq'
          : /together/.test(HOST)
            ? 'Together'
            : /mistral/.test(HOST)
              ? 'Mistral'
              : /openai\.com/.test(HOST)
                ? 'OpenAI'
                : /googleapis/.test(HOST)
                  ? 'Gemini'
                  : // a proxy or self-hosted gateway: name the model's maker when it's obvious
                    { deepseek: 'DeepSeek', gpt: 'OpenAI', mistral: 'Mistral', llama: 'Llama', qwen: 'Qwen', claude: 'Claude', gemini: 'Gemini' }[
                      (String(MODEL).toLowerCase().match(/deepseek|gpt|mistral|llama|qwen|claude|gemini/) || [])[0]
                    ] || 'The AI service'
const DAY = 86400000

export const coachEnabled = () => !CONFIG_ERROR && !!API_KEY() && !!MODEL

/** Why the coach is off, in plain words (null when it's configured). */
export function coachProblem() {
  if (CONFIG_ERROR) return CONFIG_ERROR
  if (!API_KEY()) return `No API key on the server: set ${IS_GEMINI ? 'GEMINI_API_KEY (or COACH_API_KEY)' : 'COACH_API_KEY'} in Coolify and redeploy.`
  if (!MODEL) return 'No model set: set COACH_MODEL to a model id from your provider and redeploy.'
  return null
}

// ---- health, for Settings → Coach ----
// Whether the API works (last success, last error) is the server's: one key and model for everyone. Call
// counts and the last call's tokens are each person's own (keyed by who the request is for).
const stats = { lastOk: 0, lastError: null }
const perWho = new Map() // who → { day, calls, lastUsage }
const mine = () => {
  const who = callCtx.getStore()?.who || ''
  if (!perWho.has(who)) perWho.set(who, { day: '', calls: 0, lastUsage: null })
  return perWho.get(who)
}
function countCall() {
  const m = mine()
  const d = new Date().toISOString().slice(0, 10)
  if (m.day !== d) Object.assign(m, { day: d, calls: 0 })
  m.calls++
}
const noteOk = () => (stats.lastOk = Date.now())
function noteError(e) {
  if (e?.name === 'AbortError' && !e.code) return // stopped by the athlete
  stats.lastError = { at: Date.now(), message: friendlyError(e), status: e?.status || 0, code: errorKind(e) }
}
// Who a call is for and what kind it is, so the ledger can split spend (set around each request).
const callCtx = new AsyncLocalStorage()
/** One API call's tokens: into the spend ledger, and the last one for Settings. */
function noteUsage(u, model) {
  if (!u) return
  mine().lastUsage = { ...u, model, at: Date.now() }
  const c = callCtx.getStore() || {}
  recordUsage({ who: c.who || '', kind: c.kind || 'other', model, usage: u, inputIncludesCache: PROVIDER !== 'anthropic' })
}
export function coachStatus(who = '') {
  const m = perWho.get(who)
  return {
    enabled: coachEnabled(),
    provider: PROVIDER,
    label: LABEL,
    model: MODEL || null,
    planModel: PLAN_MODEL || null,
    host: HOST,
    keyVar: KEY_VAR,
    modelVar: MODEL_VAR,
    problem: coachProblem(),
    lastOk: stats.lastOk || null,
    lastError: stats.lastError,
    todayCalls: m && m.day === new Date().toISOString().slice(0, 10) ? m.calls : 0,
    lastUsage: m?.lastUsage || null,
    // what each reasoning level runs on, with list prices per million tokens ([input, output, cache read]) when known
    levels: Object.fromEntries(
      [
        ['fast', MODEL, PLAN_MODEL],
        ['balanced', PLAN_MODEL, PLAN_MODEL],
        ['deep', DEEP_MODEL, DEEP_MODEL],
      ].map(([k, chat, plan]) => [k, { chat, plan, price: priceOf(chat), planPrice: priceOf(plan) }]),
    ),
    thinking: PROVIDER === 'anthropic',
  }
}

/** What the coach has cost (list prices), for Settings: a person's own, or the whole server's for the admin. */
export const coachSpend = (who, all = false) => spendReport(who, all)

// ---- HTTP with retries (shared by every provider) ----------------------------------

// A chat round that sends nothing for this long is given up on (the API went quiet); a whole chat
// reply, tool rounds included, is capped at COACH_TOTAL_MS. Both are env-tunable for tests.
const IDLE_MS = Number(env.COACH_IDLE_MS) || 90000
const TOTAL_MS = Number(env.COACH_TOTAL_MS) || 5 * 60000
const MAX_ROUNDS = 8
// Longest wait for a per-minute limit before retrying (Gemini says how long in RetryInfo, others in Retry-After).
const MAX_QUOTA_WAIT = 65000

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))), { once: true })
  })

/** Gemini's error body → { message, retryMs, daily }. 429s carry RetryInfo ("37s") and the quota that ran out. */
function parseGeminiError(json) {
  const err = json?.error || {}
  const details = Array.isArray(err.details) ? err.details : []
  const retry = details.find((d) => String(d?.['@type'] || '').includes('RetryInfo'))?.retryDelay
  const retryMs = retry ? Math.ceil(parseFloat(String(retry)) * 1000) || 0 : 0
  const quotaIds = details.flatMap((d) => (Array.isArray(d?.violations) ? d.violations.map((v) => String(v?.quotaId || v?.quotaMetric || '')) : [])).join(' ')
  const daily = /per ?day|perday|daily/i.test(quotaIds + ' ' + (err.message || ''))
  return { message: String(err.message || ''), retryMs, daily }
}

/** OpenAI-style ({error:{message,type,code}}, OpenRouter nests the upstream's in metadata) and Anthropic ({type:'error', error:{type,message}}) bodies. */
function parseOtherError(json) {
  const err = json?.error && typeof json.error === 'object' ? json.error : json || {}
  const raw = err?.metadata?.raw ? ` (${String(err.metadata.raw).slice(0, 200)})` : ''
  const message = String(err.message || (typeof json?.error === 'string' ? json.error : '') || json?.message || '') + raw
  const type = String(err.type || err.code || '')
  return { message, type, retryMs: 0, daily: /per ?day|daily|RPD/i.test(message), credits: /insufficient_quota|insufficient.*(credit|balance|fund)|credit balance|billing|payment required/i.test(message + ' ' + type) }
}

function retryAfter(headers) {
  const ms = Number(headers.get('retry-after-ms'))
  if (ms > 0) return ms
  const h = headers.get('retry-after')
  if (!h) return 0
  const s = Number(h)
  if (Number.isFinite(s)) return s * 1000
  const t = Date.parse(h)
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : 0
}

/** POST JSON to the provider. Busy or flaky answers (429, 5xx, 529, network) are retried with backoff before
 *  giving up. A per-minute 429 waits as long as asked (up to about a minute); a daily one or one about money
 *  fails at once. `adjust(status, message, payload)` may return a fixed payload for a 400 (e.g. a token cap
 *  the model doesn't accept); it's tried once per kind of fix. */
async function apiFetch(url, headers, payload, { signal, model, onWait, adjust } = {}) {
  let res
  let quotaWaited = false
  const fixes = new Set()
  for (let attempt = 0; ; attempt++) {
    countCall()
    try {
      res = await fetch(url, { method: 'POST', signal, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) })
    } catch (e) {
      if (e?.name === 'AbortError' || attempt >= 2) throw Object.assign(e, { network: e?.name !== 'AbortError', api: true, provider: PROVIDER, model })
      await sleep(1500 * 2 ** attempt, signal)
      continue
    }
    if (res.ok) return res
    let info = { message: '', retryMs: 0, daily: false, credits: false, type: '' }
    let text = ''
    try {
      text = await res.text()
      const json = JSON.parse(text)
      info = IS_GEMINI ? { ...info, ...parseGeminiError(json) } : { ...info, ...parseOtherError(json) }
    } catch {
      if (!info.message && text) info.message = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    }
    const header = retryAfter(res.headers)
    const fail = () =>
      Object.assign(new Error(info.message || `HTTP ${res.status}`), {
        status: res.status,
        api: true,
        gemini: IS_GEMINI,
        provider: PROVIDER,
        model,
        daily: info.daily,
        credits: info.credits || res.status === 402,
        type: info.type,
        retryMs: info.retryMs || header,
      })
    if (res.status === 429) {
      if (info.daily || info.credits) throw fail()
      const wait = info.retryMs || header
      if (wait > 8000) {
        // Per-minute limit (tokens or requests): wait it out once if it's short enough.
        if (quotaWaited || wait > MAX_QUOTA_WAIT) throw fail()
        quotaWaited = true
        onWait?.(wait)
        await sleep(wait + 500, signal)
        attempt--
        continue
      }
      if (attempt >= 2) throw fail()
      await sleep(wait || 1500 * 2 ** attempt, signal)
      continue
    }
    if ((res.status >= 500 || res.status === 408) && attempt < 2) {
      await sleep(Math.min(8000, header || 1500 * 2 ** attempt), signal)
      continue
    }
    if (res.status === 400 || res.status === 422) {
      const fixed = adjust?.(info.message, payload, fixes)
      if (fixed) {
        payload = fixed
        attempt--
        continue
      }
    }
    throw fail()
  }
}

/** Reads an SSE response, calling onEvent(eventName, dataString) per event (data lines joined). Gives up with
 *  code 'idle' when nothing arrives for idleMs; onEvent may throw to stop. Tolerates CRLF and split chunks. */
async function readSse(open, onEvent, { signal, idleMs = IDLE_MS }) {
  const ctrl = new AbortController()
  const stop = () => ctrl.abort()
  if (signal?.aborted) ctrl.abort()
  signal?.addEventListener('abort', stop, { once: true })
  let idle = false
  let timer
  const arm = (ms = idleMs) => {
    clearTimeout(timer)
    timer = setTimeout(() => ((idle = true), ctrl.abort()), ms)
  }
  const handle = (chunk) => {
    let event = ''
    const data = []
    for (const l of chunk.split(/\r?\n/)) {
      if (l.startsWith('event:')) event = l.slice(6).trim()
      else if (l.startsWith('data:')) data.push(l.slice(5).trim())
    }
    if (data.length) onEvent(event, data.join(''))
  }
  try {
    arm()
    const res = await open(ctrl.signal, (ms) => arm(ms + idleMs))
    arm()
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      arm()
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
        const chunk = buf.slice(0, i)
        buf = buf.slice(i).replace(/^\r?\n\r?\n/, '')
        handle(chunk)
      }
    }
    buf += dec.decode()
    if (buf.trim()) handle(buf)
  } catch (e) {
    if (idle && !signal?.aborted) throw Object.assign(new Error(`${LABEL} went quiet`), { code: 'idle' })
    throw e
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }
}

/** The first JSON object in a reply (tolerates ```json fences and a sentence around it). */
function extractJson(text) {
  const s = String(text || '').trim()
  try {
    return JSON.parse(s)
  } catch {
    /* look inside */
  }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) {
    try {
      return JSON.parse(fenced[1])
    } catch {
      /* keep looking */
    }
  }
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1))
  throw Object.assign(new Error(`${LABEL} didn’t answer in JSON`), { code: 'json' })
}

const isMaxTokMsg = (m) => /max_?(output_|completion_)?tokens|maxOutputTokens/i.test(m)

// ---- the three providers -----------------------------------------------------------
//
// Each keeps the conversation in its own native shape (so Gemini's thought signatures and Claude's thinking
// blocks go back unchanged) and offers:
//   start(messages) → history
//   turn({ system, history, textOnly, planning, model, onText, onWait, signal }) → { calls: [{id, name, args}], wrote, finish, blocked, raw }
//     finish uses Gemini's words: STOP, MAX_TOKENS, MALFORMED_FUNCTION_CALL, SAFETY, PAUSE (Claude's pause_turn), …
//   addTurn(history, turn, results)  (results: [{ call, response }])
//   json(system, prompt, jsonSchema, model, opts) → parsed object
//   ping(model, signal) → reply text

const DECLARATIONS = COACH_TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters: toGemini(parameters) }))
const OPENAI_TOOLS = COACH_TOOLS.map(({ name, description, parameters }) => ({ type: 'function', function: { name, description, parameters: toJsonSchema(parameters) } }))
const ANTHROPIC_TOOLS = COACH_TOOLS.map(({ name, description, parameters }, i, all) => ({
  name,
  description,
  input_schema: toJsonSchema(parameters),
  // Cache the static prefix (tools + instructions) across tool rounds and requests.
  ...(i === all.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
}))

const gemini = {
  url: (model, method) => `${BASE}/v1beta/models/${encodeURIComponent(model)}:${method}`,
  headers: () => ({ 'x-goog-api-key': API_KEY() }),
  // Some models cap output lower than we ask; drop the cap rather than fail.
  adjust(message, payload, fixes) {
    if (isMaxTokMsg(message) && payload.generationConfig?.maxOutputTokens && !fixes.has('max')) {
      fixes.add('max')
      const { maxOutputTokens, ...rest } = payload.generationConfig
      return { ...payload, generationConfig: rest }
    }
    return null
  },
  start: (messages) => messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
  async turn({ system, history, textOnly, planning, model, onText, onWait, signal }) {
    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: history,
      tools: [{ functionDeclarations: DECLARATIONS }],
      ...(textOnly ? { toolConfig: { functionCallingConfig: { mode: 'NONE' } } } : {}),
      generationConfig: { maxOutputTokens: planning ? 65536 : 32768 },
    }
    const parts = []
    let finish = ''
    let blocked = ''
    let bad = 0
    let usage = null
    await readSse(
      (sig, rearm) => apiFetch(this.url(model, 'streamGenerateContent?alt=sse'), this.headers(), payload, { signal: sig, model, onWait: (ms) => (rearm(ms), onWait?.(ms)), adjust: this.adjust }),
      (_, data) => {
        let ev
        try {
          ev = JSON.parse(data)
        } catch {
          bad++
          return
        }
        if (ev?.error) {
          const info = parseGeminiError(ev)
          throw Object.assign(new Error(info.message || 'error in stream'), { status: Number(ev.error.code) || 500, api: true, gemini: true, provider: PROVIDER, model, daily: info.daily, retryMs: info.retryMs })
        }
        if (ev.promptFeedback?.blockReason) blocked = ev.promptFeedback.blockReason
        if (ev.usageMetadata) usage = { input: ev.usageMetadata.promptTokenCount || 0, output: ev.usageMetadata.candidatesTokenCount || 0, cacheRead: ev.usageMetadata.cachedContentTokenCount || 0 }
        const cand = ev.candidates?.[0]
        for (const part of cand?.content?.parts || []) {
          // Keep every part exactly as received: Gemini 3 attaches thought signatures that must be sent back.
          parts.push(part)
          if (part.text && !part.thought) onText(part.text)
        }
        if (cand?.finishReason) finish = cand.finishReason
      },
      { signal },
    )
    if (bad) console.warn(`coach: skipped ${bad} unreadable event(s) from Gemini`)
    const calls = parts.filter((p) => p.functionCall).map((p) => ({ id: p.functionCall.id, name: p.functionCall.name, args: p.functionCall.args }))
    return { calls, wrote: parts.some((p) => p.text && !p.thought && p.text.trim()), finish, blocked, raw: parts, usage }
  },
  addTurn(history, turn, results) {
    history.push({ role: 'model', parts: turn.raw })
    history.push({ role: 'user', parts: results.map(({ call, response }) => ({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response } })) })
  },
  async json(system, prompt, schema, model, { signal } = {}) {
    const res = await apiFetch(
      this.url(model, 'generateContent'),
      this.headers(),
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: toGemini(schema), maxOutputTokens: 4096 },
      },
      { signal, model, adjust: this.adjust },
    )
    const json = await res.json()
    const u = json.usageMetadata
    if (u) noteUsage({ input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0, cacheRead: u.cachedContentTokenCount || 0 }, model)
    const text = (json.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('')
    return extractJson(text)
  },
  async ping(model, signal) {
    const res = await apiFetch(this.url(model, 'generateContent'), this.headers(), { contents: [{ role: 'user', parts: [{ text: 'Reply with OK' }] }] }, { signal, model })
    const json = await res.json()
    return (json.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('')
  },
}

const openai = {
  url: () => `${BASE}/chat/completions`,
  headers: () => ({ authorization: `Bearer ${API_KEY()}`, ...(/openrouter/.test(HOST) ? { 'x-title': 'Gloop' } : {}) }),
  /** Providers differ on optional fields: drop the one a 400 complains about and try again. */
  adjust(message, payload, fixes) {
    const drop = (key, tag = key) => {
      if (!(key in payload) || fixes.has(tag)) return null
      fixes.add(tag)
      const { [key]: _, ...rest } = payload
      return rest
    }
    if (isMaxTokMsg(message)) return drop('max_tokens')
    if (/stream_options/i.test(message)) return drop('stream_options')
    if (/tool_choice/i.test(message)) return drop('tool_choice')
    return null
  },
  start: (messages) => messages.map((m) => ({ role: m.role, content: m.content })),
  async turn({ system, history, textOnly, planning, model, onText, onWait, signal }) {
    const payload = {
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: 'system', content: system }, ...history],
      tools: OPENAI_TOOLS,
      tool_choice: textOnly ? 'none' : 'auto',
      max_tokens: planning ? 32768 : 16384,
    }
    let text = ''
    let reasoning = ''
    let finish = ''
    let bad = 0
    let usage = null
    const slots = [] // tool calls assembled by index
    await readSse(
      (sig, rearm) => apiFetch(this.url(), this.headers(), payload, { signal: sig, model, onWait: (ms) => (rearm(ms), onWait?.(ms)), adjust: this.adjust }),
      (_, data) => {
        if (data === '[DONE]') return
        let ev
        try {
          ev = JSON.parse(data)
        } catch {
          bad++
          return
        }
        if (ev?.error) {
          const info = parseOtherError(ev)
          throw Object.assign(new Error(info.message || 'error in stream'), { status: Number(ev.error.code) || Number(ev.error.status) || 500, api: true, provider: PROVIDER, model, credits: info.credits })
        }
        if (ev.usage) usage = { input: ev.usage.prompt_tokens || 0, output: ev.usage.completion_tokens || 0, cacheRead: ev.usage.prompt_tokens_details?.cached_tokens || ev.usage.prompt_cache_hit_tokens || 0 }
        const choice = ev.choices?.[0]
        if (!choice) return
        const d = choice.delta || choice.message || {}
        if (typeof d.content === 'string' && d.content) {
          text += d.content
          onText(d.content)
        }
        if (typeof d.reasoning_content === 'string') reasoning += d.reasoning_content
        if (Array.isArray(d.tool_calls)) {
          d.tool_calls.forEach((tc, j) => {
            const i = Number.isInteger(tc.index) ? tc.index : j
            const slot = (slots[i] ||= { id: '', name: '', args: '' })
            if (tc.id) slot.id = tc.id
            if (tc.function?.name) slot.name += tc.function.name
            if (tc.function?.arguments != null) slot.args += typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments)
          })
        }
        if (choice.finish_reason) finish = choice.finish_reason
      },
      { signal },
    )
    if (bad) console.warn(`coach: skipped ${bad} unreadable event(s) from ${LABEL}`)
    const calls = []
    let malformed = false
    slots.filter(Boolean).forEach((s, i) => {
      if (!s.name) return void (malformed = true)
      try {
        calls.push({ id: s.id || `call_${i}_${Date.now().toString(36)}`, name: s.name, args: s.args.trim() ? JSON.parse(s.args) : {}, rawArgs: s.args || '{}' })
      } catch {
        malformed = true
      }
    })
    const map = { stop: 'STOP', tool_calls: 'STOP', function_call: 'STOP', length: 'MAX_TOKENS', content_filter: 'SAFETY' }
    return {
      calls: malformed ? [] : calls,
      wrote: !!text.trim(),
      finish: malformed ? 'MALFORMED_FUNCTION_CALL' : map[finish] || (finish ? finish.toUpperCase() : ''),
      blocked: '',
      raw: { text, reasoning },
      usage,
    }
  },
  addTurn(history, turn, results) {
    history.push({
      role: 'assistant',
      content: turn.raw.text || null,
      // DeepSeek's thinking mode wants its reasoning back within a tool loop; only sent when it sent one.
      ...(turn.raw.reasoning ? { reasoning_content: turn.raw.reasoning } : {}),
      tool_calls: results.map(({ call }) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.rawArgs || JSON.stringify(call.args || {}) } })),
    })
    for (const { call, response } of results) history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(response) })
  },
  async json(system, prompt, schema, model, { signal } = {}) {
    const ask = (format, extra = '') =>
      apiFetch(
        this.url(),
        this.headers(),
        {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt + extra },
          ],
          max_tokens: 4096,
          ...(format ? { response_format: format } : {}),
        },
        { signal, model, adjust: this.adjust },
      )
    const asText = `\n\nReply with only a JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(schema)}`
    let res
    try {
      res = await ask({ type: 'json_schema', json_schema: { name: 'reply', schema, strict: false } })
    } catch (e) {
      if (![400, 404, 422].includes(e?.status) || !/response_format|json_schema|schema|structured|not support/i.test(e.message || '')) throw e
      try {
        res = await ask({ type: 'json_object' }, asText)
      } catch (e2) {
        if (![400, 404, 422].includes(e2?.status) || !/response_format|json_object|json|not support/i.test(e2.message || '')) throw e2
        res = await ask(null, asText)
      }
    }
    const json = await res.json()
    if (json.usage) noteUsage({ input: json.usage.prompt_tokens || 0, output: json.usage.completion_tokens || 0, cacheRead: json.usage.prompt_tokens_details?.cached_tokens || 0 }, model)
    return extractJson(json.choices?.[0]?.message?.content || '')
  },
  async ping(model, signal) {
    const res = await apiFetch(this.url(), this.headers(), { model, messages: [{ role: 'user', content: 'Reply with OK' }] }, { signal, model, adjust: this.adjust })
    const json = await res.json()
    return String(json.choices?.[0]?.message?.content || '')
  },
}

/**
 * Claude's system prompt as two cached blocks: the static coach instructions, then today's memory and training
 * data. The data block is the bulk of every request; cached, each further tool round (and the next message
 * within 5 minutes, if the data hasn't changed) reads it at a tenth of the price instead of paying for it again.
 */
function claudeSystem(system) {
  if (system.startsWith(COACH_SYSTEM)) {
    const rest = system.slice(COACH_SYSTEM.length).trim()
    return [{ type: 'text', text: COACH_SYSTEM, cache_control: { type: 'ephemeral' } }, ...(rest ? [{ type: 'text', text: rest, cache_control: { type: 'ephemeral' } }] : [])]
  }
  return [{ type: 'text', text: system }]
}

/** Claude needs the schema strict: every object closed. */
function strictSchema(s) {
  if (!s || typeof s !== 'object') return s
  const out = { ...s }
  if (out.type === 'object') {
    out.additionalProperties = false
    if (out.properties) out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, strictSchema(v)]))
  }
  if (out.items) out.items = strictSchema(out.items)
  return out
}

const anthropic = {
  url: () => `${BASE}/v1/messages`,
  headers: () => ({ 'x-api-key': API_KEY(), 'anthropic-version': '2023-06-01' }),
  adjust(message, payload, fixes) {
    if (/effort/i.test(message) && payload.output_config?.effort && !fixes.has('effort')) {
      fixes.add('effort')
      const { effort, ...oc } = payload.output_config
      const { output_config, ...rest } = payload
      return Object.keys(oc).length ? { ...rest, output_config: oc } : rest
    }
    if (/max_tokens/i.test(message) && payload.max_tokens > 8192 && !fixes.has('max')) {
      fixes.add('max')
      return { ...payload, max_tokens: 8192 }
    }
    if (/tool_choice/i.test(message) && payload.tool_choice && !fixes.has('tool_choice')) {
      fixes.add('tool_choice')
      const { tool_choice, ...rest } = payload
      return rest
    }
    return null
  },
  /** Alternating user/assistant turns that end on the athlete (a trailing assistant turn would be read as a prefill). */
  start(messages) {
    const out = []
    for (const m of messages) {
      const last = out[out.length - 1]
      if (last?.role === m.role) last.content += `\n\n${m.content}`
      else out.push({ role: m.role, content: m.content })
    }
    while (out.length && out[out.length - 1].role !== 'user') out.pop()
    return out
  },
  async turn({ system, history, textOnly, planning, model, effort, onText, onWait, signal }) {
    const payload = {
      model,
      max_tokens: 16000,
      stream: true,
      // the fourth cache breakpoint (tools and the two system blocks hold the others): the conversation so
      // far, so each tool round reads the earlier rounds from the cache
      cache_control: { type: 'ephemeral' },
      system: claudeSystem(system),
      messages: history,
      tools: ANTHROPIC_TOOLS,
      ...(textOnly ? { tool_choice: { type: 'none' } } : {}),
      output_config: { effort: effort || (planning ? 'medium' : 'low') },
    }
    const blocks = []
    let finish = ''
    let bad = 0
    let usage = {}
    let malformed = false
    await readSse(
      (sig, rearm) => apiFetch(this.url(), this.headers(), payload, { signal: sig, model, onWait: (ms) => (rearm(ms), onWait?.(ms)), adjust: this.adjust }),
      (event, data) => {
        let ev
        try {
          ev = JSON.parse(data)
        } catch {
          bad++
          return
        }
        const type = ev.type || event
        if (type === 'error') {
          const t = String(ev.error?.type || '')
          const status = { overloaded_error: 529, rate_limit_error: 429, api_error: 500, authentication_error: 401, permission_error: 403, not_found_error: 404, invalid_request_error: 400, request_too_large: 413, billing_error: 402 }[t] || 500
          throw Object.assign(new Error(ev.error?.message || 'error in stream'), { status, api: true, provider: PROVIDER, model, type: t })
        }
        if (type === 'message_start') Object.assign(usage, ev.message?.usage || {})
        else if (type === 'message_delta') {
          if (ev.delta?.stop_reason) finish = ev.delta.stop_reason
          Object.assign(usage, ev.usage || {})
        } else if (type === 'content_block_start') {
          const b = { ...ev.content_block }
          if (b.type === 'tool_use') b._json = ''
          blocks[ev.index] = b
          if (b.type === 'text' && b.text) onText(b.text)
        } else if (type === 'content_block_delta') {
          const b = blocks[ev.index]
          const d = ev.delta || {}
          if (!b) return
          if (d.type === 'text_delta') {
            b.text = (b.text || '') + d.text
            if (d.text) onText(d.text)
          } else if (d.type === 'input_json_delta') b._json += d.partial_json || ''
          else if (d.type === 'thinking_delta') b.thinking = (b.thinking || '') + (d.thinking || '')
          else if (d.type === 'signature_delta') b.signature = (b.signature || '') + (d.signature || '')
        } else if (type === 'content_block_stop') {
          const b = blocks[ev.index]
          if (b?.type === 'tool_use') {
            try {
              b.input = b._json.trim() ? JSON.parse(b._json) : b.input || {}
            } catch {
              malformed = true
            }
            delete b._json
          }
        }
      },
      { signal },
    )
    if (bad) console.warn(`coach: skipped ${bad} unreadable event(s) from Claude`)
    // Sent back unchanged (thinking blocks included), minus empty text blocks, which the API refuses.
    const content = blocks.filter(Boolean).filter((b) => !(b.type === 'text' && !b.text))
    for (const b of content) if (b._json != null) (b.input = b.input || {}), delete b._json
    const calls = content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input }))
    const map = { end_turn: 'STOP', stop_sequence: 'STOP', tool_use: 'STOP', max_tokens: 'MAX_TOKENS', model_context_window_exceeded: 'MAX_TOKENS', refusal: 'SAFETY', pause_turn: 'PAUSE' }
    const u = { input: usage.input_tokens || 0, output: usage.output_tokens || 0, cacheRead: usage.cache_read_input_tokens || 0, cacheWrite: usage.cache_creation_input_tokens || 0 }
    return {
      calls: malformed ? [] : calls,
      wrote: content.some((b) => b.type === 'text' && b.text.trim()),
      finish: malformed ? 'MALFORMED_FUNCTION_CALL' : map[finish] || (finish ? finish.toUpperCase() : ''),
      blocked: '',
      raw: content,
      usage: u,
    }
  },
  addTurn(history, turn, results) {
    if (turn.raw.length) history.push({ role: 'assistant', content: turn.raw })
    if (results.length)
      history.push({
        role: 'user',
        content: results.map(({ call, response }) => ({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(response), ...(response?.error ? { is_error: true } : {}) })),
      })
  },
  async json(system, prompt, schema, model, { signal, effort = 'low' } = {}) {
    const ask = (structured) =>
      apiFetch(
        this.url(),
        this.headers(),
        {
          model,
          max_tokens: 4096,
          system: claudeSystem(system),
          messages: [{ role: 'user', content: structured ? prompt : `${prompt}\n\nReply with only a JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(schema)}` }],
          output_config: { effort, ...(structured ? { format: { type: 'json_schema', schema: strictSchema(schema) } } : {}) },
        },
        { signal, model, adjust: this.adjust },
      )
    let res
    try {
      res = await ask(true)
    } catch (e) {
      if (e?.status !== 400 || !/output_config|format|schema|structured/i.test(e.message || '')) throw e
      res = await ask(false)
    }
    const json = await res.json()
    if (json.usage) noteUsage({ input: json.usage.input_tokens || 0, output: json.usage.output_tokens || 0, cacheRead: json.usage.cache_read_input_tokens || 0, cacheWrite: json.usage.cache_creation_input_tokens || 0 }, model)
    if (json.stop_reason === 'refusal') throw Object.assign(new Error('Claude declined'), { code: 'refusal' })
    return extractJson((json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''))
  },
  async ping(model, signal) {
    const res = await apiFetch(this.url(), this.headers(), { model, max_tokens: 256, messages: [{ role: 'user', content: 'Reply with OK' }], output_config: { effort: 'low' } }, { signal, model, adjust: this.adjust })
    const json = await res.json()
    return (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
  },
}

const API = { gemini, openai, anthropic }[PROVIDER] || gemini

/** What kind of failure, for the app's status line. */
function errorKind(e) {
  const s = e?.status
  const m = String(e?.message || '')
  if (e?.code === 'idle' || e?.code === 'total' || e?.name === 'TimeoutError') return 'timeout'
  if (e?.network) return 'network'
  if (!e?.api) return 'other'
  if (e.credits || s === 402) return 'credits'
  if (s === 429) return e.daily ? 'daily' : 'quota'
  if (s === 401 || (s === 403 && !IS_GEMINI) || (s === 400 && /api[ _-]?key/i.test(m))) return 'key'
  if (s === 403) return 'key'
  if (s === 404 || (s === 400 && /model/i.test(m) && /not (exist|found|valid|supported)|invalid|unknown|does not|no such/i.test(m))) return 'model'
  if (s === 503 || s === 529) return 'overloaded'
  if (s >= 500) return 'server'
  return 'other'
}

export function friendlyError(e) {
  const status = e?.status
  const message = e?.message
  if (e?.code === 'idle') return `${LABEL} stopped responding (nothing for ${Math.round(IDLE_MS / 1000)} seconds), so I stopped waiting. Try again; if it keeps happening, ask for a smaller piece, e.g. one phase.`
  if (e?.code === 'total') return `That took over ${Math.round(TOTAL_MS / 60000)} minutes, so I stopped. Try again, or ask for a smaller piece, e.g. one phase.`
  if (e?.code === 'json') return `${LABEL} didn’t answer in the expected format. Try again.`
  if (!e?.api) return e?.network ? `The server couldn’t reach ${LABEL} (network problem on the server). Try again in a minute.` : 'The coach is unavailable right now.'
  if (e?.network) return `The server couldn’t reach ${LABEL} at ${HOST} (network problem on the server${IS_GEMINI ? '' : ', or COACH_BASE_URL is wrong'}). Try again in a minute.`
  const kind = errorKind(e)
  const modelVar = e.model && e.model !== MODEL ? PLAN_VAR : MODEL_VAR
  if (kind === 'credits') return `${LABEL} says the account is out of credits or quota (${status}). Add credits or billing there, or switch COACH_MODEL to a free model.`
  if (status === 429) {
    if (IS_GEMINI) {
      if (e.daily) return 'The free Gemini daily limit is used up. It resets at midnight Pacific time (or add billing to the key for more).'
      const s = Math.round((e.retryMs || 0) / 1000)
      return `The free Gemini limit is used up for the moment (it allows only so many requests and tokens per minute). Try again in ${s > 5 ? `about ${s} seconds` : 'a minute'}.`
    }
    if (e.daily) return `${LABEL}’s daily limit for this key is used up. Try again tomorrow, or raise the limit on their side.`
    const s = Math.round((e.retryMs || 0) / 1000)
    return `${LABEL} is rate-limiting this key for the moment. Try again in ${s > 5 ? `about ${s} seconds` : 'a minute'}.`
  }
  if (IS_GEMINI && status === 403) return 'The server’s GEMINI_API_KEY isn’t allowed to use this model.'
  if (kind === 'key') return `The server’s ${KEY_VAR} was rejected by ${LABEL}. Check the key in Coolify and redeploy.`
  if (kind === 'model') return `${LABEL} doesn’t know the model “${e.model || MODEL}”. Set ${modelVar} on the server${!IS_GEMINI && status === 404 ? ' (or check COACH_BASE_URL)' : ''}.`
  if (kind === 'overloaded') return `${LABEL} is overloaded right now (their side). Try again in a minute.`
  if (status >= 500) return `${LABEL} had an internal error. Try again in a minute.`
  return `${LABEL}: ${message}`
}

/** A single JSON answer that follows `schema` (JSON Schema, or Gemini's upper-case dialect: both work). */
async function generateJson(system, prompt, schema, model = MODEL, opts = {}) {
  // Same patience as a chat reply: never hang a pre-workout card or the weekly review forever.
  const signal = AbortSignal.timeout(IDLE_MS + 30000)
  try {
    const out = await API.json(system, prompt, toJsonSchema(schema), model, { ...opts, signal })
    noteOk()
    return out
  } catch (e) {
    const err = e?.name === 'TimeoutError' || (e?.name === 'AbortError' && signal.aborted) ? Object.assign(new Error(`${LABEL} went quiet`), { code: 'idle' }) : e
    noteError(err)
    throw err
  }
}

/** One tiny real call, for Settings → Coach → Test. */
export async function testCoach() {
  const base = { provider: PROVIDER, label: LABEL, model: MODEL || null }
  if (!coachEnabled()) return { ...base, ok: false, ms: 0, error: coachProblem() }
  const t0 = Date.now()
  const signal = AbortSignal.timeout(20000)
  try {
    const reply = await API.ping(MODEL, signal)
    noteOk()
    return { ...base, ok: true, ms: Date.now() - t0, reply: String(reply || '').trim().slice(0, 80) }
  } catch (e) {
    const err = e?.name === 'TimeoutError' || signal.aborted ? Object.assign(new Error('timeout'), { code: 'test-timeout' }) : e
    if (err.code === 'test-timeout') {
      stats.lastError = { at: Date.now(), message: `${LABEL} didn’t answer within 20 seconds.`, status: 0, code: 'timeout' }
      return { ...base, ok: false, ms: Date.now() - t0, error: stats.lastError.message, code: 'timeout' }
    }
    noteError(err)
    return { ...base, ok: false, ms: Date.now() - t0, error: friendlyError(err), code: errorKind(err), status: err?.status || 0 }
  }
}

// ---- tools ----------------------------------------------------------------------

export function createCoach({ db, q, mcp, push, who = '' }) {
  const items = () => mcp.rows('coach')
  const write = (rec) => {
    const seq = q.maxSeq.get().seq + 1
    const updatedAt = Date.now()
    q.upsert.run('coach', rec.id, updatedAt, 0, JSON.stringify({ ...rec, updatedAt }), seq)
  }
  const tombstone = (id) => {
    const seq = q.maxSeq.get().seq + 1
    q.upsert.run('coach', id, Date.now(), 1, 'null', seq)
  }
  const newId = (p) => `${p}-${crypto.randomUUID().slice(0, 10)}`
  const ymd = ymdShared

  function profileOf(list = items()) {
    return list.find((x) => x.kind === 'profile') || { id: 'profile', kind: 'profile' }
  }

  const systemText = ({ context, tz }) => buildSystem({ list: items(), context, tz })


  const same = (a, b) => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '') === String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '')

  /** Runs a tool call. `emit` sends events (proposals, memory changes) to the app. */
  async function runTool(name, args, emit, appRoutines, lastUser = '') {
    args = args || {}
    switch (name) {
      case 'list_routines':
        // The app's copy is authoritative: built-in routines only reach the server once edited.
        if (appRoutines) return { result: appRoutines }
        return { result: await mcp.callTool(name, args) }
      case 'recent_workouts':
      case 'exercise_progress':
      case 'body_stats':
      case 'search_exercises':
        return { result: await mcp.callTool(name, args) }
      case 'training_knowledge':
        return { result: knowledgeLookup(args.topic) }
      case 'find_stretches':
        return { result: findStretches({ area: String(args.area || ''), goal: String(args.goal || ''), equipment: String(args.equipment || '') }) }
      case 'search_library':
        return { result: searchLibrary(items(), String(args.query || '')) }
      case 'save_to_library': {
        const title = String(args.title || '').trim().slice(0, 120)
        // use_last_message saves what they pasted as-is, so the model doesn't have to retype thousands of words.
        const text = String(args.use_last_message ? lastUser : args.text || '').trim().slice(0, 60000)
        if (!title || !text) return { error: 'title and text are required (or use_last_message: true)' }
        const dupe = items().find((x) => x.kind === 'source' && same(x.text, title))
        const rec = { id: dupe?.id || newId('src'), kind: 'source', text: title, body: text, created: dupe?.created || Date.now(), source: 'coach' }
        write(rec)
        emit({ memory: { action: 'library', text: title } })
        return { saved: rec.id }
      }
      case 'save_exercise_video': {
        const url = String(args.url || '').trim()
        if (!/^https?:\/\//i.test(url)) return { error: 'That is not a web link' }
        const { title } = await videoInfo(url)
        const ex = args.exercise ? matchExercise(String(args.exercise), mcp.library()) : null
        if (!ex) return { title, saved: false, note: args.exercise ? `No exercise matches "${args.exercise}". Search with search_exercises or ask.` : 'Which exercise is it for? Ask them, or decide from the title, then call again with exercise.' }
        // The app saves it on the exercise (and syncs it back here).
        emit({ video: { exerciseId: ex.id, name: ex.name, url, title } })
        emit({ memory: { action: 'video', text: `${ex.name}: ${title || url}` } })
        return { saved: true, exercise: ex.name, title }
      }
      case 'remember': {
        const text = String(args.note || '').trim().slice(0, 300)
        if (!text) return { error: 'empty note' }
        const dupe = items().find((x) => x.kind === 'note' && same(x.text, text))
        if (dupe) return { saved: dupe.id, note: 'already in memory' }
        const rec = { id: newId('note'), kind: 'note', text, created: Date.now(), source: 'coach' }
        write(rec)
        emit({ memory: { action: 'remembered', text } })
        return { saved: rec.id }
      }
      case 'forget': {
        const note = items().find((x) => x.id === args.note_id && x.kind === 'note')
        if (!note) return { error: 'no such note' }
        tombstone(note.id)
        emit({ memory: { action: 'forgot', text: note.text } })
        return { deleted: note.id }
      }
      case 'set_commitment': {
        const dupe = items().find((x) => x.kind === 'commitment' && (x.status || 'open') === 'open' && same(x.text, args.text))
        if (dupe) return { saved: dupe.id, note: 'already an open commitment' }
        const due = Date.parse(args.due_date)
        const rec = { id: newId('commit'), kind: 'commitment', text: String(args.text || '').slice(0, 300), due: Number.isFinite(due) ? due : null, status: 'open', created: Date.now(), source: 'coach' }
        write(rec)
        emit({ memory: { action: 'commitment', text: rec.text } })
        return { saved: rec.id }
      }
      case 'resolve_commitment': {
        const c = items().find((x) => x.id === args.id && x.kind === 'commitment')
        if (!c) return { error: 'no such commitment' }
        write({ ...c, status: ['done', 'missed', 'dropped'].includes(args.status) ? args.status : 'done', outcome: args.outcome ? String(args.outcome).slice(0, 300) : c.outcome })
        return { updated: c.id }
      }
      case 'resolve_goal': {
        const g = items().find((x) => x.id === args.id && x.kind === 'goal')
        if (!g) return { error: 'no such goal' }
        const status = args.status === 'dropped' ? 'dropped' : 'done'
        write({ ...g, status, outcome: args.outcome ? String(args.outcome).slice(0, 300) : g.outcome })
        emit({ memory: { action: status === 'done' ? 'goal reached' : 'goal dropped', text: g.text } })
        return { updated: g.id }
      }
      case 'propose_catalog_program': {
        const p = PROGRAM_CATALOG.find((x) => x.id === String(args.id || '').trim())
        if (!p) return { error: `No program "${args.id}" in the library. Ids: ${PROGRAM_CATALOG.map((x) => x.id).join(', ') || '(none)'}` }
        emit({ proposal: { id: newId('prop'), tool: name, args: { ...args, id: p.id } } })
        return { status: `"${p.name}" shown to the athlete with Approve and Dismiss buttons. They decide in the app; offer adjustments (propose_routine_changes) after they approve.` }
      }
      case 'propose_routine_changes':
      case 'propose_routine_targets':
      case 'propose_goal':
      case 'propose_training_block':
      case 'propose_program':
      case 'propose_mobility_plan':
      case 'swap_exercise':
      case 'propose_profile_update': {
        const id = newId('prop')
        emit({ proposal: { id, tool: name, args } })
        return { status: 'Shown to the athlete with Approve and Dismiss buttons. They decide in the app.' }
      }
      default:
        return { error: `unknown tool ${name}` }
    }
  }

  // Replies in progress (or finished in the last few minutes), by the run id the app sends. If the
  // phone loses the stream (screen off, network switch), it reconnects with { resume: id } and gets
  // everything so far replayed, then the rest live; the reply keeps going on the server meanwhile.
  const runs = new Map()
  const RUN_KEEP = 10 * 60000

  const sse = (res, obj) => {
    if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`)
  }

  /** Follow a run on this response: replay what was sent, then stream the rest. Pings every 15 s keep proxies from closing a quiet connection. */
  function attach(run, res) {
    for (const ev of run.events) sse(res, ev)
    if (run.finished) return res.end()
    run.listeners.add(res)
    const ping = setInterval(() => sse(res, {}), 15000)
    res.on('close', () => (clearInterval(ping), run.listeners.delete(res)))
  }

  /** What the athlete reads when a round ends without a usable answer. */
  function finishText(finish, said, planning) {
    const smaller = planning ? 'Ask for one phase at a time, or start it from the program library if it’s there.' : 'Ask again a bit more narrowly.'
    switch (finish) {
      case 'MAX_TOKENS':
        return said ? '\n\n(Answer cut short: it ran out of room.)' : `That came out too long for ${LABEL} to finish. ${smaller}`
      case 'MALFORMED_FUNCTION_CALL':
      case 'UNEXPECTED_TOOL_CALL':
        return `${said ? '\n\n' : ''}${LABEL} garbled the change it was preparing (twice), so nothing was proposed. ${smaller}`
      case 'RECITATION':
        return `${said ? '\n\n' : ''}${LABEL} stopped because the answer repeated published text word for word. Ask it to summarise or adapt instead of copying.`
      case 'SAFETY':
      case 'PROHIBITED_CONTENT':
      case 'BLOCKLIST':
      case 'SPII':
        return `\n\n${LABEL} declined to answer that one. Try asking about your training a different way.`
      case 'TOO_MANY_TOOL_CALLS':
        return `${said ? '\n\n' : ''}That needed too many look-ups at once. ${smaller}`
      default:
        return `${said ? '\n\n' : ''}${LABEL} came back without an answer${finish && finish !== 'STOP' ? ` (${finish})` : ''}. Try again; if it keeps happening, ${planning ? 'ask for one phase at a time.' : 'rephrase the question.'}`
    }
  }

  /** Chat: streams text and events as SSE, running tool calls in a loop (up to MAX_ROUNDS rounds; the last one must answer in words). */
  async function streamChat(body, res) {
    // Never reject: the server doesn't await this, so an escaped error would take the process down.
    try {
      await callCtx.run({ who, kind: 'chat' }, () => chat(body || {}, res))
    } catch (e) {
      console.error('coach chat failed', e)
      if (!res.headersSent) res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
      sse(res, { error: 'The coach hit an error on the server. Try again.' })
      res.end()
    }
  }

  async function chat(body, res) {
    const tz = typeof body.tz === 'string' ? body.tz : undefined
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    if (body.cancel) {
      runs.get(String(body.cancel))?.ctrl.abort()
      sse(res, { done: true })
      return res.end()
    }
    if (body.resume) {
      const old = runs.get(String(body.resume))
      if (old) return attach(old, res)
      sse(res, { error: 'That answer is no longer on the server (it restarted or too much time passed). Ask again.', gone: true })
      return res.end()
    }
    const messages = cleanMessages(body.messages)
    if (!messages) {
      sse(res, { error: 'Nothing to answer.' })
      return res.end()
    }
    const id = typeof body.run === 'string' && /^[\w-]{6,64}$/.test(body.run) ? body.run : newId('run')
    runs.get(id)?.ctrl.abort()
    const run = { events: [], listeners: new Set(), finished: false, ctrl: new AbortController() }
    runs.set(id, run)
    for (const [k, r] of runs) if (runs.size > 20 && r.finished) runs.delete(k)
    attach(run, res)
    const send = (obj) => {
      run.events.push(obj)
      for (const l of run.listeners) sse(l, obj)
    }
    let overTime = false
    const cap = setTimeout(() => ((overTime = true), run.ctrl.abort()), TOTAL_MS)

    let said = false
    let proposed = false
    let retried = false
    let forceText = false
    let ended = false
    const lastUser = messages[messages.length - 1]?.content || ''
    const planning = isPlanning(lastUser)
    const { model, effort } = pick(levelOf(body.level), planning)
    const history = API.start(messages)
    const system = systemText({ context: typeof body.context === 'string' ? body.context.slice(0, 300000) : '', tz })
    const appRoutines = typeof body.routines === 'string' ? body.routines.slice(0, 50000) : ''
    const usage = { rounds: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    let pauses = 0
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        // The last round (and a retry after an empty reply) must answer in words, so a reply never ends on a silent tool call.
        const textOnly = forceText || round === MAX_ROUNDS - 1
        const turn = await API.turn({
          system,
          history,
          textOnly,
          planning,
          model,
          effort,
          onText: (t) => ((said = true), send({ t })),
          onWait: (ms) => send({ status: `${IS_GEMINI ? 'Gemini’s free tier' : LABEL} asked to wait ${Math.round(ms / 1000)} s` }),
          signal: run.ctrl.signal,
        })
        const { calls, wrote, finish, blocked } = turn
        usage.rounds++
        for (const k of ['input', 'output', 'cacheRead', 'cacheWrite']) usage[k] += turn.usage?.[k] || 0
        noteUsage(turn.usage, model)
        ended = true // until this round asks for tools
        if (blocked || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(finish)) {
          send({ t: finishText('SAFETY', said, planning) })
          break
        }
        if (finish === 'PAUSE' && !calls.length && pauses < 2) {
          // Claude paused a long turn: send it back as-is so it carries on.
          pauses++
          API.addTurn(history, turn, [])
          ended = false
          round--
          continue
        }
        if (!calls.length) {
          if (wrote && finish !== 'MAX_TOKENS' && finish !== 'RECITATION') break // a normal answer
          if (proposed && !wrote && (!finish || finish === 'STOP')) break // the proposal card speaks for itself
          // A garbled tool call or an empty reply is usually a one-off: try that round once more.
          const flaky = ['MALFORMED_FUNCTION_CALL', 'UNEXPECTED_TOOL_CALL', 'OTHER', 'STOP', ''].includes(finish) && !wrote
          if (flaky && !retried && round < MAX_ROUNDS - 1) {
            retried = true
            if (finish !== 'MALFORMED_FUNCTION_CALL' && finish !== 'UNEXPECTED_TOOL_CALL') forceText = true
            console.warn(`coach: round ${round} ended with ${finish || 'no finish reason'} and no answer; retrying`)
            continue
          }
          console.warn(`coach: round ${round} ended with ${finish || 'no finish reason'}${wrote ? '' : ' and no answer'}`)
          send({ t: finishText(finish, said, planning) })
          break
        }
        ended = false
        const results = []
        for (const call of calls) {
          send({ tool: call.name })
          let response
          try {
            response = await runTool(call.name, call.args, send, appRoutines, lastUser)
          } catch (e) {
            response = { error: String(e?.message || e) }
          }
          if (call.name.startsWith('propose_') && !response.error) proposed = true
          results.push({ call, response })
        }
        API.addTurn(history, turn, results)
      }
      noteOk()
      mine().lastUsage = { ...usage, model, at: Date.now() }
      console.log(`coach: ${PROVIDER} ${model} · ${usage.rounds} round(s) · in ${usage.input}${usage.cacheRead ? ` (cached ${usage.cacheRead})` : ''} · out ${usage.output}`)
      if (!ended && !said && !proposed) send({ t: 'That took too many steps without an answer. Ask again more narrowly, e.g. one phase or one routine.' })
      send({ done: true })
    } catch (e) {
      const err = overTime ? Object.assign(new Error('too long'), { code: 'total' }) : e
      if (err?.name !== 'AbortError' || overTime) {
        console.error('coach error', err?.status || err?.code || '', err?.message || err)
        noteError(err)
        send({ error: friendlyError(err) })
      } else send({ error: 'Stopped.', stopped: true })
    } finally {
      clearTimeout(cap)
      run.finished = true
      for (const l of run.listeners) l.end()
      run.listeners.clear()
      setTimeout(() => runs.get(id) === run && runs.delete(id), RUN_KEEP).unref()
    }
  }

  /** Short structured answers: pre-workout targets, post-workout takeaway, condensing old chat. */
  function quick(body) {
    return callCtx.run({ who, kind: String(body?.kind || 'quick').slice(0, 20) }, () => quickRun(body || {}))
  }
  async function quickRun(body) {
    // the athlete's reasoning level; live lines stay on the quick model whatever it is
    const { model, effort } = pick(levelOf(body.level), false)
    const tz = typeof body.tz === 'string' ? body.tz : undefined
    const context = typeof body.context === 'string' ? body.context.slice(0, 300000) : ''
    const system = systemText({ context, tz })
    if (body.kind === 'pre') {
      const routine = String(body.routine || 'today’s workout')
      const exercises = Array.isArray(body.exercises) ? body.exercises.slice(0, 20).map(String) : []
      const out = await generateJson(
        system,
        QUICK.pre.prompt(routine, exercises),
        toGemini(QUICK.pre.schema),
        model,
        { effort },
      )
      return { focus: String(out.focus || ''), targets: Array.isArray(out.targets) ? out.targets : [] }
    }
    if (body.kind === 'workout') {
      const out = await generateJson(
        system,
        QUICK.workout.prompt(),
        toGemini(QUICK.workout.schema),
        model,
        { effort },
      )
      const text = String(out.takeaway || '').trim()
      if (text && typeof body.workoutId === 'string') write({ id: `insight-w-${body.workoutId}`, kind: 'insight', type: 'workout', ref: body.workoutId, text, created: Date.now(), source: 'coach' })
      const all = items()
      for (const [ids, status] of [
        [out.met, 'done'],
        [out.missed, 'missed'],
      ]) {
        for (const id of Array.isArray(ids) ? ids : []) {
          const c = all.find((x) => x.id === id && x.kind === 'commitment' && (x.status || 'open') === 'open')
          if (c) write({ ...c, status, outcome: `Checked after the ${ymd(Date.now(), tz)} workout` })
        }
      }
      return { text }
    }
    if (body.kind === 'condense') {
      const transcript = (cleanMessages(body.messages) || []).map((m) => `${m.role === 'user' ? 'Athlete' : 'Coach'}: ${m.content}`).join('\n\n')
      if (!transcript) return { notes: [] }
      const out = await generateJson(
        system,
        QUICK.condense.prompt(transcript),
        toGemini(QUICK.condense.schema),
        model,
        { effort },
      )
      const notes = (Array.isArray(out.notes) ? out.notes : []).map((n) => String(n).trim()).filter(Boolean).slice(0, 5)
      for (const text of notes) write({ id: newId('note'), kind: 'note', text: text.slice(0, 300), created: Date.now(), source: 'coach' })
      return { notes }
    }
    if (body.kind === 'live') {
      // a short line during a workout; the phone's own engine already set the numbers (src/liveCoach.ts)
      const state = body.state && typeof body.state === 'object' ? body.state : {}
      const out = await generateJson(
        system,
        QUICK.live.prompt(state),
        toGemini(QUICK.live.schema),
      )
      return QUICK.live.clean(out)
    }
    throw Object.assign(new Error('Unknown request'), { status: 400 })
  }

  // ---- weekly review: Sunday from 18:00 in the athlete's time zone ----
  function weeklyTick() {
    return callCtx.run({ who, kind: 'weekly' }, weeklyRun)
  }
  async function weeklyRun() {
    if (!coachEnabled()) return
    try {
      const p = profileOf()
      const tz = p.tz || process.env.TZ || 'UTC'
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]))
      if (!process.env.WEEKLY_REVIEW_ANYDAY && (parts.weekday !== 'Sun' || Number(parts.hour) < 18)) return // the env var is for testing
      const weekKey = ymd(Date.now() - 6 * DAY, tz) // Monday of this week
      const id = `insight-week-${weekKey}`
      if (items().some((x) => x.id === id)) return
      const workouts = mcp.rows('workouts').filter((w) => w.start > Date.now() - 7 * DAY)
      if (!workouts.length && !mcp.rows('workouts').length) return // nothing logged at all
      // The app keeps its full training summary here (goals, estimates, blocks, check-ins); use it when it's recent.
      const snap = items().find((x) => x.id === 'snapshot-context' && x.kind === 'snapshot')
      const fresh = snap?.text && snap.created > Date.now() - 4 * DAY
      const context = [
        ...(fresh ? [`SUMMARY FROM THE APP (as of ${ymd(snap.created, tz)})\n${String(snap.text).slice(0, 150000)}`] : []),
        `THIS WEEK'S WORKOUTS\n${await mcp.callTool('recent_workouts', { from: weekKey, limit: 20 })}`,
        ...(fresh ? [] : [`EARLIER WORKOUTS\n${await mcp.callTool('recent_workouts', { to: ymd(Date.now() - 7 * DAY, tz), limit: 12 })}`, await mcp.callTool('body_stats', {})]),
      ].join('\n\n')
      const level = levelOf(mcp.rows('settings').find((x) => x.id === 'settings')?.coachLevel)
      const plan = pick(level, true)
      const out = await generateJson(systemText({ context, tz }), QUICK.weekly.prompt(), toGemini(QUICK.weekly.schema), plan.model, { effort: plan.effort })
      const text = String(out.review || '').trim()
      if (!text) return
      write({ id, kind: 'insight', type: 'weekly', ref: weekKey, text, created: Date.now(), source: 'coach' })
      push?.schedule({ key: 'weekly', at: Date.now(), title: 'Your week in review', body: String(out.headline || 'Your coach has a review of your week.').slice(0, 180), tag: 'weekly' })
      console.log('weekly review written', weekKey)
    } catch (e) {
      console.error('weekly review failed', e?.status || '', e?.message || e)
    }
  }
  setInterval(() => void weeklyTick(), 30 * 60000).unref()
  setTimeout(() => void weeklyTick(), 20000).unref()

  return { streamChat, quick, weeklyTick }
}

function cleanMessages(list) {
  return trimHistory(list)
}
