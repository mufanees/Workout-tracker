// Builds a compact plain-text summary of your training for the AI coach (or to paste into Claude).
import { bodyModel } from './bodyModel'
import { weightModelText } from './weightModel'
import { goalsText } from './goals'
import { blockText } from './blocks'
import { dayKey } from './fasting'
import { planFor } from './timeplan'
import { bodyWeights, dayNotes, exMap, fasts, readings, routines, settings, workouts } from './store'
import { prIndex, sessionsByExercise, stalledAt } from './stats'
import { planStatus } from './plan'
import { programStatus, programText } from './program'
import { summarizeHR, zoneRange } from './hr'
import { counts, e1rm, phaseMinutes, startOfWeek } from './util'
import type { Workout, WSet } from './types'

const DAY = 86400000
const date = (t: number) => new Date(t).toISOString().slice(0, 10)
const r1 = (n: number) => Math.round(n * 10) / 10

function fmtSet(s: WSet, type: string) {
  const tag = s.kind === 'warmup' ? 'W ' : s.kind === 'failure' ? 'F ' : s.kind === 'drop' ? 'D ' : ''
  if (type === 'duration') return `${tag}${s.seconds ?? '?'}s`
  const rir = s.rir != null ? ` @RIR${s.rir === 1.5 ? '1-2' : s.rir >= 3 ? '3+' : s.rir}` : ''
  if (s.weight == null) return `${tag}${s.reps ?? '?'}${rir}`
  return `${tag}${r1(s.weight)}×${s.reps ?? '?'}${rir}`
}

export function workoutLine(w: Workout) {
  const mins = w.end ? Math.round((w.end - w.start) / 60000) : '?'
  const hr = summarizeHR(w.hr)
  const bits = [`${date(w.start)} ${w.name} (${mins} min`]
  if (hr) bits.push(`, HR avg ${hr.avg} max ${hr.max}, Z2 ${Math.round(hr.zoneSeconds[1] / 60)} min`)
  if (w.shoulder != null) bits.push(`, shoulder ${w.shoulder}/10`)
  const prs = prIndex.value.byWorkout.get(w.id)
  if (prs) bits.push(`, ${prs} PR set${prs > 1 ? 's' : ''}`)
  bits.push(')')
  const lines = [bits.join('')]
  for (const e of w.exercises) {
    const ex = exMap.value.get(e.exerciseId)
    lines.push(`  ${ex?.name || e.exerciseId}${e.target ? ` [target ${e.target}]` : ''}: ${e.sets.map((s) => fmtSet(s, ex?.type || 'weight_reps')).join(', ')}${e.notes ? ` (note: ${e.notes})` : ''}`)
  }
  if (w.notes) lines.push(`  Session notes: ${w.notes}`)
  const ph = phaseMinutes(w)
  const tp = w.timePlan
  if (tp || ph.warmup != null || ph.cooldown != null)
    lines.push(
      `  Time: took ${mins} min${tp ? ` vs ${tp.fixed ? 'a budget of' : 'an estimated'} ${tp.budget} min (plan: warm-up ${tp.warmup}, sets ${tp.main}, cool-down ${tp.cooldown})` : ''}; actual warm-up ${ph.warmup ?? '?'} min, cool-down ${ph.cooldown ?? '?'} min`,
    )
  const fb = w.feedback
  if (fb) {
    const felt: string[] = []
    if (fb.length) felt.push(`session felt ${fb.length === 'long' ? 'too long' : fb.length === 'short' ? 'too short' : 'about right'}`)
    if (fb.warmup === 'long') felt.push('warm-up took too long')
    if (fb.cooldown === 'long') felt.push('cool-down took too long')
    for (const [id, v] of Object.entries(fb.ex || {})) {
      if (v === 'right') continue
      const we = w.exercises.find((e) => e.id === id)
      const name = (we && exMap.value.get(we.exerciseId)?.name) || 'an exercise'
      felt.push(`${name} ${v === 'pain' ? 'HURT' : `felt too ${v}`}`)
    }
    if (felt.length) lines.push(`  Athlete feedback: ${felt.join('; ')}`)
    if (fb.note) lines.push(`  Athlete said: ${fb.note}`)
  }
  return lines.join('\n')
}

