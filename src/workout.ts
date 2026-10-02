// Starting, finishing and timing workouts.
import { signal } from '@preact/signals'
import { active, routines, setActive, saveWorkout, saveRoutine, settings, flushActive, exMap, workouts } from './store'
import type { Routine, Workout, WExercise } from './types'
import { uid, clone } from './util'
import { navigate } from './router'
import { confirmDialog } from './ui/overlay'
import { planStatus } from './plan'
import { cancelPush, schedulePush } from './push'
import { quoteOfTheDay } from './ui/Quote'

export function partOfDay(t = Date.now()) {
  const h = new Date(t).getHours()
  if (h < 5) return 'Night'
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  if (h < 21) return 'Evening'
  return 'Night'
}

async function okToReplace(): Promise<boolean> {
  if (!active.value) return true
  return confirmDialog({
    title: 'Workout in progress',
    message: `“${active.value.name}” is still running. Discard it and start a new one?`,
    confirm: 'Discard & start',
    cancel: 'Keep it',
    danger: true,
  })
}

function fromTemplate(exercises: WExercise[]): WExercise[] {
  return exercises.map((e) => ({
    ...clone(e),
    id: uid('e'),
    sets: e.sets.map((s) => ({
      id: uid('s'),
      kind: s.kind,
      weight: null,
      reps: null,
      seconds: null,
      done: false,
      tw: s.weight,
      tr: s.reps,
      ts: s.seconds,
    })),
  }))
}

export async function startRoutine(r: Routine) {
  if (!(await okToReplace())) return
  restTimer.value = null
  setActive({
    id: uid('w'),
    name: r.name,
    routineId: r.id,
    start: Date.now(),
    end: null,
    notes: '',
    exercises: planSets(r, fromTemplate(r.exercises)),
    warmup: r.warmup?.length ? [...r.warmup] : undefined,
    cooldown: r.cooldown?.length ? [...r.cooldown] : undefined,
    checks: {},
    updatedAt: 0,
  })
  navigate('/live')
}

/** Week 1 of the Comeback plan is 2 sets per exercise. */
function planSets(r: Routine, exercises: WExercise[]): WExercise[] {
  if (!r.id.startsWith('r-comeback-') || planStatus.value?.week !== 1) return exercises
  return exercises.map((e) => ({ ...e, sets: e.sets.slice(0, 2) }))
}

/** A heart-rate-led session that holds a target zone (zone 2 by default). */
export async function startCardio(targetZone = 2) {
  if (!(await okToReplace())) return
  restTimer.value = null
  setActive({ id: uid('w'), name: `Zone ${targetZone} Cardio`, routineId: null, start: Date.now(), end: null, notes: '', exercises: [], targetZone, updatedAt: 0 })
  navigate('/live')
}

export async function startEmpty() {
  if (!(await okToReplace())) return
  restTimer.value = null
  setActive({ id: uid('w'), name: `${partOfDay()} Workout`, routineId: null, start: Date.now(), end: null, notes: '', exercises: [], updatedAt: 0 })
  navigate('/live')
}

/** Start again from a past workout: same exercises and set counts, last values as placeholders. */
export async function repeatWorkout(w: Workout) {
  if (!(await okToReplace())) return
  restTimer.value = null
  setActive({
    id: uid('w'),
    name: w.name,
    routineId: w.routineId,
    start: Date.now(),
    end: null,
    notes: '',
    exercises: fromTemplate(
      w.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length),
    ),
    updatedAt: 0,
  })
  navigate('/live')
}

export async function discardActive() {
  setActive(null)
  restTimer.value = null
  await flushActive()
}

/** Save the active workout. Unchecked sets are dropped. */
export async function finishActive(name: string, notes: string, extra: Partial<Workout> = {}): Promise<Workout | null> {
  const w = active.value
  if (!w) return null
  const exercises = w.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done).map(({ tw: _tw, tr: _tr, ts: _ts, cw: _cw, cr: _cr, ...s }) => s) }))
    .filter((e) => e.sets.length)
  const { coachPlan: _plan, coachPlanAsked: _asked, ...rest } = w
  const saved = await saveWorkout({ ...rest, ...extra, name: name.trim() || w.name, notes, end: Date.now(), exercises })
  setActive(null)
  stopRest()
  await flushActive()
  scheduleTrainingReminder()
  return saved
}

/**
 * Did the workout add anything to its routine (new exercises or extra sets)?
 * Skipped exercises and sets are ignored: skipping something once shouldn't shrink the plan.
 */
export function routineDiff(w: Workout): { routine: Routine; changes: string[] } | null {
  const r = routines.value.find((x) => x.id === w.routineId)
  if (!r) return null
  const changes: string[] = []
  const name = (id: string) => exMap.value.get(id)?.name || 'exercise'
  for (const we of w.exercises) {
    const re = r.exercises.find((e) => e.exerciseId === we.exerciseId)
    if (!re) changes.push(`Add ${name(we.exerciseId)}`)
    else if (we.sets.length > re.sets.length) changes.push(`${name(we.exerciseId)}: ${re.sets.length} to ${we.sets.length} sets`)
  }
  return changes.length ? { routine: r, changes } : null
}

