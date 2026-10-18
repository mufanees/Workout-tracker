// The coach's changes to the workout in progress (adjust_workout): this session only, the routine stays as it is.
import { active, exercises, exMap, updateActive } from './store'
import { matchExercise, type LibExercise } from '../shared/planImport.mjs'
import { estimate } from './timeplan'
import { newSet, uid } from './util'
import type { WExercise, Workout } from './types'

export interface AdjustArgs {
  reason?: string
  budget_minutes?: number
  swaps?: { from: string; to: string; sets?: number; reps?: string | number; weight_kg?: number }[]
  add?: { name: string; sets: number; reps?: string | number; weight_kg?: number; rest_seconds?: number; superset_with?: string; after?: string }[]
  remove?: string[]
  changes?: { exercise: string; sets?: number; reps?: string | number; weight_kg?: number }[]
}

const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const list = <T,>(x: T[] | undefined): T[] => (Array.isArray(x) ? x : [])
const nameOf = (we: WExercise) => exMap.value.get(we.exerciseId)?.name || 'Exercise'
const count = (n: unknown) => {
  const v = Math.round(Number(n))
  return Number.isFinite(v) && v >= 0 && v <= 10 ? v : null
}
const firstNum = (r: unknown) => {
  const m = String(r ?? '').match(/\d+/)
  return m ? Number(m[0]) : null
}
const repsText = (r: unknown) => String(r ?? '').trim().replace(/(\d)-(\d)/g, '$1–$2')

function find(list: WExercise[], name: unknown) {
  const want = norm(name)
  if (!want) return undefined
  return list.find((e) => norm(nameOf(e)) === want) || list.find((e) => norm(nameOf(e)).includes(want) || want.includes(norm(nameOf(e))))
}

/** Planned weight and reps on the sets not done yet (the grey values you log against). */
function dose(we: WExercise, c: { sets?: number; reps?: string | number; weight_kg?: number }, total: boolean) {
  const done = we.sets.filter((s) => s.done)
  const sets = count(c.sets)
  if (sets != null) {
    const want = Math.max(total ? sets - done.length : sets, 0)
    const left = we.sets.filter((s) => !s.done)
    const kind = left.find((s) => s.kind !== 'warmup')?.kind || 'normal'
    while (left.filter((s) => s.kind !== 'warmup').length < want) left.push({ ...newSet(kind === 'drop' ? 'normal' : kind), tw: left.at(-1)?.tw, tr: left.at(-1)?.tr })
    let extra = left.filter((s) => s.kind !== 'warmup').length - want
    for (let i = left.length - 1; i >= 0 && extra > 0; i--) if (left[i].kind !== 'warmup') (left.splice(i, 1), extra--)
    we.sets = [...done, ...left]
  }
  const reps = firstNum(c.reps)
  if (c.reps != null && String(c.reps).trim()) we.target = repsText(c.reps)
  for (const s of we.sets) {
    if (s.done || s.kind === 'warmup') continue
    if (c.weight_kg != null && Number.isFinite(Number(c.weight_kg))) s.cw = Number(c.weight_kg)
    if (reps != null) s.cr = reps
  }
}

