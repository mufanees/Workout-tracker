// The coach on Claude, for the Claude-hosted copy (no server). Same instructions, memory and tools
// as the server's Gemini coach (shared/coachSpec.mjs); look-ups read the app's own data and memory
// is saved locally (and from there to the Claude account).
import { COACH_TOOLS, QUICK, systemText, isPlanning, trimHistory } from '../shared/coachSpec.mjs'
import { PROGRAM_CATALOG } from '../shared/programs.mjs'
import { knowledgeLookup, searchLibrary } from '../shared/coachKnowledge.mjs'
import { findStretches } from '../shared/rehabKnowledge.mjs'
import { matchExercise, type LibExercise } from '../shared/planImport.mjs'
import { sampleFn } from './cloud'
import { bodyWeights, coachItems, dayNotes, exercises, fasts, readings, remove, saveCoachItem, workouts } from './store'
import { checkinWords, buildCoachContext, routinesText, workoutLine } from './coachContext'
import { sessionsByExercise } from './stats'
import type { Proposal } from './coach'
import type { CoachItem, Exercise } from './types'
import { findUrl, saveVideo, videoTitle } from './videos'
import { uid } from './util'

const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export interface ChatHandlers {
  onText(text: string): void
  onTool(name: string): void
  onMemory(m: { action: string; text: string }): void
  onProposal(p: Proposal): void
  signal: AbortSignal
}

function lookup(name: string, a: Record<string, unknown>): string {
  if (name === 'list_routines') return routinesText() || 'No routines.'
  if (name === 'recent_workouts') {
    const from = typeof a.from === 'string' ? Date.parse(a.from) : -Infinity
    const to = typeof a.to === 'string' ? Date.parse(a.to) + 86400000 : Infinity
    const list = workouts.value.filter((w) => w.start >= from && w.start < to).slice(0, Math.min(50, Number(a.limit) || 10))
    return list.length ? list.map(workoutLine).join('\n\n') : 'No workouts in that range.'
  }
  if (name === 'exercise_progress') {
    const ex = matchExercise(String(a.name || ''), exercises.value as LibExercise[])
    const s = ex && sessionsByExercise.value.get(ex.id)
    if (!ex || !s?.length) return `No sessions logged for "${a.name}".`
    return `${ex.name}:\n` + [...s].reverse().map((x) => `${iso(x.workout.start)} ${x.sets.map((y) => (y.weight != null ? `${y.weight}×${y.reps ?? '?'}` : `${y.reps ?? y.seconds ?? '?'}`)).join(', ')}`).join('\n')
  }
  if (name === 'body_stats') {
    const w = bodyWeights.value.slice(0, 30).map((b) => `${iso(b.date)} ${b.kg} kg`)
    const f = fasts.value.slice(0, 14).map((x) => `${iso(x.start)} ${x.end ? ((x.end - x.start) / 3600000).toFixed(1) + ' h' : 'in progress'} (goal ${x.goal} h)${x.note ? ` "${x.note}"` : ''}`)
    const r = readings.value.slice(0, 30).map((x) => `${iso(x.date)} resting ${x.rhr} bpm${x.hrv ? `, HRV ${Math.round(x.hrv)} ms` : ''}`)
    const sh = workouts.value.filter((x) => x.shoulder != null).slice(0, 20).map((x) => `${iso(x.start)} ${x.shoulder}/10`)
    const dn = [...dayNotes.value.values()].sort((x, y) => y.id.localeCompare(x.id)).slice(0, 21).map((d) => `${d.id}: ${checkinWords(d) ? `[${checkinWords(d)}] ` : ''}${d.text.slice(0, 300)}`)
    return `Weight:\n${w.join('\n') || 'none'}\n\nFasts:\n${f.join('\n') || 'none'}\n\nMorning readings:\n${r.join('\n') || 'none'}\n\nShoulder (0-10):\n${sh.join('\n') || 'none'}\n\nDay notes:\n${dn.join('\n') || 'none'}`
  }
  if (name === 'training_knowledge') return knowledgeLookup(String(a.topic || ''))
  if (name === 'find_stretches') return findStretches({ area: String(a.area || ''), goal: String(a.goal || ''), equipment: String(a.equipment || '') })
  if (name === 'search_library') return searchLibrary(coachItems.value, String(a.query || ''))
  if (name === 'search_exercises') {
    const words = String(a.query || '').toLowerCase().split(/\s+/).filter(Boolean)
    const muscle = typeof a.muscle === 'string' ? a.muscle.toLowerCase() : ''
    const hits = exercises.value
      .filter((e) => (!muscle || e.muscle.toLowerCase() === muscle) && words.every((w) => `${e.name} ${e.equipment}`.toLowerCase().includes(w)))
      .sort((x, y) => x.name.length - y.name.length)
      .slice(0, 25)
    return hits.length ? hits.map((e) => `${e.name} (${e.muscle}, ${e.equipment})`).join('\n') : 'No matches. Try fewer or different words.'
  }
  return `Unknown tool ${name}`
}