/** Add the workout's new exercises and extra sets to the routine. Nothing is removed. */
export async function updateRoutineFrom(r: Routine, w: Workout) {
  const exercises: WExercise[] = clone(r.exercises)
  let insertAt = 0
  for (const we of w.exercises) {
    const idx = exercises.findIndex((e) => e.exerciseId === we.exerciseId)
    if (idx >= 0) {
      const re = exercises[idx]
      for (let i = re.sets.length; i < we.sets.length; i++) {
        const s = we.sets[i]
        re.sets.push({ id: uid('s'), kind: s.kind, weight: null, reps: null, seconds: null, done: false })
      }
      insertAt = idx + 1
    } else {
      exercises.splice(insertAt, 0, {
        id: uid('e'),
        exerciseId: we.exerciseId,
        notes: we.notes,
        target: we.target,
        rest: we.rest,
        superset: null,
        sets: we.sets.map((s) => ({ id: uid('s'), kind: s.kind, weight: null, reps: null, seconds: null, done: false })),
      })
      insertAt++
    }
  }
  await saveRoutine({ ...r, exercises })
}

// ---- Rest timer -------------------------------------------------------------

type Rest = { end: number; total: number; label: string }
function loadRest(): Rest | null {
  try {
    const r = JSON.parse(localStorage.getItem('reps-rest') || 'null') as Rest | null
    return r && r.end > Date.now() ? r : null
  } catch {
    return null
  }
}
export const restTimer = signal<Rest | null>(loadRest())
restTimer.subscribe((r) => {
  try {
    if (r) localStorage.setItem('reps-rest', JSON.stringify(r))
    else localStorage.removeItem('reps-rest')
  } catch {
    /* storage blocked */
  }
})
let restTick: ReturnType<typeof setTimeout> | null = null
let audio: AudioContext | null = null

/** Must be called from a user gesture so iOS lets us play the end-of-rest sound. */
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audio ||= new AC()
    // iOS reports 'interrupted' after the phone locks, not just 'suspended'.
    if (audio.state !== 'running') void audio.resume()
  } catch {
    /* no audio */
  }
}

function beep() {
  if (!audio || !settings.value.sound) return
  if (audio.state !== 'running') void audio.resume()
  const t = audio.currentTime
  for (const [i, f] of [880, 880, 1320].entries()) {
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.type = 'sine'
    o.frequency.value = f
    const s = t + i * 0.22
    g.gain.setValueAtTime(0.0001, s)
    g.gain.exponentialRampToValueAtTime(0.35, s + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18)
    o.connect(g).connect(audio.destination)
    o.start(s)
    o.stop(s + 0.2)
  }
}

export function startRest(seconds: number, label: string) {
  if (!seconds) return
  restTimer.value = { end: Date.now() + seconds * 1000, total: seconds, label }
  armRest()
  pushRest()
}

// The server sends "rest is over" a moment after the end, so it only shows if the app didn't beep itself.
function pushRest() {
  const r = restTimer.value
  if (r) schedulePush('rest', r.end + 2500, 'Rest is over', `Next: ${r.label}`)
  else cancelPush('rest')
}

export function adjustRest(delta: number) {
  const r = restTimer.value
  if (!r) return
  const end = r.end + delta * 1000
  if (end <= Date.now()) return stopRest()
  restTimer.value = { ...r, end, total: Math.max(r.total + delta, 1) }
  armRest()
  pushRest()
}

export function stopRest() {
  if (restTimer.value) cancelPush('rest')
  restTimer.value = null
  if (restTick) clearTimeout(restTick)
}

export function armRest() {
  if (restTick) clearTimeout(restTick)
  const r = restTimer.value
  if (!r) return
  restTick = setTimeout(() => {
    if (restTimer.value !== r) return
    restTimer.value = null
    beep()
    try {
      navigator.vibrate?.([200, 100, 200])
    } catch {
      /* no vibration */
    }
    // We're on screen and already beeped, so the server's notification isn't needed.
    if (document.visibilityState === 'visible') cancelPush('rest')
  }, Math.max(0, r.end - Date.now()))
}

// A rest timer restored after a reload still needs to fire, whichever screen opens first.
if (restTimer.value) armRest()

// ---- training-day reminder ---------------------------------------------------------

/** Schedule the next "training day" notification (every other day on the plan, else daily). */
export function scheduleTrainingReminder() {
  const time = settings.value.reminderTime
  if (!time) return cancelPush('train')
  const [h, m] = time.split(':').map(Number)
  const p = planStatus.value
  const now = new Date()
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
  const lastPlan = p?.started ? workouts.value.find((w) => w.routineId?.startsWith('r-comeback-')) : null
  if (lastPlan) {
    const last = new Date(lastPlan.start)
    const nextDay = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 2, h, m)
    if (nextDay > at) at.setTime(nextDay.getTime())
  }
  while (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1)
  const q = quoteOfTheDay(at.getDate())
  const quote = q && settings.value.showQuotes ? ` “${q.text}”` : ''
  const body = (p?.routine ? `${p.routine.name} is up next.` : 'Time to train.') + quote
  schedulePush('train', at.getTime(), 'Training day', body)
}
