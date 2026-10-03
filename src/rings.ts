// Daily rings: Fast (hours toward your plan), Move (minutes of any workout toward a daily goal)
// and Zone 2 (minutes this week toward the weekly goal). Showing up at all earns the day.
import { active, fasts, settings, workouts } from './store'
import { DAY, HOUR, fastsByDay } from './fasting'
import { activityOf } from './activity'
import { summarizeHR } from './hr'
import type { Workout } from './types'
import { startOfDay, startOfWeek } from './util'

export const MOVE_GOALS = [15, 20, 30, 45, 60]
export const moveGoal = () => settings.value.moveGoal || 30

const minutesOf = (w: Pick<Workout, 'start' | 'end'>, now: number) => Math.max(0, ((w.end ?? now) - w.start) / 60000)

export interface DayRings {
  day: number
  fastMs: number
  fastGoalMs: number
  fastLive: boolean
  moveMin: number
  moveGoal: number
  showedUp: boolean
  workouts: Workout[]
}

/** Ring values for each of the given day starts. */
export function ringsFor(days: number[], now = Date.now()): DayRings[] {
  const fd = fastsByDay(fasts.value, now)
  const today = startOfDay(new Date(now))
  const goalMin = moveGoal()
  const byDay = new Map<number, Workout[]>()
  for (const w of workouts.value) {
    const d = startOfDay(new Date(w.start))
    byDay.set(d, [...(byDay.get(d) || []), w])
  }
  return days.map((day) => {
    const ws = byDay.get(day) || []
    let moveMin = ws.reduce((a, w) => a + minutesOf(w, now), 0)
    const live = day === today && active.value ? active.value : null
    if (live) moveMin += minutesOf(live, now)
    const f = fd.get(day)
    const fastGoal = f ? Math.max(...f.list.map((x) => x.goal)) : settings.value.fastGoal
    return {
      day,
      fastMs: f?.ms || 0,
      fastGoalMs: fastGoal * HOUR,
      fastLive: !!f?.live,
      moveMin,
      moveGoal: goalMin,
      showedUp: ws.length > 0 || !!live,
      workouts: ws,
    }
  })
}

/** Zone 2 minutes in the week starting at `weekStart`. */
export function zone2Minutes(weekStart = startOfWeek(Date.now())) {
  let min = 0
  for (const w of workouts.value) {
    if (w.start < weekStart) break // newest first
    if (w.start >= weekStart + 7 * DAY) continue
    const s = summarizeHR(w.hr)
    if (s) min += s.zoneSeconds[1] / 60
  }
  return min
}

/** All cardio minutes in the week (whole sessions, whatever the heart rate). Zone 2 is the part
 *  of any workout's heart rate spent in zone 2, so it's a slice of this, never taken away from it. */
export function cardioMinutes(weekStart = startOfWeek(Date.now())) {
  let min = 0
  for (const w of workouts.value) {
    if (w.start < weekStart) break // newest first
    if (w.start >= weekStart + 7 * DAY || !w.end || activityOf(w).kind !== 'cardio') continue
    min += (w.end - w.start) / 60000
  }
  return min
}

/** Monday to Sunday of the current week. */
export function thisWeekDays(now = Date.now()) {
  const ws = startOfWeek(now)
  return Array.from({ length: 7 }, (_, i) => startOfDay(new Date(ws + i * DAY + DAY / 2)))
}

/** One encouraging line for the home screen, based on where you are today. */
export function nudge(today: DayRings, week: DayRings[], now = Date.now()): string {
  const showed = week.filter((d) => d.showedUp && d.day <= today.day).length
  const moveDone = today.moveMin >= today.moveGoal
  if (today.showedUp && moveDone) return showed > 1 ? `Move ring closed. ${showed} days showing up this week.` : 'Move ring closed. That’s how it starts.'
  if (today.showedUp) return `You showed up today. That counts.${showed > 1 ? ` ${showed} days this week.` : ''}`
  const hour = new Date(now).getHours()
  if (showed === 0) return hour < 18 ? 'Fresh week. Ten minutes today gets it moving.' : 'Even ten minutes tonight starts the week.'
  return `${showed} day${showed > 1 ? 's' : ''} this week. Ten minutes today still counts.`
}