export function buildCoachContext(opts: { focusWorkoutId?: string } = {}): string {
  const st = settings.value
  const now = Date.now()
  const out: string[] = []
  out.push(`Today: ${date(now)} (${new Date().toLocaleDateString('en-GB', { weekday: 'long' })}). Weights in kg (dumbbell exercises: weight of one dumbbell). Display unit: ${st.unit}.`)

  const p = planStatus.value
  if (programStatus.value) out.push(`PROGRAM (coach-built, active)\n${programText()}`)
  else if (p) out.push(`Program: 12-week Dumbbell Comeback plan (every other day, A/B alternating, superset pairs, shoulder-friendly). Currently week ${Math.min(p.week, 12)} of 12, Phase ${p.phase.n} ${p.phase.name} (${p.phase.note}). Next session: Workout ${p.day}. ${p.status}`)
  out.push(`Heart rate zones (bpm): ${[1, 2, 3, 4, 5].map((z) => `Z${z} ${zoneRange(z)}`).join(', ')}. Weekly zone 2 goal: ${st.zone2Goal} min.`)

  out.push(`\nGOALS (computed by the app from their logs)\n${goalsText()}`)
  out.push(`\nTRAINING BLOCK\n${blockText()}`)

  const list = workouts.value
  const focus = opts.focusWorkoutId ? list.find((w) => w.id === opts.focusWorkoutId) : null
  if (focus) out.push(`\nWORKOUT TO REVIEW\n${workoutLine(focus)}`)

  // Weekly overview, last 8 weeks
  const thisWeek = startOfWeek(now)
  const weeks: string[] = []
  for (let i = 7; i >= 0; i--) {
    const ws = thisWeek - i * 7 * DAY
    const inWeek = list.filter((w) => w.start >= ws && w.start < ws + 7 * DAY)
    let vol = 0
    let sets = 0
    let z2 = 0
    for (const w of inWeek) {
      for (const e of w.exercises) for (const s of e.sets) if (counts(s)) (sets++, (vol += (s.weight || 0) * (s.reps || 0)))
      const hr = summarizeHR(w.hr)
      if (hr) z2 += hr.zoneSeconds[1] / 60
    }
    weeks.push(`${date(ws)}: ${inWeek.length} workouts, ${sets} working sets, volume ${Math.round(vol)} kg, Z2 ${Math.round(z2)} min`)
  }
  out.push(`\nWEEKLY TOTALS (week starting Monday)\n${weeks.join('\n')}`)

  const recent = list.filter((w) => w.start > now - 28 * DAY && w.id !== focus?.id)
  out.push(`\nWORKOUTS, LAST 4 WEEKS (newest first)\n${recent.map(workoutLine).join('\n') || 'none'}`)

  // Per-exercise progression for everything trained in the last 6 weeks
  const prog: string[] = []
  for (const [id, sessions] of sessionsByExercise.value) {
    if (!sessions.length || sessions[0].workout.start < now - 42 * DAY) continue
    const ex = exMap.value.get(id)
    if (!ex) continue
    const pts = sessions
      .slice(0, 10)
      .reverse()
      .map((s) => {
        const work = s.sets.filter(counts)
        if (ex.type === 'duration') return `${date(s.workout.start).slice(5)} ${Math.max(0, ...work.map((x) => x.seconds || 0))}s`
        const top = work.reduce<WSet | null>((b, x) => (!b || (x.weight || 0) > (b.weight || 0) || ((x.weight || 0) === (b.weight || 0) && (x.reps || 0) > (b.reps || 0)) ? x : b), null)
        if (!top) return ''
        const est = top.weight && top.reps ? ` e1RM ${r1(e1rm(top.weight, top.reps))}` : ''
        return `${date(s.workout.start).slice(5)} ${fmtSet(top, ex.type)}${est}`
      })
      .filter(Boolean)
    const stall = ex.type === 'weight_reps' ? stalledAt(id) : null
    prog.push(`${ex.name} (${ex.equipment}): ${pts.join(' | ')}${stall ? `  ← same ${stall} kg for 3 sessions without more reps` : ''}`)
  }
  out.push(`\nPROGRESSION (top set per session, oldest → newest)\n${prog.join('\n') || 'none yet'}`)

  const rd = readings.value.filter((r) => r.date > now - 30 * DAY)
  if (rd.length) out.push(`\nMORNING READINGS, LAST 30 DAYS\n${rd.map((r) => `${date(r.date)} resting ${r.rhr} bpm${r.hrv ? `, HRV ${r.hrv} ms` : ''}`).join('\n')}`)

  const sh = list.filter((w) => w.shoulder != null && w.start > now - 42 * DAY)
  if (sh.length) out.push(`\nSHOULDER STIFFNESS AFTER WORKOUTS (0-10)\n${sh.map((w) => `${date(w.start)} ${w.shoulder}`).join(', ')}`)

  const bw = bodyWeights.value.filter((b) => b.date > now - 60 * DAY)
  if (bw.length) out.push(`\nBODY WEIGHT, LAST 60 DAYS (kg)\n${bw.map((b) => `${date(b.date)} ${b.kg}`).join(', ')}`)
  if (bodyWeights.value.length) out.push(`\nWEIGHT MODEL (Kalman trend; talk about the trend and the rate, not single weigh-ins)\n${weightModelText(bodyModel.value)}`)

  const fs = fasts.value.filter((f) => f.start > now - 21 * DAY)
  if (fs.length) out.push(`\nFASTS, LAST 3 WEEKS\n${fs.map((f) => `${date(f.start)} ${f.end ? r1((f.end - f.start) / 3600000) + ' h' : 'in progress'} (goal ${f.goal} h)${f.note ? ` “${f.note}”` : ''}`).join(', ')}`)

  const dn = [...dayNotes.value.values()].filter((d) => d.id >= dayKey(now - 21 * DAY)).sort((a, b) => a.id.localeCompare(b.id))
  const withText = dn.filter((d) => d.text.trim())
  if (withText.length) out.push(`\nDAY NOTES, LAST 3 WEEKS\n${withText.map((d) => `${d.id}: ${d.text.slice(0, 300)}`).join('\n')}`)
  const ci = dn.filter((d) => d.id >= dayKey(now - 14 * DAY) && (d.sleep || d.energy || d.stress))
  if (ci.length) out.push(`\nDAILY CHECK-IN, LAST 14 DAYS (sleep poor/ok/good, energy low/ok/high, stress high/some/low)\n${ci.map((d) => `${d.id}: ${checkinWords(d)}`).join('\n')}`)
  else out.push('\nDAILY CHECK-IN: none in the last 14 days.')
  if (settings.value.weightGoal != null) out.push(`\nTarget body weight: ${settings.value.weightGoal} kg`)

  out.push(`\nROUTINES\n${routinesText()}`)
  out.push(`\nTotal workouts logged: ${list.length}${list[0] ? `; last on ${date(list[0].start)}` : ''}.`)
  return out.join('\n')
}

