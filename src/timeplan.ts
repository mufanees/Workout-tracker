// How long a workout should take, and how you're tracking against it.
// Estimates come from the plan itself: warm-up and cool-down lines ("Cat–cow × 8",
// "Child's pose · 30 s / side"), sets × work time, rest between sets and superset rounds.
// A routine can also carry a fixed time budget that overrides the estimate.
import type { Routine, WExercise, Workout } from './types'
import { exMap } from './store'

export interface TimePlan {
  budget: number // minutes you have (the routine's budget, or the estimate)
  warmup: number // estimated minutes
  main: number
  cooldown: number
  fixed: boolean // true when the routine has its own budget
}

const TRANSITION = 10 // seconds between checklist moves
const SET_REST_FALLBACK = 60

/** Seconds one warm-up / cool-down line takes. */
export function lineSeconds(line: string): number {
  const l = line.toLowerCase()
  const sides = /\/\s*side|each side|per side/.test(l) ? 2 : 1
  if (/ramp-?up/.test(l)) return 75
  const secs = l.match(/(\d+)\s*(s|sec|seconds?)\b/)
  if (secs) return Number(secs[1]) * sides + TRANSITION
  const mins = l.match(/(\d+)\s*min/)
  if (mins) return Number(mins[1]) * 60 * sides + TRANSITION
  const reps = l.match(/[×x]\s*(\d+)/)
  const parts = l.includes('+') ? l.split('+').length : 1 // "Glute bridge + bodyweight squat × 10 each"
  if (reps) return Math.max(20, Number(reps[1]) * 3 * sides * parts) + TRANSITION
  return 45
}

/** Seconds of work for one set. */
function setWork(we: WExercise, i: number): number {
  const ex = exMap.value.get(we.exerciseId)
  const s = we.sets[i]
  if (ex?.type === 'duration') return (s.seconds || 40) + 5
  const top = Number((we.target || '').match(/(\d+)\s*$/)?.[1]) || s.reps || 10
  return Math.min(90, top * 3.5 + 8)
}

/** Seconds for the strength part: sets, rest between sets / rounds, moving between exercises. */
function mainSeconds(exercises: WExercise[]): number {
  let total = 0
  const seen = new Set<string>()
  for (const we of exercises) {
    if (we.superset && seen.has(we.superset)) continue
    const group = we.superset ? exercises.filter((e) => e.superset === we.superset) : [we]
    if (we.superset) seen.add(we.superset)
    const rounds = Math.max(...group.map((e) => e.sets.length))
    const rest = Math.max(...group.map((e) => e.rest || 0)) || SET_REST_FALLBACK
    for (let r = 0; r < rounds; r++) {
      for (const e of group) if (r < e.sets.length) total += setWork(e, r) + (group.length > 1 ? 10 : 0)
      if (r < rounds - 1) total += rest
    }
    total += 45 // set up the next exercise
  }
  return total
}

export function estimate(src: Pick<Routine, 'exercises' | 'warmup' | 'cooldown'>): Omit<TimePlan, 'budget' | 'fixed'> {
  const min = (s: number) => Math.round(s / 60)
  return {
    warmup: min((src.warmup || []).reduce((a, l) => a + lineSeconds(l), 0)),
    main: min(mainSeconds(src.exercises)),
    cooldown: min((src.cooldown || []).reduce((a, l) => a + lineSeconds(l), 0)),
  }
}

export function planFor(src: Pick<Routine, 'exercises' | 'warmup' | 'cooldown'> & { budget?: number | null }): TimePlan {
  const e = estimate(src)
  const total = e.warmup + e.main + e.cooldown
  return { ...e, budget: src.budget && src.budget > 0 ? src.budget : total, fixed: !!(src.budget && src.budget > 0) }
}

/**
 * Pace during a workout: how many minutes ahead (negative) or behind (positive) you are,
 * comparing time spent with the estimated time of what's done so far.
 */
export function pace(w: Workout, now = Date.now()): { behind: number; expected: number } | null {
  if (!w.timePlan) return null
  const warm = w.warmup || []
  const cool = w.cooldown || []
  const checks = w.checks || {}
  let expected = 0
  warm.forEach((l, i) => checks['w' + i] && (expected += lineSeconds(l)))
  cool.forEach((l, i) => checks['c' + i] && (expected += lineSeconds(l)))
  const doneSets = w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)
  const allSets = w.exercises.reduce((a, e) => a + e.sets.length, 0)
  if (allSets) expected += (doneSets / allSets) * w.timePlan.main * 60
  if (!expected) return null
  const elapsed = (now - w.start) / 1000
  // scale to the budget when it's tighter or looser than the estimate
  const est = w.timePlan.warmup + w.timePlan.main + w.timePlan.cooldown
  const scale = est > 0 ? w.timePlan.budget / est : 1
  return { behind: Math.round((elapsed - expected * scale) / 60), expected: Math.round((expected * scale) / 60) }
}

/** Planned vs actual for a finished workout, in minutes. */
export function overrun(w: Workout): { planned: number; actual: number; diff: number } | null {
  if (!w.timePlan || !w.end) return null
  const actual = Math.max(1, Math.round((w.end - w.start) / 60000))
  return { planned: w.timePlan.budget, actual, diff: actual - w.timePlan.budget }
}
