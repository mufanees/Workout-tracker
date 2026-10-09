// AI coach on Google's Gemini API (REST, no SDK).
//
// - Chat streams over SSE. Gemini can call tools: read-only look-ups (reusing the MCP tools),
//   memory (notes, commitments) that the server writes into the synced "coach" store, and
//   proposals (routine changes, goals, profile edits) that the app shows for one-tap approval.
// - The coach's memory (your profile, notes, goals, open commitments) goes into every request.
// - Short JSON calls produce pre-workout targets, a post-workout takeaway and chat condensing.
// - A background job writes a weekly review on Sunday evening and sends a notification.
import crypto from 'node:crypto'
import { knowledgeLookup, searchLibrary } from '../shared/coachKnowledge.mjs'
import { findStretches } from '../shared/rehabKnowledge.mjs'
import { matchExercise } from '../shared/planImport.mjs'
import { videoInfo } from './video.mjs'
import { COACH_TOOLS, QUICK, isPlanning, systemText as buildSystem, toGemini, trimHistory, ymd as ymdShared } from '../shared/coachSpec.mjs'
import { PROGRAM_CATALOG } from '../shared/programs.mjs'

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash'
// Optional stronger model for planning questions and weekly reviews (e.g. a Pro model); defaults to MODEL.
const PLAN_MODEL = process.env.GEMINI_PLAN_MODEL || MODEL
const BASE = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
const DAY = 86400000

export const coachEnabled = () => !!process.env.GEMINI_API_KEY


// ---- Gemini REST -----------------------------------------------------------------

// A chat round that sends nothing for this long is given up on (Gemini went quiet); a whole chat
// reply, tool rounds included, is capped at COACH_TOTAL_MS. Both are env-tunable for tests.
const IDLE_MS = Number(process.env.COACH_IDLE_MS) || 90000
const TOTAL_MS = Number(process.env.COACH_TOTAL_MS) || 5 * 60000
const MAX_ROUNDS = 8
// Longest wait for a per-minute free-tier limit before retrying (Gemini says how long in RetryInfo).
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

/** POST to Gemini. Busy or flaky answers (429, 5xx, network) are retried with backoff before giving up.
 *  A per-minute free-tier 429 waits as long as Gemini asks (up to about a minute); a daily one fails at once. */
