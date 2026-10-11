// Client side of the coach: availability, quick structured calls, and applying approved proposals.
import { signal, computed, effect } from '@preact/signals'
import { sampleFn } from './cloud'
import { claudeQuick } from './coachClaude'
import { afterServerSync, getToken, syncNow } from './sync'
import { coachItems, exercises, exMap, routines, saveCoachItem, saveExercise, saveRoutine, saveSettings, settings, workouts } from './store'
import { matchExercise, resolvePlan, type LibExercise } from '../shared/planImport.mjs'
import { buildCoachContext, routinesText } from './coachContext'
import type { CoachItem, Exercise, ExType, GoalSpec } from './types'
import { fmtValue, goalStatus, twoDumbbells } from './goals'
import { blockFrom, phaseLine } from './blocks'
import { describeDay, mobilityFrom } from './mobility'
import { clone, fmtExWeight, startOfDay, uid } from './util'
import { catalog, startCatalogProgram } from './programs'
import { describeSwap, swapFromCoach, swapInRoutine } from './swap'

/** null = still checking; false = no coach on this server (or no server). */
export const coachOn = signal<boolean | null>(null)
/** Where the coach runs: your server (Gemini), or Claude when the app is a Claude artifact. */
export const coachMode = signal<'server' | 'claude' | null>(null)

/** The server's coach health (GET /api/coach/status). `reach` says why there's none: no server, not signed in. */
export interface CoachStatus {
  enabled: boolean
  provider?: string
  label?: string
  model?: string | null
  planModel?: string | null
  keyVar?: string
  modelVar?: string
  problem?: string | null
  lastOk?: number | null
  lastError?: { at: number; message: string; status: number; code?: string } | null
  todayCalls?: number
  /** What each reasoning level runs on; prices are list USD per million tokens [input, output, cache read]. */
  levels?: Record<'fast' | 'balanced' | 'deep', { chat: string; plan: string; price: number[] | null; planPrice: number[] | null }>
  /** Whether the provider takes a thinking effort (Claude does). */
  thinking?: boolean
  reach: 'ok' | 'signed-out' | 'no-server'
}

/** One line of the spend ledger (GET /api/coach/spend): list-price dollars, calls and tokens. */
export interface SpendLine {
  name?: string
  cost: number
  calls: number
  input: number
  output: number
  unpriced: number
}
export interface CoachSpend {
  /** 'server' for the admin (everyone's calls), 'mine' for anyone else (only their own). */
  scope?: 'server' | 'mine'
  today: SpendLine
  month: SpendLine
  monthMine: SpendLine
  total: SpendLine
  byModel: SpendLine[]
  byKind: SpendLine[]
  days: { day: string; cost: number; calls: number }[]
  people: number
  error?: string
}

export async function fetchCoachSpend(): Promise<CoachSpend | null> {
  try {
    const res = await fetch('/api/coach/spend', { headers: { authorization: `Bearer ${getToken()}` } })
    return res.ok && (res.headers.get('content-type') || '').includes('json') ? ((await res.json()) as CoachSpend) : null
  } catch {
    return null
  }
}
export interface CoachTest {
  ok: boolean
  provider?: string
  label?: string
  model?: string | null
  ms: number
  reply?: string
  error?: string
  code?: string
}
export const coachStatus = signal<CoachStatus | null>(null)
export const coachTest = signal<CoachTest | null>(null)

let serverChecked = false
export async function checkCoach() {
  let server = false
  try {
    const res = await fetch('/api/coach/status', { headers: { authorization: `Bearer ${getToken()}` } })
    const json = res.ok && (res.headers.get('content-type') || '').includes('json') ? await res.json() : null
    server = !!json?.enabled
    coachStatus.value = json ? { ...json, reach: 'ok' } : { enabled: false, reach: res.status === 401 ? 'signed-out' : 'no-server' }
  } catch {
    server = false
    coachStatus.value = { enabled: false, reach: 'no-server' }
  }
  serverChecked = true
  decide(server)
}

