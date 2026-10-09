// How long a workout should take, and how you're tracking against it.
// Estimates come from the plan itself: warm-up and cool-down lines ("Cat–cow × 8",
// "Child's pose · 30 s / side"), sets × work time, rest between sets and superset rounds.
// A routine can also carry a fixed time budget that overrides the estimate.
// Once workouts have been timed (shared/timing.mjs), each exercise's measured seconds per set and
// your usual rest overrun replace the guesses ("from your pace").
import type { Routine, WExercise, Workout } from './types'
import { exMap } from './store'
import { pace6w } from './timing'

export interface TimePlan {
  budget: number // minutes you have (the routine's budget, or the estimate)
  warmup: number // estimated minutes
  main: number
  cooldown: number
  fixed: boolean // true when the routine has its own budget
  paced?: boolean // sets and rests come from your measured pace
}

/** Measured sets needed before an exercise's own pace replaces the guess. */
const MIN_PACE_SETS = 2

/** Your measured seconds per set for an exercise (start delay included), if there's enough data. */
function pacedSet(exerciseId: string): number | null {
  const p = pace6w.value.byEx.get(exerciseId)
  return p && p.sets >= MIN_PACE_SETS ? p.avg : null
}

/** How much longer (or shorter) than planned you usually rest, in seconds; 0 without data. */
function restOverrun(): number {
  const r = pace6w.value.rest
  return r && r.n >= 3 ? r.overrun : 0
}

const TRANSITION = 10 // seconds between checklist moves
const SET_REST_FALLBACK = 60

/** Seconds one warm-up / cool-down line takes. */
export function lineSeconds(line: string): number {
  const l = line.toLowerCase().replace(/https?:\/\/\S+/g, '') // a video link isn't a dose
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

/** Seconds of work for one set: your measured pace, else a guess from the reps. */
function setWork(we: WExercise, i: number): number {
  const measured = pacedSet(we.exerciseId)
  if (measured != null) return measured
  const ex = exMap.value.get(we.exerciseId)
  const s = we.sets[i]
  if (ex?.type === 'duration') return (s.seconds || 40) + 5
  const top = Number((we.target || '').match(/(\d+)\s*$/)?.[1]) || s.reps || 10
  return Math.min(90, top * 3.5 + 8)
}

/** Seconds for the strength part: sets, rest between sets / rounds, moving between exercises. */
function mainSeconds(exercises: WExercise[]): { secs: number; paced: boolean } {
  let total = 0
  let paced = false
  const over = restOverrun()
  const seen = new Set<string>()
  const groups: WExercise[][] = []
  for (const we of exercises) {
    if (we.superset && seen.has(we.superset)) continue
    if (we.superset) seen.add(we.superset)
    groups.push(we.superset ? exercises.filter((e) => e.superset === we.superset) : [we])
  }
  groups.forEach((group, gi) => {
    const rounds = Math.max(...group.map((e) => e.sets.length))
    const planned = Math.max(...group.map((e) => e.rest || 0))
    const rest = Math.max(0, (planned || SET_REST_FALLBACK) + (planned ? over : 0))
    // measured set times already hold the walk to the next exercise and the start delay
    const measured = group.every((e) => pacedSet(e.exerciseId) != null)
    if (measured) paced = true
    for (let r = 0; r < rounds; r++) {
      for (const e of group) if (r < e.sets.length) total += setWork(e, r) + (group.length > 1 && !measured ? 10 : 0)
      if (r < rounds - 1) total += rest
    }
    // the move to the next exercise: the rest that runs after the last round when measured, else a guess
    if (measured) total += gi < groups.length - 1 && planned ? rest : 0
    else total += 45
  })
  return { secs: total, paced }
}

export function estimate(src: Pick<Routine, 'exercises' | 'warmup' | 'cooldown'>): Omit<TimePlan, 'budget' | 'fixed'> {
  const min = (s: number) => Math.round(s / 60)
  const main = mainSeconds(src.exercises)
  return {
    warmup: min((src.warmup || []).reduce((a, l) => a + lineSeconds(l), 0)),
    main: min(main.secs),
    cooldown: min((src.cooldown || []).reduce((a, l) => a + lineSeconds(l), 0)),
    ...(main.paced ? { paced: true } : {}),
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
