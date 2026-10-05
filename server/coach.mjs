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
import { COACH_TOOLS, QUICK, isPlanning, systemText as buildSystem, toGemini, ymd as ymdShared } from '../shared/coachSpec.mjs'

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash'
// Optional stronger model for planning questions and weekly reviews (e.g. a Pro model); defaults to MODEL.
const PLAN_MODEL = process.env.GEMINI_PLAN_MODEL || MODEL
const BASE = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')
const DAY = 86400000

export const coachEnabled = () => !!process.env.GEMINI_API_KEY


// ---- Gemini REST -----------------------------------------------------------------

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))), { once: true })
  })

/** POST to Gemini. Busy or flaky answers (429, 5xx, network) are retried twice with backoff before giving up. */
async function geminiFetch(method, payload, signal, model = MODEL) {
  let res
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(model)}:${method}`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(payload),
      })
    } catch (e) {
      if (e?.name === 'AbortError' || attempt >= 2) throw e
      await sleep(1500 * 2 ** attempt, signal)
      continue
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      const wait = Math.min(8000, Number(res.headers.get('retry-after')) * 1000 || 1500 * 2 ** attempt)
      await sleep(wait, signal)
      continue
    }
    break
  }
  if (!res.ok) {
    let message = ''
    try {
      message = (await res.json())?.error?.message || ''
    } catch {
      /* not JSON */
    }
    throw Object.assign(new Error(message || `HTTP ${res.status}`), { status: res.status, gemini: true })
  }
  return res
}

export function friendlyError(e) {
  const status = e?.status
  const message = e?.message
  if (!e?.gemini) return 'The coach is unavailable right now.'
  if (status === 429) return 'The free Gemini limit is used up for now. Try again in a minute (or tomorrow if the daily limit is reached).'
  if (status === 400 && /api key/i.test(message || '')) return 'The server’s GEMINI_API_KEY was rejected.'
  if (status === 403) return 'The server’s GEMINI_API_KEY isn’t allowed to use this model.'
  if (status === 404) return `Gemini doesn’t know the model “${MODEL}”. Set GEMINI_MODEL on the server.`
  return `Gemini: ${message}`
}

/** One streamed model turn. Calls onText for visible text; returns the raw parts (kept for tool loops). */
async function streamTurn(payload, { onText, signal, model }) {
  const res = await geminiFetch('streamGenerateContent?alt=sse', payload, signal, model)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const parts = []
  let finish = ''
  let blocked = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buf.slice(0, i)
      buf = buf.slice(i).replace(/^\r?\n\r?\n/, '')
      const data = chunk
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('')
      if (!data) continue
      const ev = JSON.parse(data)
      if (ev.promptFeedback?.blockReason) blocked = ev.promptFeedback.blockReason
      const cand = ev.candidates?.[0]
      for (const part of cand?.content?.parts || []) {
        // Keep every part exactly as received: Gemini 3 attaches thought signatures that must be sent back.
        parts.push(part)
        if (part.text && !part.thought) onText(part.text)
      }
      if (cand?.finishReason) finish = cand.finishReason
    }
  }
  return { parts, finish, blocked }
}

/** A single JSON answer that follows `schema` (Gemini Schema format, uppercase types). */
async function generateJson(system, prompt, schema, model = MODEL) {
  const res = await geminiFetch('generateContent', {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 4096 },
  }, undefined, model)
  const json = await res.json()
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
  async function runTool(name, args, emit, appRoutines) {
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
        const text = String(args.text || '').trim().slice(0, 60000)
        if (!title || !text) return { error: 'title and text are required' }
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

  /** Chat: streams text and events as SSE, running tool calls in a loop (max 6 rounds). */
  async function streamChat(body, res) {
    const messages = cleanMessages(body.messages)
    const tz = typeof body.tz === 'string' ? body.tz : undefined
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    if (!messages) {
      send({ error: 'Nothing to answer.' })
      return res.end()
    }
    const ctrl = new AbortController()
    res.on('close', () => ctrl.abort())
    const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    const system = systemText({ context: typeof body.context === 'string' ? body.context.slice(0, 300000) : '', tz })
    try {
      for (let round = 0; round < 6; round++) {
        const { parts, finish, blocked } = await streamTurn(
          {
            systemInstruction: { parts: [{ text: system }] },
            contents,
            tools: [{ functionDeclarations: DECLARATIONS }],
            generationConfig: { maxOutputTokens: 8192 },
          },
          { onText: (t) => send({ t }), signal: ctrl.signal, model: isPlanning(messages[messages.length - 1]?.content) ? PLAN_MODEL : MODEL },
        )
        if (blocked || finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') {
          send({ t: '\n\nGemini declined to answer that one. Try asking about your training a different way.' })
          break
        }
        const calls = parts.filter((p) => p.functionCall)
        if (!calls.length) {
          if (finish === 'MAX_TOKENS') send({ t: '\n\n(Answer cut short.)' })
          break
        }
        contents.push({ role: 'model', parts })
        const responses = []
        for (const { functionCall } of calls) {
          send({ tool: functionCall.name })
          let response
          try {
            response = await runTool(functionCall.name, functionCall.args, send, typeof body.routines === 'string' ? body.routines.slice(0, 50000) : '')
          } catch (e) {
            response = { error: String(e?.message || e) }
          }
          responses.push({ functionResponse: { name: functionCall.name, ...(functionCall.id ? { id: functionCall.id } : {}), response } })
        }
        contents.push({ role: 'user', parts: responses })
      }
      send({ done: true })
    } catch (e) {
      if (e?.name !== 'AbortError') {
        console.error('coach error', e?.status || '', e?.message || e)
        send({ error: friendlyError(e) })
      }
    }
    res.end()
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
  if (!Array.isArray(list)) return null
  const msgs = list
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
  while (msgs.length && msgs[0].role !== 'user') msgs.shift()
  return msgs.length ? msgs : null
}
