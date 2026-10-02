// Where you are in the Dumbbell Comeback Plan.
import { computed } from '@preact/signals'
import { routines, settings, workouts } from './store'
import { PLAN_PHASES, planRoutineId } from './seed'
import { startOfDay, startOfWeek } from './util'

const DAY = 86400000

export const planStatus = computed(() => {
  const ids = new Set(routines.value.filter((r) => r.id.startsWith('r-comeback-')).map((r) => r.id))
  if (!ids.size) return null
  const done = workouts.value.filter((w) => w.routineId && w.routineId.startsWith('r-comeback-'))
  const last = done[0] // newest first
  const first = done[done.length - 1]
  const today = startOfDay(new Date())
  const start = settings.value.planStart ?? (first ? startOfWeek(first.start) : startOfWeek(Date.now()))
  // Count calendar days (rounding absorbs daylight-saving shifts), then whole weeks.
  const days = Math.round((today - startOfWeek(start)) / DAY)
  const week = Math.max(1, Math.floor(days / 7) + 1)
  const phaseWeek = Math.min(week, 12)
  const phase = PLAN_PHASES.find((p) => phaseWeek >= p.weeks[0] && phaseWeek <= p.weeks[1])!
  const lastDay = last ? (last.routineId!.endsWith('a') ? 'A' : 'B') : null
  const day: 'A' | 'B' = lastDay === 'A' ? 'B' : 'A'
  const routineId = planRoutineId(phase.n, day)
  const routine = routines.value.find((r) => r.id === routineId) || null
  const daysSince = last ? Math.round((today - startOfDay(new Date(last.start))) / DAY) : null

  let status: string
  if (daysSince === 0) status = 'Done for today. Next session the day after tomorrow.'
  else if (daysSince === 1) status = 'Rest day: a 10-minute walk and the warm-up is plenty.'
  else if (daysSince != null && daysSince >= 8) status = `It’s been ${daysSince} days. Repeat your last week at the same weights.`
  else if (!last) status = 'Easy does it. Week 1 should feel light.'
  else status = 'Ready when you are.'

  let setsHint = ''
  if (week === 1) setsHint = 'Week 1: 2 sets per exercise'
  else if (week === 12) setsHint = 'Week 12: test pair 1, then finish as normal'

  return { week, phase, day, routine, status, setsHint, started: !!last, finished: week > 12, restDay: daysSince === 0 || daysSince === 1 }
})
