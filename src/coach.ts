// Client side of the coach: availability, quick structured calls, and applying approved proposals.
import { signal, computed } from '@preact/signals'
import { getToken, syncNow } from './sync'
import { coachItems, exMap, routines, saveCoachItem, saveRoutine } from './store'
import { buildCoachContext, routinesText } from './coachContext'
import type { CoachItem } from './types'
import { clone, uid } from './util'

/** null = still checking; false = no coach on this server (or no server). */
export const coachOn = signal<boolean | null>(null)

export async function checkCoach() {
  try {
    const res = await fetch('/api/coach/status', { headers: { authorization: `Bearer ${getToken()}` } })
    coachOn.value = res.ok && (res.headers.get('content-type') || '').includes('json') ? !!(await res.json()).enabled : false
  } catch {
    coachOn.value = false
  }
}

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
  tool: 'propose_routine_targets' | 'propose_goal' | 'propose_profile_update'
  args: Record<string, unknown>
  state?: 'pending' | 'approved' | 'dismissed'
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** A one-line description of what approving will do. */
export function describeProposal(p: Proposal): { title: string; lines: string[] } {
  const a = p.args as Record<string, any>
  if (p.tool === 'propose_routine_targets') {
    const changes = Array.isArray(a.changes) ? a.changes : []
    return {
      title: `Update “${a.routine}”`,
      lines: changes.map((c: any) => [c.exercise, c.sets != null ? `${c.sets} sets` : '', c.weight_kg != null ? `${c.weight_kg} kg` : '', c.reps != null ? `× ${c.reps}` : ''].filter(Boolean).join(' ')),
    }
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
  for (const c of Array.isArray(a.changes) ? a.changes : []) {
    const want = norm(String(c.exercise || ''))
    const we = next.exercises.find((e) => norm(exMap.value.get(e.exerciseId)?.name || '') === want) || next.exercises.find((e) => norm(exMap.value.get(e.exerciseId)?.name || '').includes(want) || want.includes(norm(exMap.value.get(e.exerciseId)?.name || '_')))
    if (!we) {
      missed.push(String(c.exercise))
      continue
    }
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
  await saveRoutine(next)
  return missed.length ? `Routine updated (couldn’t match ${missed.join(', ')})` : 'Routine updated'
}
