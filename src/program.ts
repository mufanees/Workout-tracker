// The active coach-built program: which routine is next in the rotation and how the week is going.
import { computed } from '@preact/signals'
import { routines, saveSettings, saveWorkout, settings, workouts } from './store'
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
  if (!s) return 'None: see the Program line at the top. Propose one with propose_program when it would serve them better.'
  const p = s.program
  return [
    `"${p.name}" — ${s.target} days a week${p.minutes ? `, ~${p.minutes} min` : ''}, started ${new Date(p.start).toISOString().slice(0, 10)} (week ${s.week}).${p.summary ? ` ${p.summary}` : ''}`,
    `Rotation (day id in brackets): ${s.routines.map((r) => `${r.name} [${r.id}]`).join(' → ')}. Next: ${s.routine.name}. Sessions this week: ${s.thisWeek} of ${s.target}.`,
    'This program replaces the Comeback plan on the Train screen; the routines are listed under ROUTINES.',
  ].join('\n')
}

/**
 * One-time repair for programs adjusted before routines kept their ids: those adjustments made
 * new routines and moved the start to that day, so the workouts before it pointed at the old
 * copies. Point workouts since 4 weeks before the start at the program day of the same name
 * and move the start back to the first of them. Runs once per program (relinked is set after).
 */
export async function relinkProgram() {
  const p = settings.value.program
  if (!p || p.relinked || !p.routineIds?.length) return
  const list = p.routineIds.map((id) => routines.value.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r)
  const byName = new Map(list.map((r) => [r.name.trim().toLowerCase(), r.id]))
  const ids = new Set(p.routineIds)
  let start = p.start
  for (const w of workouts.value) {
    if (!w.routineId || ids.has(w.routineId) || w.start < p.start - 28 * DAY) continue
    const old = routines.value.find((r) => r.id === w.routineId)
    const id = old && byName.get(old.name.trim().toLowerCase())
    if (!id) continue
    await saveWorkout({ ...w, routineId: id })
    start = Math.min(start, startOfDay(new Date(w.start)))
  }
  await saveSettings({ program: { ...p, start, relinked: true } })
}