/** Settings → Coach → Test: one tiny real call through the server. */
export async function runCoachTest(): Promise<CoachTest> {
  let out: CoachTest
  try {
    const res = await fetch('/api/coach/test', { method: 'POST', headers: { authorization: `Bearer ${getToken()}` } })
    const json = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {}
    out = res.ok ? json : { ok: false, ms: 0, error: res.status === 401 ? 'Not signed in to your server.' : json.error || `The server answered ${res.status}.` }
  } catch {
    out = { ok: false, ms: 0, error: 'Couldn’t reach your server.' }
  }
  coachTest.value = out
  await checkCoach()
  return out
}

/** Short names for what went wrong, by the server's error kind. */
const KIND: Record<string, string> = {
  key: 'Key rejected',
  model: 'Model not found',
  quota: 'Rate limit reached',
  daily: 'Daily limit reached',
  credits: 'Out of credits',
  network: 'Server can’t reach the API',
  timeout: 'No answer in time',
  overloaded: 'Provider overloaded',
  server: 'Provider error',
}

/** The coach's problem in plain words, or null when it's fine (or runs on Claude in the artifact). */
export function coachProblemText(s: CoachStatus | null = coachStatus.value, mode = coachMode.value): { title: string; detail: string } | null {
  if (mode === 'claude' || !s) return null
  if (s.reach === 'no-server') return { title: 'No coach server', detail: 'This copy of Gloop isn’t connected to your server, so there’s no in-app coach. Questions can be copied to paste into Gemini or Claude.' }
  if (s.reach === 'signed-out') return { title: 'Not signed in', detail: 'Sign in (or enter the sync key) in Settings so the coach can use your server.' }
  if (!s.enabled) return { title: 'Coach not set up', detail: s.problem || 'No API key on the server: set GEMINI_API_KEY in Coolify and redeploy.' }
  const e = s.lastError
  if (e && e.at > (s.lastOk || 0)) {
    const title = s.provider === 'gemini' && (e.code === 'quota' || e.code === 'daily') ? 'Free-tier limit reached' : KIND[e.code || ''] || 'Last call failed'
    return { title, detail: e.message }
  }
  return null
}

function decide(server: boolean) {
  coachMode.value = server ? 'server' : sampleFn.value ? 'claude' : null
  coachOn.value = coachMode.value != null
}

// The Claude runtime answers after load; turn the coach on when it does.
effect(() => {
  if (sampleFn.value && serverChecked && coachMode.peek() !== 'server') decide(false)
})

export const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export const profile = computed<CoachItem>(() => coachItems.value.find((x) => x.kind === 'profile') || { id: 'profile', kind: 'profile', updatedAt: 0 })
export const notes = computed(() => coachItems.value.filter((x) => x.kind === 'note').sort((a, b) => (b.created || 0) - (a.created || 0)))
export const goals = computed(() => coachItems.value.filter((x) => x.kind === 'goal'))
export const commitments = computed(() => coachItems.value.filter((x) => x.kind === 'commitment'))
export const openCommitments = computed(() => commitments.value.filter((c) => (c.status || 'open') === 'open').sort((a, b) => (a.due || 0) - (b.due || 0)))
export const insights = computed(() => coachItems.value.filter((x) => x.kind === 'insight').sort((a, b) => (b.created || 0) - (a.created || 0)))
export const latestWeekly = computed(() => insights.value.find((x) => x.type === 'weekly') || null)

/** Keep the profile's time zone current so the server's weekly review lands on your Sunday evening. */
export async function ensureTz() {
  const p = profile.value
  if (p.tz !== tz()) await saveCoachItem({ ...p, tz: tz() })
}

/** Short JSON calls: pre-workout targets, post-workout takeaway, condensing old chat. */
export async function quick<T>(body: Record<string, unknown>, focusWorkoutId?: string): Promise<T> {
  if (coachMode.value === 'claude') return claudeQuick<T>(body, focusWorkoutId)
  await syncNow() // the server reads memory from its copy; send ours first
  const res = await fetch('/api/coach/quick', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ ...body, level: settings.value.coachLevel, tz: tz(), context: buildCoachContext({ focusWorkoutId }), routines: routinesText() }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'The coach is unavailable right now.')
  void syncNow() // pull anything it saved
  return json as T
}

// ---- proposals ---------------------------------------------------------------------

