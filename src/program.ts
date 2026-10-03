// The active coach-built program: which routine is next in the rotation and how the week is going.
import { computed } from '@preact/signals'
import { routines, settings, workouts } from './store'
import { startOfDay, startOfWeek } from './util'

const DAY = 86400000

export const programStatus = computed(() => {
  const p = settings.value.program
  if (!p || !p.routineIds?.length) return null
  const list = p.routineIds.map((id) => routines.value.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r)
  if (!list.length) return null
  const ids = new Set(list.map((r) => r.id))
  const done = workouts.value.filter((w) => w.routineId && ids.has(w.routineId) && w.start >= p.start - DAY)
  const last = done[0] // newest first
  // Next in the rotation after the last one you did; missed days just continue it.
  const lastIdx = last ? list.findIndex((r) => r.id === last.routineId) : -1
  const routine = list[(lastIdx + 1) % list.length]
  const today = startOfDay(new Date())
  const week = Math.max(1, Math.floor((startOfWeek(Date.now()) - startOfWeek(p.start)) / (7 * DAY)) + 1)
  const thisWeek = workouts.value.filter((w) => w.start >= startOfWeek(Date.now()) && w.exercises.length).length
  const daysSince = last ? Math.round((today - startOfDay(new Date(last.start))) / DAY) : null
  const target = p.daysPerWeek || 3
  let status: string
  if (daysSince === 0) status = 'Done for today. Nice work.'
  else if (thisWeek >= target) status = `All ${target} sessions done this week. Rest, walk, or zone 2.`
  else if (daysSince === 1 && target <= 3) status = 'Rest day is ideal today, but go if today is the time you have.'
  else if (daysSince != null && daysSince >= 8) status = `It’s been ${daysSince} days. Pick up where you left off, a little lighter.`
  else if (!last) status = 'First session of the new program. Find your working weights.'
  else status = 'Ready when you are.'
  return {
    program: p,
    routines: list,
    routine,
    week,
    thisWeek,
    target,
    status,
    restDay: daysSince === 0 || thisWeek >= target,
  }
})

/** For the coach. */
export function programText(): string {
  const s = programStatus.value
  if (!s) return 'None: they follow the built-in Dumbbell Comeback plan (see Program line at the top). Propose one with propose_program when a restructure would serve them better.'
  const p = s.program
  return [
    `"${p.name}" — ${s.target} days a week${p.minutes ? `, ~${p.minutes} min` : ''}, started ${new Date(p.start).toISOString().slice(0, 10)} (week ${s.week}).${p.summary ? ` ${p.summary}` : ''}`,
    `Rotation: ${s.routines.map((r) => r.name).join(' → ')}. Next: ${s.routine.name}. Sessions this week: ${s.thisWeek} of ${s.target}.`,
    'This program replaces the Comeback plan on the Train screen; the routines are listed under ROUTINES.',
  ].join('\n')
}