async function geminiFetch(method, payload, signal, model = MODEL, onWait) {
  let res
  let quotaWaited = false
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(model)}:${method}`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(payload),
      })
    } catch (e) {
      if (e?.name === 'AbortError' || attempt >= 2) throw Object.assign(e, { network: e?.name !== 'AbortError' })
      await sleep(1500 * 2 ** attempt, signal)
      continue
    }
    if (res.ok) return res
    let info = { message: '', retryMs: 0, daily: false }
    try {
      info = parseGeminiError(await res.json())
    } catch {
      /* not JSON */
    }
    const header = Number(res.headers.get('retry-after')) * 1000 || 0
    const fail = () => Object.assign(new Error(info.message || `HTTP ${res.status}`), { status: res.status, gemini: true, model, daily: info.daily, retryMs: info.retryMs || header })
    if (res.status === 429) {
      if (info.daily) throw fail()
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
    if (res.status >= 500 && attempt < 2) {
      await sleep(Math.min(8000, header || 1500 * 2 ** attempt), signal)
      continue
    }
    // Some models cap output lower than we ask; drop the cap rather than fail.
    if (res.status === 400 && /max_?output_?tokens|maxOutputTokens/i.test(info.message) && payload.generationConfig?.maxOutputTokens) {
      const { maxOutputTokens, ...rest } = payload.generationConfig
      payload = { ...payload, generationConfig: rest }
      attempt--
      continue
    }
    throw fail()
  }
}

export function friendlyError(e) {
  const status = e?.status
  const message = e?.message
  if (e?.code === 'idle') return `Gemini stopped responding (nothing for ${Math.round(IDLE_MS / 1000)} seconds), so I stopped waiting. Try again; if it keeps happening, ask for a smaller piece, e.g. one phase.`
  if (e?.code === 'total') return `That took over ${Math.round(TOTAL_MS / 60000)} minutes, so I stopped. Try again, or ask for a smaller piece, e.g. one phase.`
  if (!e?.gemini) return e?.network ? 'The server couldn’t reach Gemini (network problem on the server). Try again in a minute.' : 'The coach is unavailable right now.'
  if (status === 429) {
    if (e.daily) return 'The free Gemini daily limit is used up. It resets at midnight Pacific time (or add billing to the key for more).'
    const s = Math.round((e.retryMs || 0) / 1000)
    return `The free Gemini limit is used up for the moment (it allows only so many requests and tokens per minute). Try again in ${s > 5 ? `about ${s} seconds` : 'a minute'}.`
  }
  if (status === 400 && /api key/i.test(message || '')) return 'The server’s GEMINI_API_KEY was rejected.'
  if (status === 403) return 'The server’s GEMINI_API_KEY isn’t allowed to use this model.'
  if (status === 404) return `Gemini doesn’t know the model “${e.model || MODEL}”. Set GEMINI_MODEL${e.model && e.model !== MODEL ? ' / GEMINI_PLAN_MODEL' : ''} on the server.`
  if (status === 503) return 'Gemini is overloaded right now (Google’s side). Try again in a minute.'
  if (status >= 500) return 'Gemini had an internal error. Try again in a minute.'
  return `Gemini: ${message}`
}

/** One streamed model turn. Calls onText for visible text; returns the raw parts (kept for tool loops).
 *  Gives up with code 'idle' when Gemini sends nothing for idleMs; a malformed event is skipped, not fatal. */
async function streamTurn(payload, { onText, onWait, signal, model, idleMs = IDLE_MS }) {
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
  const parts = []
  let finish = ''
  let blocked = ''
  let bad = 0
  const handle = (chunk) => {
    const data = chunk
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('')
    if (!data) return
    let ev
    try {
      ev = JSON.parse(data)
    } catch {
      bad++
      return
    }
    if (ev?.error) {
      const info = parseGeminiError(ev)
      throw Object.assign(new Error(info.message || 'error in stream'), { status: Number(ev.error.code) || 500, gemini: true, model, daily: info.daily, retryMs: info.retryMs })
    }
    if (ev.promptFeedback?.blockReason) blocked = ev.promptFeedback.blockReason
    const cand = ev.candidates?.[0]
    for (const part of cand?.content?.parts || []) {
      // Keep every part exactly as received: Gemini 3 attaches thought signatures that must be sent back.
      parts.push(part)
      if (part.text && !part.thought) onText(part.text)
    }
    if (cand?.finishReason) finish = cand.finishReason
  }
  try {
    arm()
    const res = await geminiFetch('streamGenerateContent?alt=sse', payload, ctrl.signal, model, (ms) => (arm(ms + idleMs), onWait?.(ms)))
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
    if (idle && !signal?.aborted) throw Object.assign(new Error('Gemini went quiet'), { code: 'idle' })
    throw e
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }
  if (bad) console.warn(`coach: skipped ${bad} unreadable event(s) from Gemini`)
  return { parts, finish, blocked }
}

/** A single JSON answer that follows `schema` (Gemini Schema format, uppercase types). */
async function generateJson(system, prompt, schema, model = MODEL) {
  // Same patience as a chat reply: never hang a pre-workout card or the weekly review forever.
  const signal = AbortSignal.timeout(IDLE_MS + 30000)
  let json
  try {
    const res = await geminiFetch('generateContent', {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 4096 },
    }, signal, model)
    json = await res.json()
  } catch (e) {
    if (e?.name === 'TimeoutError' || (e?.name === 'AbortError' && signal.aborted)) throw Object.assign(new Error('Gemini went quiet'), { code: 'idle' })
    throw e
  }
  const text = (json.candidates?.[0]?.content?.parts || [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('')
  return JSON.parse(text)
}

// ---- tools ----------------------------------------------------------------------

const DECLARATIONS = COACH_TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters: toGemini(parameters) }))

export function createCoach({ db, q, mcp, push }) {
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
        return said ? '\n\n(Answer cut short: it ran out of room.)' : `That came out too long for Gemini to finish. ${smaller}`
      case 'MALFORMED_FUNCTION_CALL':
      case 'UNEXPECTED_TOOL_CALL':
        return `${said ? '\n\n' : ''}Gemini garbled the change it was preparing (twice), so nothing was proposed. ${smaller}`
      case 'RECITATION':
        return `${said ? '\n\n' : ''}Gemini stopped because the answer repeated published text word for word. Ask it to summarise or adapt instead of copying.`
      case 'SAFETY':
      case 'PROHIBITED_CONTENT':
      case 'BLOCKLIST':
      case 'SPII':
        return '\n\nGemini declined to answer that one. Try asking about your training a different way.'
      case 'TOO_MANY_TOOL_CALLS':
        return `${said ? '\n\n' : ''}That needed too many look-ups at once. ${smaller}`
      default:
        return `${said ? '\n\n' : ''}Gemini came back without an answer${finish && finish !== 'STOP' ? ` (${finish})` : ''}. Try again; if it keeps happening, ${planning ? 'ask for one phase at a time.' : 'rephrase the question.'}`
    }
  }

  /** Chat: streams text and events as SSE, running tool calls in a loop (up to MAX_ROUNDS rounds; the last one must answer in words). */
  async function streamChat(body, res) {
    // Never reject: the server doesn't await this, so an escaped error would take the process down.
    try {
      await chat(body || {}, res)
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
    const model = planning ? PLAN_MODEL : MODEL
    const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    const system = systemText({ context: typeof body.context === 'string' ? body.context.slice(0, 300000) : '', tz })
    const appRoutines = typeof body.routines === 'string' ? body.routines.slice(0, 50000) : ''
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        // The last round (and a retry after an empty reply) must answer in words, so a reply never ends on a silent tool call.
        const textOnly = forceText || round === MAX_ROUNDS - 1
        const { parts, finish, blocked } = await streamTurn(
          {
            systemInstruction: { parts: [{ text: system }] },
            contents,
            tools: [{ functionDeclarations: DECLARATIONS }],
            ...(textOnly ? { toolConfig: { functionCallingConfig: { mode: 'NONE' } } } : {}),
            generationConfig: { maxOutputTokens: planning ? 65536 : 32768 },
          },
          {
            onText: (t) => ((said = true), send({ t })),
            onWait: (ms) => send({ status: `Gemini’s free tier asked to wait ${Math.round(ms / 1000)} s` }),
            signal: run.ctrl.signal,
            model,
          },
        )
        ended = true // until this round asks for tools
        if (blocked || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(finish)) {
          send({ t: finishText('SAFETY', said, planning) })
          break
        }
        const calls = parts.filter((p) => p.functionCall)
        const wrote = parts.some((p) => p.text && !p.thought && p.text.trim())
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
        contents.push({ role: 'model', parts })
        const responses = []
        for (const { functionCall } of calls) {
          send({ tool: functionCall.name })
          let response
          try {
            response = await runTool(functionCall.name, functionCall.args, send, appRoutines, lastUser)
          } catch (e) {
            response = { error: String(e?.message || e) }
          }
          if (functionCall.name.startsWith('propose_') && !response.error) proposed = true
          responses.push({ functionResponse: { name: functionCall.name, ...(functionCall.id ? { id: functionCall.id } : {}), response } })
        }
        contents.push({ role: 'user', parts: responses })
      }
      if (!ended && !said && !proposed) send({ t: 'That took too many steps without an answer. Ask again more narrowly, e.g. one phase or one routine.' })
      send({ done: true })
    } catch (e) {
      const err = overTime ? Object.assign(new Error('too long'), { code: 'total' }) : e
      if (err?.name !== 'AbortError' || overTime) {
        console.error('coach error', err?.status || err?.code || '', err?.message || err)
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
  async function quick(body) {
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
      )
      return { focus: String(out.focus || ''), targets: Array.isArray(out.targets) ? out.targets : [] }
    }
    if (body.kind === 'workout') {
      const out = await generateJson(
        system,
        QUICK.workout.prompt(),
        toGemini(QUICK.workout.schema),
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
      )
      const notes = (Array.isArray(out.notes) ? out.notes : []).map((n) => String(n).trim()).filter(Boolean).slice(0, 5)
      for (const text of notes) write({ id: newId('note'), kind: 'note', text: text.slice(0, 300), created: Date.now(), source: 'coach' })
      return { notes }
    }
    throw Object.assign(new Error('Unknown request'), { status: 400 })
  }

  // ---- weekly review: Sunday from 18:00 in the athlete's time zone ----
  async function weeklyTick() {
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
      const out = await generateJson(systemText({ context, tz }), QUICK.weekly.prompt(), toGemini(QUICK.weekly.schema), PLAN_MODEL)
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