export interface Proposal {
  id: string
  tool: 'propose_routine_changes' | 'propose_routine_targets' | 'propose_goal' | 'propose_profile_update' | 'propose_training_block' | 'propose_program' | 'propose_mobility_plan' | 'propose_catalog_program' | 'swap_exercise'
  args: Record<string, unknown>
  state?: 'pending' | 'approved' | 'dismissed'
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** A one-line description of what approving will do. */
export function describeProposal(p: Proposal): { title: string; lines: string[] } {
  const a = p.args as Record<string, any>
  if (p.tool === 'propose_routine_targets' || p.tool === 'propose_routine_changes') {
    const list = (x: unknown) => (Array.isArray(x) ? x : [])
    const dose = (c: any) => [c.sets != null ? `${c.sets} sets` : '', c.weight_kg != null ? fmtExWeight(findEx(String(c.exercise || c.to || '')), Number(c.weight_kg)) : '', c.reps != null ? `× ${c.reps}` : ''].filter(Boolean).join(' ')
    const lines = [
      ...list(a.swaps).map((c: any) => `Swap ${c.from} → ${c.to}${dose(c) ? ` (${dose(c)})` : ''}`),
      ...list(a.remove).map((n: any) => `Drop ${n}`),
      ...list(a.changes).map((c: any) => `${c.exercise} ${dose(c)}`.trim()),
      ...(list(a.warmup).length ? [`Warm-up, ${list(a.warmup).length} moves: ${list(a.warmup).join('; ')}`] : []),
      ...(list(a.cooldown).length ? [`Cool-down, ${list(a.cooldown).length} moves: ${list(a.cooldown).join('; ')}`] : []),
    ]
    return { title: `Update “${a.routine}”`, lines }
  }
  if (p.tool === 'swap_exercise') {
    const d = describeSwap(a)
    const where = routines.value.filter((r) => r.exercises.some((e) => norm(exMap.value.get(e.exerciseId)?.name || '') === norm(d.from))).map((r) => r.name)
    return { title: `Swap ${d.from} → ${d.to}`, lines: [where.length ? `In ${where.join(', ')}` : 'Not in any routine yet'] }
  }
  if (p.tool === 'propose_catalog_program') {
    const prog = catalog.find((x) => x.id === String(a.id || ''))
    if (!prog) return { title: `Start program: ${String(a.id || 'unknown')}`, lines: ['This program isn’t in the library on this device. Update the app, then ask again.'] }
    const lines = [
      `${prog.weeks} weeks · ${prog.daysPerWeek} days a week${prog.minutes ? ` · ~${prog.minutes} min` : ''}`,
      ...prog.phases.map((ph) => `${ph.folder}${/week/i.test(ph.folder) ? '' : ` (${ph.weeks} weeks)`}: ${ph.summary || `${ph.days} days a week`}`),
      ...(prog.equipment ? [`Equipment: ${prog.equipment}`] : []),
    ]
    return { title: `Start program: ${prog.name}`, lines }
  }
  if (p.tool === 'propose_program') {
    const list = Array.isArray(a.routines) ? a.routines : []
    const lines = [[a.days_per_week ? `${a.days_per_week} days a week` : '', a.minutes ? `~${a.minutes} min` : ''].filter(Boolean).join(' · ') + (a.summary ? `. ${a.summary}` : '')]
    for (const r of list) {
      const ex = (Array.isArray(r?.exercises) ? r.exercises : []).map((e: any) => `${e.name} ${e.sets}×${e.reps}${e.superset ? ` (${e.superset})` : ''}${e.notes ? ` – ${e.notes}` : ''}`)
      lines.push(`${r?.name}: ${ex.join('; ')}`)
    }
    return { title: `New program: ${String(a.name || 'Program')}`, lines }
  }
  if (p.tool === 'propose_mobility_plan') {
    const m = mobilityFrom(a)
    const lines = [...(m.summary ? [m.summary] : []), ...m.days.map(describeDay)]
    if (!m.days.length) lines.push('No usable days in this plan.')
    return { title: m.scope === 'week' ? 'Mobility this week' : 'Mobility today', lines }
  }
  if (p.tool === 'propose_training_block') {
    const b = blockFrom(a)
    const lines = [`${b.weeks} weeks from ${new Date(b.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${b.summary ? `. ${b.summary}` : ''}`]
    for (const ph of b.phases) lines.push(`Weeks ${ph.from}–${ph.to}: ${phaseLine(ph)}`)
    if (b.deloadWeek) lines.push(`Week ${b.deloadWeek}: easier deload week`)
    for (const k of b.keyLifts || []) lines.push(`${k.exercise}: ${k.progression}`)
    return { title: `Training block: ${String(a.name || 'New block')}`, lines }
  }
  if (p.tool === 'propose_goal') {
    const spec = goalSpecFrom(a)
    const two = spec.metric === 'lift' && (!spec.exercise || /^any/i.test(spec.exercise) || twoDumbbells(findEx(spec.exercise)))
    const v = (n: number) => fmtValue(n, spec, two)
    const lines = [String(a.text || '') + (a.due_date ? ` (by ${a.due_date})` : '')]
    if (spec.target != null && spec.metric !== 'custom') lines.push(`Target: ${v(spec.target)}${spec.reps ? ` × ${spec.reps}` : ''}${spec.exercise ? ` · ${/^any/i.test(spec.exercise) ? 'any two-dumbbell lift' : spec.exercise}` : ''}`)
    for (const m of spec.milestones || []) lines.push(`Milestone: ${m.label || v(m.value)}${m.due ? ` by ${new Date(m.due).toISOString().slice(0, 10)}` : ''}`)
    return { title: a.replaces_goal_id ? 'Update goal' : 'New goal', lines }
  }
  const labels: Record<string, string> = { goals: 'Goals', injuries: 'Injuries and limits', equipment: 'Equipment', schedule: 'Schedule', preferences: 'Preferences', age: 'Age', maxHr: 'Max heart rate' }
  return { title: `Update your profile: ${labels[String(a.field)] || a.field}`, lines: [String(a.value || '')] }
}

/** Apply an approved proposal locally (it syncs from there). Returns a confirmation message. */
export async function applyProposal(p: Proposal): Promise<string> {
  const a = p.args as Record<string, any>
  if (p.tool === 'swap_exercise') {
    // during a workout it applies there (Coach.tsx does it as it arrives); this is the routine version
    const live = swapFromCoach(p.id, a)
    if (live) return live.text
    const d = describeSwap(a)
    const from = matchExercise(d.from, exercises.value as LibExercise[])
    const to = matchExercise(d.to, exercises.value as LibExercise[])
    if (!from || !to) throw new Error(`Couldn’t find ${!from ? d.from : d.to}`)
    const hit = routines.value.filter((r) => r.exercises.some((e) => e.exerciseId === from.id))
    for (const r of hit) await swapInRoutine(r.id, from.id, to.id)
    return hit.length ? `Swapped in ${hit.length} routine${hit.length > 1 ? 's' : ''}` : `${from.name} isn’t in any routine`
  }
  if (p.tool === 'propose_catalog_program') {
    const msg = await startCatalogProgram(String(a.id || ''))
    if (getToken()) void saveSnapshot(true)
    return msg
  }
  if (p.tool === 'propose_program') {
    const name = String(a.name || 'Program').slice(0, 60)
    const plan = { folder: name, routines: (Array.isArray(a.routines) ? a.routines : []).map((r: any) => ({ ...r, exercises: (Array.isArray(r?.exercises) ? r.exercises : []).map((e: any) => ({ ...e, superset: e?.superset ?? undefined })) })) }
    const result = resolvePlan(plan, exercises.value, () => uid())
    for (const e of result.newExercises) await saveExercise({ id: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment, type: e.type as ExType, custom: true, updatedAt: 0 } as Exercise)
    const ids: string[] = []
    for (const r of result.routines) ids.push((await saveRoutine({ ...r, updatedAt: 0 })).id)
    await saveSettings({ program: { name, routineIds: ids, daysPerWeek: Math.max(1, Math.min(7, Math.round(Number(a.days_per_week) || 3))), minutes: Number(a.minutes) || undefined, summary: a.summary ? String(a.summary).slice(0, 400) : undefined, start: startOfDay(new Date()) } })
    if (getToken()) void saveSnapshot(true)
    return `Program “${name}” is set: ${ids.length} routines`
  }
  if (p.tool === 'propose_mobility_plan') {
    const m = mobilityFrom(a)
    if (!m.days.length) throw new Error('This plan has no days from today on')
    for (const old of coachItems.value.filter((x) => x.kind === 'mobility' && (x.status || 'open') === 'open')) await saveCoachItem({ ...old, status: 'done', outcome: 'Replaced by a new plan' })
    await saveCoachItem({ id: uid('mob-'), kind: 'mobility', text: m.scope === 'week' ? 'Mobility this week' : 'Mobility today', status: 'open', created: Date.now(), source: 'coach', updatedAt: 0, mobility: m })
    const sessions = m.days.filter((d) => d.session).length
    return m.scope === 'week' ? `Built into ${m.days.length} days${sessions ? `, ${sessions} with their own session on Train` : ''}` : `Added to today${sessions ? '; start the session from Train' : ''}`
  }
  if (p.tool === 'propose_training_block') {
    // One block at a time: the new one replaces whatever was running.
    for (const old of coachItems.value.filter((x) => x.kind === 'block' && (x.status || 'open') === 'open')) await saveCoachItem({ ...old, status: 'done', outcome: 'Replaced by a new block' })
    await saveCoachItem({ id: uid('block-'), kind: 'block', text: String(a.name || 'Training block').slice(0, 80), status: 'open', created: Date.now(), source: 'coach', updatedAt: 0, block: blockFrom(a) })
    if (getToken()) void saveSnapshot(true)
    return 'Training block started'
  }
  if (p.tool === 'propose_goal') {
    const due = a.due_date ? Date.parse(a.due_date) : NaN
    const old = a.replaces_goal_id ? coachItems.value.find((x) => x.id === a.replaces_goal_id && x.kind === 'goal') : undefined
    const spec = goalSpecFrom(a)
    const base: CoachItem = { id: old?.id || uid('goal-'), kind: 'goal', text: String(a.text || old?.text || ''), due: Number.isFinite(due) ? due : (old?.due ?? null), status: 'open', created: old?.created || Date.now(), source: 'coach', updatedAt: old?.updatedAt || 0, goal: spec }
    // Remember where they started, so progress reads from there.
    if (spec.metric !== 'custom') spec.baseline = old?.goal?.baseline ?? goalStatus({ ...base, goal: { ...spec, baseline: undefined } }).current ?? undefined
    await saveCoachItem(base)
    if (getToken()) void saveSnapshot(true)
    return old ? 'Goal updated' : 'Goal added'
  }
  if (p.tool === 'propose_profile_update') {
    const field = String(a.field)
    if (!['goals', 'injuries', 'equipment', 'schedule', 'preferences', 'age', 'maxHr'].includes(field)) throw new Error('Unknown profile field')
    const value = field === 'age' || field === 'maxHr' ? Number(a.value) || null : String(a.value || '')
    await saveCoachItem({ ...profile.value, [field]: value, tz: tz() })
    return 'Profile updated'
  }
  const r = routines.value.find((x) => norm(x.name) === norm(String(a.routine || ''))) || routines.value.find((x) => norm(x.name).includes(norm(String(a.routine || ''))))
  if (!r) throw new Error(`Couldn’t find the routine “${a.routine}”`)
  const next = clone(r)
  const missed: string[] = []
  const nameOf = (id: string) => norm(exMap.value.get(id)?.name || '_')
  const findIn = (exName: unknown) => {
    const want = norm(String(exName || ''))
    return next.exercises.find((e) => nameOf(e.exerciseId) === want) || next.exercises.find((e) => nameOf(e.exerciseId).includes(want) || want.includes(nameOf(e.exerciseId)))
  }
  const setDose = (we: (typeof next.exercises)[number], c: any) => {
    const sets = Number(c.sets)
    if (Number.isFinite(sets) && sets >= 1 && sets <= 10) {
      while (we.sets.length < sets) we.sets.push({ ...clone(we.sets[we.sets.length - 1] || { kind: 'normal', weight: null, reps: null, seconds: null, done: false }), id: uid('s') })
      we.sets = we.sets.slice(0, sets)
    }
    for (const s of we.sets) {
      if (s.kind === 'warmup') continue
      if (c.weight_kg != null && Number.isFinite(Number(c.weight_kg))) s.weight = Number(c.weight_kg)
      if (c.reps != null && Number.isFinite(Number(c.reps))) s.reps = Math.round(Number(c.reps))
    }
  }
  for (const c of Array.isArray(a.swaps) ? a.swaps : []) {
    const we = findIn(c.from)
    const to = matchExercise(String(c.to || ''), exercises.value as LibExercise[])
    if (!we || !to) {
      missed.push(String(we ? c.to : c.from))
      continue
    }
    we.exerciseId = to.id
    we.notes = ''
    for (const s of we.sets) if (s.kind !== 'warmup') s.weight = null
    if (c.reps != null) we.target = String(c.reps)
    setDose(we, c)
  }
  for (const n of Array.isArray(a.remove) ? a.remove : []) {
    const we = findIn(n)
    if (we) next.exercises = next.exercises.filter((e) => e !== we)
    else missed.push(String(n))
  }
  for (const c of Array.isArray(a.changes) ? a.changes : []) {
    const we = findIn(c.exercise)
    if (!we) {
      missed.push(String(c.exercise))
      continue
    }
    setDose(we, c)
  }
  const lines = (x: unknown) => (Array.isArray(x) ? x.map((t) => String(t).trim()).filter(Boolean).slice(0, 15) : [])
  if (lines(a.warmup).length) next.warmup = lines(a.warmup)
  if (lines(a.cooldown).length) next.cooldown = lines(a.cooldown)
  await saveRoutine(next)
  return missed.length ? `Routine updated (couldn’t match ${missed.join(', ')})` : 'Routine updated'
}

// ---- goals ---------------------------------------------------------------------------

const findEx = (name: string) => {
  const want = norm(name)
  const all = [...exMap.value.values()]
  return all.find((e) => norm(e.name) === want) || all.find((e) => norm(e.name).includes(want))
}

/** A goal spec from propose_goal's arguments, with anything out of range dropped. */
export function goalSpecFrom(a: Record<string, any>): GoalSpec {
  const metrics: GoalSpec['metric'][] = ['lift', 'bodyweight', 'zone2', 'workouts', 'fast', 'custom']
  const metric = metrics.includes(a.metric) ? a.metric : 'custom'
  const n = (x: unknown) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : undefined)
  const spec: GoalSpec = { metric }
  if (metric !== 'custom') spec.target = n(a.target)
  if (metric === 'lift') {
    spec.exercise = a.exercise ? String(a.exercise).slice(0, 80) : 'any'
    spec.reps = Math.min(30, Math.round(n(a.reps) || 1))
    spec.equipmentMax = n(a.equipment_max_kg)
  }
  if (Array.isArray(a.milestones))
    spec.milestones = a.milestones
      .slice(0, 12)
      .map((m: any) => {
        const due = m?.due_date ? Date.parse(m.due_date) : NaN
        return { value: Number(m?.value), due: Number.isFinite(due) ? due : null, label: m?.label ? String(m.label).slice(0, 60) : undefined }
      })
      .filter((m: { value: number }) => Number.isFinite(m.value) && m.value > 0)
  return spec
}

// ---- context snapshot for the server -------------------------------------------------
// The server's Sunday review can't compute goals, estimates or blocks itself, so the app keeps a
// copy of the coach's full training summary there (a coach item that syncs like any other).

const SNAPSHOT_ID = 'snapshot-context'
let lastBuilt = 0
let lastWorkoutSeen = 0
/** Rebuilt at most every 10 minutes (right away after a new workout); written only when it changed. */
export async function saveSnapshot(force = false) {
  const lastWorkout = workouts.value[0]?.end || 0
  if (!force && Date.now() - lastBuilt < 10 * 60000 && lastWorkout === lastWorkoutSeen) return
  lastBuilt = Date.now()
  lastWorkoutSeen = lastWorkout
  const old = coachItems.value.find((x) => x.id === SNAPSHOT_ID)
  const text = buildCoachContext().slice(0, 150000)
  if (old?.text === text) return
  await saveCoachItem({ id: SNAPSHOT_ID, kind: 'snapshot', text, created: Date.now(), source: 'app', updatedAt: old?.updatedAt || 0 })
}
afterServerSync.push(() => saveSnapshot().catch(() => undefined))