/** Routines with exercises and set targets, as the coach's list_routines tool returns them.
 * Sent from the app because built-in routines only reach the server once edited. */
export function routinesText() {
  const name = (id: string) => exMap.value.get(id)?.name || 'Unknown exercise'
  return routines.value
    .map((r) => {
      const ex = r.exercises.map((e) => {
        const s = e.sets.filter((x) => x.kind !== 'warmup')
        const w = s.find((x) => x.weight != null)?.weight
        const reps = s.find((x) => x.reps != null)?.reps
        return `${name(e.exerciseId)} ${s.length}×${e.target || reps || ''}${w != null ? ` @ ${w} kg` : ''}`
      })
      const extra = [r.warmup?.length ? `\n    warm-up: ${r.warmup.join('; ')}` : '', r.cooldown?.length ? `\n    cool-down: ${r.cooldown.join('; ')}` : ''].join('')
      const tp = planFor(r)
      return `${r.folder ? r.folder + ' / ' : ''}${r.name} (~${tp.budget} min${tp.fixed ? ' budget' : ' estimated'}): ${ex.join(', ')}${extra}`
    })
    .join('\n')
}

/** For pasting into Gemini or Claude when the in-app coach isn't set up. */
export function coachPasteText(question: string) {
  return `You're my personal trainer. Here's my training data from my workout app. ${question}\n\n${buildCoachContext()}`
}

/** "sleep good, energy low, stress some" */
export function checkinWords(d: { sleep?: number | null; energy?: number | null; stress?: number | null }) {
  const w = (v: number | null | undefined, words: string[]) => (v ? words[v - 1] : null)
  return [w(d.sleep, ['poor', 'ok', 'good']) && `sleep ${w(d.sleep, ['poor', 'ok', 'good'])}`, w(d.energy, ['low', 'ok', 'high']) && `energy ${w(d.energy, ['low', 'ok', 'high'])}`, w(d.stress, ['high', 'some', 'low']) && `stress ${w(d.stress, ['high', 'some', 'low'])}`].filter(Boolean).join(', ')
}
