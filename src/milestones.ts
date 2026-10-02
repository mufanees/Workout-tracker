// Milestones earned along the way, each tied to the workout or fast that earned it,
// so celebration screens can show what's new and the home screen can show what's next.
import { computed } from '@preact/signals'
import { fasts, workouts } from './store'
import { HOUR } from './fasting'
import { startOfWeek } from './util'

export interface Milestone {
  key: string
  icon: string
  title: string
  text: string
  ref: string // workout or fast id
  at: number
}

const WORKOUT_COUNTS = [1, 5, 10, 25, 50, 75, 100, 150, 200, 300, 500]
const FAST_COUNTS = [1, 5, 10, 25, 50, 100, 200]
const FAST_LENGTHS = [16, 18, 20, 24, 36, 48]
const WEEK_STREAKS = [2, 4, 8, 12, 26, 52]
const WEEK = 7 * 86400000

export const milestones = computed(() => {
  const out: Milestone[] = []
  const ws = [...workouts.value].sort((a, b) => a.start - b.start)
  const weeks = new Set<number>()
  let streak = 0
  let lastWeek = -Infinity
  ws.forEach((w, i) => {
    const n = i + 1
    if (WORKOUT_COUNTS.includes(n))
      out.push({ key: `w${n}`, icon: 'dumbbell', title: n === 1 ? 'First workout' : `${n} workouts`, text: n === 1 ? 'The hardest one is done.' : `${n} times you showed up.`, ref: w.id, at: w.start })
    const wk = startOfWeek(w.start)
    if (!weeks.has(wk)) {
      weeks.add(wk)
      streak = Math.abs(wk - lastWeek - WEEK) < 2 * 3600000 ? streak + 1 : 1 // DST-tolerant
      lastWeek = wk
      if (WEEK_STREAKS.includes(streak)) out.push({ key: `ws${streak}-${wk}`, icon: 'flame', title: `${streak}-week streak`, text: `${streak} weeks in a row with at least one workout.`, ref: w.id, at: w.start })
    }
  })
  const fs = fasts.value.filter((f) => f.end != null).sort((a, b) => a.end! - b.end!)
  let hits = 0
  let longest = 0
  for (const f of fs) {
    const h = (f.end! - f.start) / HOUR
    if (h >= f.goal) {
      hits++
      if (FAST_COUNTS.includes(hits)) out.push({ key: `f${hits}`, icon: 'fast', title: hits === 1 ? 'First fast at goal' : `${hits} fasts at goal`, text: hits === 1 ? 'You did what you set out to do.' : `${hits} times you hit your fasting goal.`, ref: f.id, at: f.end! })
    }
    for (const t of FAST_LENGTHS) {
      if (h >= t && longest < t) out.push({ key: `fl${t}`, icon: 'zap', title: `First ${t}-hour fast`, text: `Your longest fast yet: past ${t} hours.`, ref: f.id, at: f.end! })
    }
    longest = Math.max(longest, h)
  }
  return out
})

export const milestonesFor = (ref: string) => milestones.value.filter((m) => m.ref === ref)

/** The next workout-count milestone, for a little pull forward. */
export function nextWorkoutMilestone() {
  const n = workouts.value.length
  const next = WORKOUT_COUNTS.find((x) => x > n)
  return next ? { next, left: next - n } : null
}