/** Apply the coach's changes to the session in progress. Returns what happened, for a toast. */
export function applyAdjust(a: AdjustArgs): string {
  if (!active.value) throw new Error('No workout in progress')
  const lib = exercises.value as LibExercise[]
  const missed: string[] = []
  let n = 0
  updateActive((w: Workout) => {
    for (const c of list(a.swaps)) {
      const we = find(w.exercises, c.from)
      const to = matchExercise(String(c.to || ''), lib)
      if (!we || !to) {
        missed.push(String(we ? c.to : c.from))
        continue
      }
      if (we.sets.some((s) => s.done)) {
        // Keep what's done under the old exercise; the swap takes the sets that are left.
        const left = we.sets.filter((s) => !s.done)
        we.sets = we.sets.filter((s) => s.done)
        const fresh: WExercise = { ...we, id: uid('e'), exerciseId: to.id, notes: '', sets: left.map((s) => ({ ...s, tw: null, tr: null, cw: null, cr: null })) }
        w.exercises.splice(w.exercises.indexOf(we) + 1, 0, fresh)
        dose(fresh, { sets: c.sets ?? left.length, reps: c.reps, weight_kg: c.weight_kg }, false)
      } else {
        we.exerciseId = to.id
        we.notes = ''
        for (const s of we.sets) (s.tw = null), (s.tr = null), (s.cw = null), (s.cr = null)
        dose(we, { sets: c.sets, reps: c.reps, weight_kg: c.weight_kg }, false)
      }
      n++
    }
    for (const name of list(a.remove)) {
      const we = find(w.exercises, name)
      if (!we) {
        missed.push(String(name))
        continue
      }
      if (we.sets.some((s) => s.done)) we.sets = we.sets.filter((s) => s.done)
      else w.exercises = w.exercises.filter((e) => e !== we)
      n++
    }
    for (const c of list(a.changes)) {
      const we = find(w.exercises, c.exercise)
      if (!we) {
        missed.push(String(c.exercise))
        continue
      }
      dose(we, c, true)
      n++
    }
    for (const c of list(a.add)) {
      const ex = matchExercise(String(c.name || ''), lib)
      if (!ex) {
        missed.push(String(c.name))
        continue
      }
      const pair = find(w.exercises, c.superset_with)
      const after = find(w.exercises, c.after) || pair
      const we: WExercise = { id: uid('e'), exerciseId: ex.id, notes: '', target: '', rest: Math.max(0, Math.round(Number(c.rest_seconds) || pair?.rest || 60)), superset: null, sets: [] }
      if (pair) we.superset = pair.superset || (pair.superset = uid('ss'))
      dose(we, { sets: count(c.sets) || 2, reps: c.reps, weight_kg: c.weight_kg }, false)
      if (after) {
        // after a superset partner, the new one joins the end of that group
        let i = w.exercises.indexOf(after)
        while (pair && w.exercises[i + 1]?.superset === after.superset && after.superset) i++
        w.exercises.splice(i + 1, 0, we)
      } else w.exercises.push(we)
      n++
    }
    // Drop exercises left with no sets at all.
    w.exercises = w.exercises.filter((e) => e.sets.length)
    const budget = Math.round(Number(a.budget_minutes))
    if (w.timePlan || (Number.isFinite(budget) && budget > 0)) {
      const est = estimate(w)
      const minutes = Number.isFinite(budget) && budget > 0 ? budget : w.timePlan!.budget
      w.timePlan = { ...est, budget: minutes, fixed: Number.isFinite(budget) && budget > 0 ? true : !!w.timePlan?.fixed }
      if (Number.isFinite(budget) && budget > 0) n++
    }
  })
  if (!n) throw new Error(missed.length ? `Couldn’t match ${missed.join(', ')}` : 'Nothing to change')
  return missed.length ? `Workout updated (couldn’t match ${missed.join(', ')})` : 'Workout updated'
}

/** Lines for the proposal card. */
export function describeAdjust(a: AdjustArgs): string[] {
  const d = (c: { sets?: number; reps?: string | number; weight_kg?: number }) =>
    [c.sets != null ? `${c.sets} sets` : '', c.reps != null && String(c.reps).trim() ? `× ${repsText(c.reps)}` : '', c.weight_kg != null ? `@ ${c.weight_kg} kg` : ''].filter(Boolean).join(' ')
  return [
    ...(a.budget_minutes ? [`Session length: ${a.budget_minutes} min`] : []),
    ...list(a.swaps).map((c) => `Swap ${c.from} → ${c.to}${d(c) ? ` (${d(c)})` : ''}`),
    ...list(a.add).map((c) => `Add ${c.name}${d(c) ? ` ${d(c)}` : ''}${c.superset_with ? `, paired with ${c.superset_with}` : ''}`),
    ...list(a.remove).map((x) => `Drop ${x}`),
    ...list(a.changes).map((c) => `${c.exercise}: ${d(c)}`),
  ]
}
