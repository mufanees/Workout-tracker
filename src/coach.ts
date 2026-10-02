// Client side of the coach: availability, quick structured calls, and applying approved proposals.
import { signal, computed, effect } from '@preact/signals'
import { sampleFn } from './cloud'
import { claudeQuick } from './coachClaude'
import { getToken, syncNow } from './sync'
import { coachItems, exercises, exMap, routines, saveCoachItem, saveRoutine } from './store'
import { matchExercise, type LibExercise } from '../shared/planImport.mjs'
import { buildCoachContext, routinesText } from './coachContext'
import type { CoachItem } from './types'
import { clone, uid } from './util'

/** null = still checking; false = no coach on this server (or no server). */
export const coachOn = signal<boolean | null>(null)
/** Where the coach runs: your server (Gemini), or Claude when the app is a Claude artifact. */
export const coachMode = signal<'server' | 'claude' | null>(null)

let serverChecked = false
export async function checkCoach() {
  let server = false
  try {
    const res = await fetch('/api/coach/status', { headers: { authorization: `Bearer ${getToken()}` } })
    server = res.ok && (res.headers.get('content-type') || '').includes('json') ? !!(await res.json()).enabled : false
  } catch {
    server = false
  }
  serverChecked = true
  decide(server)
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
    body: JSON.stringify({ ...body, tz: tz(), context: buildCoachContext({ focusWorkoutId }), routines: routinesText() }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'The coach is unavailable right now.')
  void syncNow() // pull anything it saved
  return json as T
}

// ---- proposals ---------------------------------------------------------------------

export interface Proposal {
  id: string
  tool: 'propose_routine_changes' | 'propose_routine_targets' | 'propose_goal' | 'propose_profile_update'
  args: Record<string, unknown>
  state?: 'pending' | 'approved' | 'dismissed'
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** A one-line description of what approving will do. */
export function describeProposal(p: Proposal): { title: string; lines: string[] } {
  const a = p.args as Record<string, any>
  if (p.tool === 'propose_routine_targets' || p.tool === 'propose_routine_changes') {
    const list = (x: unknown) => (Array.isArray(x) ? x : [])
    const dose = (c: any) => [c.sets != null ? `${c.sets} sets` : '', c.weight_kg != null ? `${c.weight_kg} kg` : '', c.reps != null ? `× ${c.reps}` : ''].filter(Boolean).join(' ')
    const lines = [
      ...list(a.swaps).map((c: any) => `Swap ${c.from} → ${c.to}${dose(c) ? ` (${dose(c)})` : ''}`),
      ...list(a.remove).map((n: any) => `Drop ${n}`),
      ...list(a.changes).map((c: any) => `${c.exercise} ${dose(c)}`.trim()),
      ...(list(a.warmup).length ? [`Warm-up, ${list(a.warmup).length} moves: ${list(a.warmup).join('; ')}`] : []),
      ...(list(a.cooldown).length ? [`Cool-down, ${list(a.cooldown).length} moves: ${list(a.cooldown).join('; ')}`] : []),
    ]
    return { title: `Update “${a.routine}”`, lines }
  }
  if (p.tool === 'propose_goal') return { title: 'New goal', lines: [String(a.text || '') + (a.due_date ? ` (by ${a.due_date})` : '')] }
  const labels: Record<string, string> = { goals: 'Goals', injuries: 'Injuries and limits', equipment: 'Equipment', schedule: 'Schedule', preferences: 'Preferences', age: 'Age', maxHr: 'Max heart rate' }
  return { title: `Update your profile: ${labels[String(a.field)] || a.field}`, lines: [String(a.value || '')] }
}

/** Apply an approved proposal locally (it syncs from there). Returns a confirmation message. */
export async function applyProposal(p: Proposal): Promise<string> {
  const a = p.args as Record<string, any>
  if (p.tool === 'propose_goal') {
    const due = a.due_date ? Date.parse(a.due_date) : NaN
    await saveCoachItem({ id: uid('goal-'), kind: 'goal', text: String(a.text || ''), due: Number.isFinite(due) ? due : null, status: 'open', created: Date.now(), source: 'coach', updatedAt: 0 })
    return 'Goal added'
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