async function memory(name: string, a: Record<string, unknown>, h: Pick<ChatHandlers, 'onMemory'>, lastUser = ''): Promise<unknown> {
  const items = coachItems.value
  if (name === 'save_exercise_video') {
    const url = findUrl(String(a.url || ''))
    if (!url) throw new Error('That is not a web link')
    const title = await videoTitle(url)
    const ex = a.exercise ? (matchExercise(String(a.exercise), exercises.value as LibExercise[]) as Exercise | null) : null
    if (!ex) return { title, saved: false, note: a.exercise ? `No exercise matches "${a.exercise}".` : 'Which exercise is it for? Ask, or decide from the title, then call again with exercise.' }
    await saveVideo(ex, url, { title: title || undefined })
    h.onMemory({ action: 'video', text: `${ex.name}: ${title || url}` })
    return { saved: true, exercise: ex.name, title }
  }
  if (name === 'remember') {
    const text = String(a.note || '').trim().slice(0, 300)
    if (!text) throw new Error('empty note')
    const dupe = items.find((x) => x.kind === 'note' && norm(x.text) === norm(text))
    if (dupe) return { saved: dupe.id, note: 'already in memory' }
    const rec = await saveCoachItem({ id: uid('note-'), kind: 'note', text, created: Date.now(), source: 'coach', updatedAt: 0 })
    h.onMemory({ action: 'remembered', text })
    return { saved: rec.id }
  }
  if (name === 'forget') {
    const n = items.find((x) => x.id === a.note_id && x.kind === 'note')
    if (!n) throw new Error('no such note')
    await remove('coach', n.id)
    h.onMemory({ action: 'forgot', text: n.text || '' })
    return { deleted: n.id }
  }
  if (name === 'set_commitment') {
    const text = String(a.text || '').slice(0, 300)
    const dupe = items.find((x) => x.kind === 'commitment' && (x.status || 'open') === 'open' && norm(x.text) === norm(text))
    if (dupe) return { saved: dupe.id, note: 'already an open commitment' }
    const due = Date.parse(String(a.due_date || ''))
    const rec = await saveCoachItem({ id: uid('commit-'), kind: 'commitment', text, due: Number.isFinite(due) ? due : null, status: 'open', created: Date.now(), source: 'coach', updatedAt: 0 })
    h.onMemory({ action: 'commitment', text })
    return { saved: rec.id }
  }
  if (name === 'resolve_commitment') {
    const c = items.find((x) => x.id === a.id && x.kind === 'commitment')
    if (!c) throw new Error('no such commitment')
    const status = ['done', 'missed', 'dropped'].includes(String(a.status)) ? (String(a.status) as CoachItem['status']) : 'done'
    await saveCoachItem({ ...c, status, outcome: a.outcome ? String(a.outcome).slice(0, 300) : c.outcome })
    return { updated: c.id }
  }
  if (name === 'save_to_library') {
    const title = String(a.title || '').trim().slice(0, 120)
    const text = String(a.use_last_message ? lastUser : a.text || '').trim().slice(0, 60000)
    if (!title || !text) throw new Error('title and text are required (or use_last_message: true)')
    const dupe = items.find((x) => x.kind === 'source' && norm(x.text) === norm(title))
    const rec = await saveCoachItem({ id: dupe?.id || uid('src-'), kind: 'source', text: title, body: text, created: dupe?.created || Date.now(), source: 'coach', updatedAt: dupe?.updatedAt || 0 })
    h.onMemory({ action: 'library', text: title })
    return { saved: rec.id }
  }
  if (name === 'resolve_goal') {
    const g = items.find((x) => x.id === a.id && x.kind === 'goal')
    if (!g) throw new Error('no such goal')
    const status: CoachItem['status'] = a.status === 'dropped' ? 'dropped' : 'done'
    await saveCoachItem({ ...g, status, outcome: a.outcome ? String(a.outcome).slice(0, 300) : g.outcome })
    h.onMemory({ action: status === 'done' ? 'goal reached' : 'goal dropped', text: g.text || '' })
    return { updated: g.id }
  }
  throw new Error(`unknown tool ${name}`)
}

// Same limits as the server: a long latest message (a pasted program) arrives whole, older ones are trimmed.
const turnsFor = (system: string, history: { role: 'user' | 'assistant'; content: string }[]) => [{ role: 'user' as const, content: system }, ...(trimHistory(history) || [])]

