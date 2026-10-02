// Starting, finishing and timing workouts.
import { signal } from '@preact/signals'
import { active, routines, setActive, saveWorkout, saveRoutine, settings, flushActive, exMap } from './store'
import type { Routine, Workout, WExercise } from './types'
import { uid, clone } from './util'
import { navigate } from './router'
import { confirmDialog } from './ui/overlay'
import { planStatus } from './plan'

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
    updatedAt: 0,
  })
  navigate('/live')
}

/** Week 1 of the Comeback plan is 2 sets per exercise. */
function planSets(r: Routine, exercises: WExercise[]): WExercise[] {
  if (!r.id.startsWith('r-comeback-') || planStatus.value?.week !== 1) return exercises
  return exercises.map((e) => ({ ...e, sets: e.sets.slice(0, 2) }))
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
export async function finishActive(name: string, notes: string): Promise<Workout | null> {
  const w = active.value
  if (!w) return null
  const exercises = w.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done).map(({ tw: _tw, tr: _tr, ts: _ts, ...s }) => s) }))
    .filter((e) => e.sets.length)
  const saved = await saveWorkout({ ...w, name: name.trim() || w.name, notes, end: Date.now(), exercises })
  setActive(null)
  restTimer.value = null
  await flushActive()
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
    else if (we.sets.length > re.sets.length) changes.push(`${name(we.exerciseId)}: ${re.sets.length} → ${we.sets.length} sets`)
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
}

export function adjustRest(delta: number) {
  const r = restTimer.value
  if (!r) return
  const end = r.end + delta * 1000
  if (end <= Date.now()) return stopRest()
  restTimer.value = { ...r, end, total: Math.max(r.total + delta, 1) }
  armRest()
}

export function stopRest() {
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
    if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.controller?.postMessage({ type: 'rest-done', body: `Next up: ${r.label}` })
    }
  }, Math.max(0, r.end - Date.now()))
}

// A rest timer restored after a reload still needs to fire, whichever screen opens first.
if (restTimer.value) armRest()
