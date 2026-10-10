// How long a workout should take, and how you're tracking against it.
// Estimates come from the plan itself: warm-up and cool-down lines ("Cat–cow × 8",
// "Child's pose · 30 s / side"), sets × work time, rest between sets and superset rounds.
// A routine can also carry a fixed time budget that overrides the estimate.
// Once workouts have been timed (shared/timing.mjs), each exercise's measured seconds per set and
// your usual rest overrun replace the guesses ("from your pace").
import type { Routine, Workout } from './types'
import { exMap, settings } from './store'
import { pace6w } from './timing'
import { clone, fmtExWeight } from './util'
import { matchPrevious, previousSets } from './stats'
import { budgetOf, estimateParts, fitToBudget as fitCore, lineSeconds, totalOf, type Budget, type BudgetCtx, type FitResult } from '../shared/budget.mjs'

export { lineSeconds, totalOf }
export type { Budget }

export interface TimePlan {
  budget: number // minutes you have: the routine's own budget, else Settings → Time budget
  warmup: number // estimated minutes
  main: number
  cooldown: number
  fixed: boolean // a hard budget (always, since every workout is planned to one)
  paced?: boolean // sets and rests come from your measured pace
}

/** Measured sets needed before an exercise's own pace replaces the guess. */
const MIN_PACE_SETS = 2

/** Your time budget (Settings → Training), defaults 25 min with 5 warm-up and 5 cool-down. */
export function timeBudget(): Budget {
  return budgetOf(settings.value.timeBudget)
}

/** The budget a routine is planned to: its own minutes if set, else yours (warm-up / cool-down from yours). */
export function budgetFor(src: { budget?: number | null }): Budget {
  const b = timeBudget()
  return src.budget && src.budget > 0 ? { ...b, total: src.budget } : b
}

/** What the estimate and the fitter know: exercise names and kinds, and your measured pace. */
export function paceCtx(): BudgetCtx {
  const p = pace6w.value
  const r = p.rest
  return {
    info: (id) => exMap.value.get(id),
    setSecs: (id) => {
      const e = p.byEx.get(id)
      return e && e.sets >= MIN_PACE_SETS ? e.avg : null
    },
    restOverrun: r && r.n >= 3 ? r.overrun : 0,
    fmtWeight: (id, kg) => fmtExWeight(exMap.value.get(id), kg),
  }
}

export function estimate(src: Pick<Routine, 'exercises' | 'warmup' | 'cooldown'>): Omit<TimePlan, 'budget' | 'fixed'> {
  return estimateParts(src, paceCtx())
}

export function planFor(src: Pick<Routine, 'exercises' | 'warmup' | 'cooldown'> & { budget?: number | null }): TimePlan {
  return { ...estimate(src), budget: budgetFor(src).total, fixed: true }
}

/**
 * A time-boxed version of a routine (or a workout's exercises): same exercises where possible, with heavier
 * sets of fewer reps, supersets, shorter rests and 2-set accessories until it fits; drops isolation and
 * core before any compound. See shared/budget.mjs. `pace` defaults to your measured pace.
 */
export function fitToBudget<R extends Pick<Routine, 'exercises' | 'warmup' | 'cooldown'>>(routine: R, budgetMin?: number | Budget, pace: BudgetCtx = paceCtx()): FitResult<R> {
  const b = budgetMin == null ? budgetFor(routine as { budget?: number | null }) : typeof budgetMin === 'number' ? { ...timeBudget(), total: budgetMin } : budgetMin
  return fitCore(routine, b, pace)
}

/**
 * Fit a live workout. Its grey numbers come from last time, so the heavier, fewer-rep sets are worked out
 * from those and set as today's targets (cw / cr, like the coach's), leaving the routine's plan alone.
 */
export function fitWorkout(w: Workout, budgetMin: number) {
  const input = clone(w.exercises)
  for (const we of input) {
    const m = matchPrevious(we.sets, previousSets(we.exerciseId, w.id))
    we.sets.forEach((s, i) => {
      const p = m[i]
      if (s.cw != null) s.tw = s.cw
      else if (p?.weight != null) s.tw = p.weight
      if (s.cr != null) s.tr = s.cr
      else if (p?.reps != null) s.tr = p.reps
    })
  }
  const seen = clone(input)
  const fit = fitToBudget({ exercises: input, warmup: w.warmup, cooldown: w.cooldown }, budgetMin)
  const before = new Map(seen.flatMap((we) => we.sets.map((s) => [s.id, s] as const)))
  const orig = new Map(w.exercises.flatMap((we) => we.sets.map((s) => [s.id, s] as const)))
  for (const we of fit.routine.exercises) {
    for (const s of we.sets) {
      const b = before.get(s.id)
      const o = orig.get(s.id)
      if (!b || !o) continue
      if (s.tw !== b.tw) s.cw = s.tw
      if (s.tr !== b.tr) s.cr = s.tr
      s.tw = o.tw
      s.tr = o.tr
    }
  }
  return fit
}

// Starting a routine that's over its budget: the live coach's start line offers "Fit it" (src/liveCoach.ts
// calls fitWorkout), so there's one nudge and one estimate on the workout screen.

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