/** One chat turn on Claude. Resolves with the reply text. */
export async function claudeChat(history: { role: 'user' | 'assistant'; content: string }[], focusWorkoutId: string | undefined, h: ChatHandlers): Promise<string> {
  const sample = sampleFn.value
  if (!sample) throw new Error('The coach isn’t available here.')
  const system = systemText({ list: coachItems.value, context: buildCoachContext({ focusWorkoutId }), tz: tz() })
  const tools = COACH_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.parameters,
    execute: async (input: Record<string, unknown>) => {
      h.onTool(t.name)
      if (t.kind === 'lookup') return lookup(t.name, input || {}).slice(0, 30000)
      if (t.kind === 'memory') return memory(t.name, input || {}, h, history[history.length - 1]?.content || '')
      if (t.name === 'propose_catalog_program') {
        const prog = PROGRAM_CATALOG.find((x) => x.id === String(input?.id || '').trim())
        if (!prog) return { error: `No program "${String(input?.id)}" in the library. Ids: ${PROGRAM_CATALOG.map((x) => x.id).join(', ') || '(none)'}` }
        input = { ...input, id: prog.id }
      }
      h.onProposal({ id: uid('prop-'), tool: t.name as Proposal['tool'], args: input || {}, state: 'pending' })
      return { status: 'Shown to the athlete with Approve and Dismiss buttons. They decide in the app.' }
    },
  }))
  const msgs = turnsFor(`${system}\n\nThe conversation follows. Reply to the athlete's last message.`, history)
  try {
    // Planning questions (goals, programs, milestones) get the strongest model; everyday ones stay quick.
    const modelTier = isPlanning(history[history.length - 1]?.content || '') ? 'complex' : 'default'
    const { text } = await sample(msgs, { tools, cache: false, modelTier, signal: h.signal, onText: ({ text }: { text: string }) => h.onText(text) })
    return text
  } catch (e) {
    throw new Error(sampleError(e))
  }
}

export function sampleError(e: unknown): string {
  const code = (e as { code?: string })?.code
  if (code === 'cancelled') return 'Stopped.'
  if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared') return 'Allow this page to use Claude to talk to your coach.'
  if (code === 'rate_limited') return 'Claude is busy or your usage limit is reached. Try again in a bit.'
  if (code === 'tools_unavailable') return 'This Claude app can’t run the coach’s tools yet. Try the web app.'
  return 'The coach is unavailable right now.'
}

/** The short structured requests, on Claude. Same shapes as the server's /api/coach/quick. */
export async function claudeQuick<T>(body: Record<string, unknown>, focusWorkoutId?: string): Promise<T> {
  const sample = sampleFn.value
  if (!sample) throw new Error('The coach isn’t available here.')
  const system = systemText({ list: coachItems.value, context: buildCoachContext({ focusWorkoutId }), tz: tz() })
  const kind = String(body.kind)
  const spec = kind === 'pre' ? QUICK.pre : kind === 'workout' ? QUICK.workout : kind === 'condense' ? QUICK.condense : null
  if (!spec) throw new Error('Unknown request')
  const transcript = Array.isArray(body.messages) ? (body.messages as { role: string; content: string }[]).map((m) => `${m.role === 'user' ? 'Athlete' : 'Coach'}: ${m.content}`).join('\n\n') : ''
  const prompt =
    kind === 'pre'
      ? QUICK.pre.prompt(String(body.routine || 'today’s workout'), Array.isArray(body.exercises) ? body.exercises.map(String) : [])
      : kind === 'workout'
        ? QUICK.workout.prompt()
        : QUICK.condense.prompt(transcript)
  let out: Record<string, unknown>
  try {
    out = await sample.json<Record<string, unknown>>(`${system}\n\n${prompt}\n\nReply with only one JSON object of this JSON Schema:\n${JSON.stringify(spec.schema)}`, { modelTier: kind === 'condense' ? 'quick' : 'default' })
  } catch (e) {
    throw new Error(sampleError(e))
  }
  if (kind === 'pre') return { focus: String(out.focus || ''), targets: Array.isArray(out.targets) ? out.targets : [] } as T
  if (kind === 'workout') {
    const text = String(out.takeaway || '').trim()
    const id = String(body.workoutId || '')
    if (text && id) await saveCoachItem({ id: `insight-w-${id}`, kind: 'insight', type: 'workout', ref: id, text, created: Date.now(), source: 'coach', updatedAt: 0 })
    for (const [ids, status] of [
      [out.met, 'done'],
      [out.missed, 'missed'],
    ] as const) {
      for (const cid of Array.isArray(ids) ? ids : []) {
        const c = coachItems.value.find((x) => x.id === cid && x.kind === 'commitment' && (x.status || 'open') === 'open')
        if (c) await saveCoachItem({ ...c, status, outcome: `Checked after the ${iso(Date.now())} workout` })
      }
    }
    return { text } as T
  }
  const notes = (Array.isArray(out.notes) ? out.notes : []).map((n) => String(n).trim()).filter(Boolean).slice(0, 5)
  for (const text of notes) await saveCoachItem({ id: uid('note-'), kind: 'note', text: text.slice(0, 300), created: Date.now(), source: 'coach', updatedAt: 0 })
  return { notes } as T
}
