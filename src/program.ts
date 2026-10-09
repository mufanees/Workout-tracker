// The active program: which routine is next in the rotation and how the week is going.
// Two kinds: a coach-built rotation (routineIds), or a phased program from the library, where each
// phase is one folder of the program run for a number of weeks.
import { computed } from '@preact/signals'
import { routines, settings, workouts } from './store'
import type { Routine } from './types'
import { startOfDay, startOfWeek } from './util'

const DAY = 86400000

/** The routines of a program's folder, in order. */
export function phaseRoutines(program: string, folder: string): Routine[] {
  return routines.value.filter((r) => (r.program || '') === program && r.folder === folder).sort((a, b) => a.order - b.order)
}

export const programStatus = computed(() => {
  const p = settings.value.program
  if (!p) return null
  const weeksIn = Math.max(1, Math.round((startOfWeek(Date.now()) - startOfWeek(p.start)) / (7 * DAY)) + 1)
  let list: Routine[]
  let phase: { n: number; of: number; folder: string; weeks: number; fromWeek: number; toWeek: number } | null = null
  let totalWeeks: number | null = null
  let days = p.daysPerWeek || 3
  if (p.phases?.length) {
    totalWeeks = p.phases.reduce((n, ph) => n + ph.weeks, 0)
    let from = 1
    let k = p.phases.length - 1
    for (let i = 0; i < p.phases.length; i++) {
      if (weeksIn < from + p.phases[i].weeks) {
        k = i
        break
      }
      if (i < p.phases.length - 1) from += p.phases[i].weeks
    }
    const ph = p.phases[k]
    phase = { n: k + 1, of: p.phases.length, folder: ph.folder, weeks: ph.weeks, fromWeek: from, toWeek: from + ph.weeks - 1 }
    days = ph.days || days
    list = phaseRoutines(p.name, ph.folder)
  } else {
    list = (p.routineIds || []).map((id) => routines.value.find((r) => r.id === id)).filter((r): r is Routine => !!r)
  }
  if (!list.length) return null
  const all = p.phases?.length ? new Set(routines.value.filter((r) => r.program === p.name).map((r) => r.id)) : new Set(list.map((r) => r.id))
  const done = workouts.value.filter((w) => w.routineId && all.has(w.routineId) && w.start >= p.start - DAY)
  const last = done[0] // newest first
  // Next in the rotation after the last one you did in this phase; missed days just continue it.
  const lastIdx = last ? list.findIndex((r) => r.id === last.routineId) : -1
  const routine = list[(lastIdx + 1) % list.length]
  const today = startOfDay(new Date())
  const thisWeek = workouts.value.filter((w) => w.start >= startOfWeek(Date.now()) && w.exercises.length).length
  const daysSince = last ? Math.round((today - startOfDay(new Date(last.start))) / DAY) : null
  const finished = totalWeeks != null && weeksIn > totalWeeks
  const target = days
  let status: string
  if (daysSince === 0) status = 'Done for today. Nice work.'
  else if (thisWeek >= target) status = `All ${target} sessions done this week. Rest, walk, or zone 2.`
  else if (finished) status = `You’ve finished all ${totalWeeks} weeks. Keep running the last phase or start again.`
  else if (daysSince === 1 && target <= 3) status = 'Rest day is ideal today, but go if today is the time you have.'
  else if (daysSince != null && daysSince >= 8) status = `It’s been ${daysSince} days. Pick up where you left off, a little lighter.`
  else if (phase && phase.n > 1 && weeksIn === phase.fromWeek && !done.some((w) => list.some((r) => r.id === w.routineId))) status = `New phase: ${phase.folder}. Find your working weights.`
  else if (!last) status = 'First session of the new program. Find your working weights.'
  else status = 'Ready when you are.'
  return {
    program: p,
    routines: list,
    routine,
    week: weeksIn,
    totalWeeks,
    phase,
    thisWeek,
    target,
    status,
    finished,
    restDay: daysSince === 0 || thisWeek >= target,
  }
})

/** For the coach. */
export function programText(): string {
  const s = programStatus.value
  if (!s) return 'None: they follow the built-in Dumbbell Comeback plan if its routines are on Train (see Program line at the top). Offer a library program (PROGRAM LIBRARY) or propose one with propose_program when a restructure would serve them better.'
  const p = s.program
  return [
    `"${p.name}" — ${s.target} days a week${p.minutes ? `, ~${p.minutes} min` : ''}, started ${new Date(p.start).toISOString().slice(0, 10)} (week ${s.week}${s.totalWeeks ? ` of ${s.totalWeeks}` : ''}).${p.summary ? ` ${p.summary}` : ''}`,
    ...(s.phase ? [`Phase ${s.phase.n} of ${s.phase.of}: ${s.phase.folder}, weeks ${s.phase.fromWeek}–${s.phase.toWeek}. Later phases: ${(p.phases || []).slice(s.phase.n).map((ph) => ph.folder).join(', ') || 'none'}.`] : []),
    `Rotation now: ${s.routines.map((r) => r.name).join(' → ')}. Next: ${s.routine.name}. Sessions this week: ${s.thisWeek} of ${s.target}.`,
    'This program replaces the Comeback plan on the Train screen; the routines are listed under ROUTINES.',
  ].join('\n')
}
