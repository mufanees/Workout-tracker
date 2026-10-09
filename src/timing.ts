// Measured time per set, rest and workout (pure core in shared/timing.mjs, shared with the server).
import { computed } from '@preact/signals'
import { workouts } from './store'
import { paceStats } from '../shared/timing.mjs'

export { exerciseTimes, fmtSecs, lineTick, MAX_SET_SECS, paceStats, restEndMark, settle, tickTiming, untickAnchor, untickSet, workoutTiming } from '../shared/timing.mjs'
export type { ExerciseTime, PaceStats, TimingSummary } from '../shared/timing.mjs'

const DAY = 86400000
/** How far back "your pace" looks. */
export const PACE_DAYS = 42

/** Your pace over the last six weeks: seconds per set by exercise, rest overrun, idle per workout. */
export const pace6w = computed(() => {
  const s = paceStats(workouts.value, Date.now() - PACE_DAYS * DAY)
  return { ...s, byEx: new Map(s.exercises.map((e) => [e.exerciseId, e])) }
})
