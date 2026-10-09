// Starting, finishing and timing workouts.
import { planFor } from './timeplan'
import { signal } from '@preact/signals'
import { active, routines, setActive, saveWorkout, saveRoutine, settings, flushActive, exMap, workouts, exercises, updateActive } from './store'
import { lineTick, restEndMark, tickTiming, untickAnchor, untickSet, workoutTiming } from './timing'
import type { Routine, Workout, WExercise, WSet } from './types'
import { uid, clone } from './util'
import { navigate } from './router'
import { confirmDialog } from './ui/overlay'
import { planStatus } from './plan'
import { cancelPush, schedulePush } from './push'
import { quoteOfTheDay } from './ui/Quote'
import { mergeLines, mobilityDay, moveDose } from './mobility'
import { matchExercise, type LibExercise } from '../shared/planImport.mjs'
import type { MobilityDay } from './types'

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
  cancelSetTimer()
  // the coach's mobility add-ons for today join this session only; the routine stays as it is
  const day = mobilityDay()
  const warmup = mergeLines(r.warmup, day?.warmup)
  const cooldown = mergeLines(r.cooldown, day?.cooldown)
  setActive({
    id: uid('w'),
    name: r.name,
    routineId: r.id,
    start: Date.now(),
    end: null,
    notes: '',
    exercises: planSets(r, fromTemplate(r.exercises)),
    warmup,
    cooldown,
    checks: {},
    timePlan: planFor({ ...r, warmup, cooldown, exercises: planSets(r, r.exercises) }),
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
  cancelSetTimer()
  setActive({ id: uid('w'), name: `Zone ${targetZone} Cardio`, routineId: null, start: Date.now(), end: null, notes: '', exercises: [], targetZone, updatedAt: 0 })
  navigate('/live')
}

/** The standalone mobility session from a day of the coach's mobility plan. */
export async function startMobility(day: MobilityDay) {
  if (!day.session || !(await okToReplace())) return
  restTimer.value = null
  cancelSetTimer()
  const lib = exercises.value as LibExercise[]
  const list: WExercise[] = []
  for (const m of day.session.moves) {
    const ex = matchExercise(m.name, lib)
    if (!ex) continue
    const sets = Math.max(1, m.sets || 1)
    list.push({
      id: uid('e'),
      exerciseId: ex.id,
      notes: m.cue || '',
      target: moveDose(m),
      rest: 15,
      superset: null,
      sets: Array.from({ length: sets }, () => ({ id: uid('s'), kind: 'normal' as const, weight: null, reps: null, seconds: null, done: false, tr: m.reps ?? null, ts: m.seconds ?? null })),
    })
  }
  setActive({ id: uid('w'), name: day.session.name, routineId: null, mobility: day.date, start: Date.now(), end: null, notes: '', exercises: list, updatedAt: 0 })
  navigate('/live')
}

export async function startEmpty() {
  if (!(await okToReplace())) return
  restTimer.value = null
  cancelSetTimer()
  setActive({ id: uid('w'), name: `${partOfDay()} Workout`, routineId: null, start: Date.now(), end: null, notes: '', exercises: [], updatedAt: 0 })
  navigate('/live')
}

/** Start again from a past workout: same exercises and set counts, last values as placeholders. */
export async function repeatWorkout(w: Workout) {
  if (!(await okToReplace())) return
  restTimer.value = null
  cancelSetTimer()
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
  cancelSetTimer()
  await flushActive()
}

/** Save the active workout. Unchecked sets are dropped. */
export async function finishActive(name: string, notes: string, extra: Partial<Workout> = {}): Promise<Workout | null> {
  const w = active.value
  if (!w) return null
  const exercises = w.exercises
    .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done).map(({ tw: _tw, tr: _tr, ts: _ts, cw: _cw, cr: _cr, ...s }) => s) }))
    .filter((e) => e.sets.length)
  const { coachPlan: _plan, coachPlanAsked: _asked, mark: _mark, restRun: _restRun, ...rest } = w
  const end = Date.now()
  const timing = workoutTiming({ ...w, end, exercises }) ?? undefined
  const saved = await saveWorkout({ ...rest, ...extra, name: name.trim() || w.name, notes, end, exercises, ...(timing ? { timing } : {}) })
  setActive(null)
  stopRest()
  cancelSetTimer()
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

function beep(notes = [880, 880, 1320]) {
  if (!audio || !settings.value.sound) return
  if (audio.state !== 'running') void audio.resume()
  const t = audio.currentTime
  for (const [i, f] of notes.entries()) {
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
  // a timed set is running: its own end starts the rest, and the two bars never show together
  if (!seconds || setTimer.value) return
  const now = Date.now()
  restTimer.value = { end: now + seconds * 1000, total: seconds, label }
  // on the workout too, so the set after it knows how long you rested (survives a reload)
  updateActive((x) => void (x.restRun = { start: now, plan: seconds, end: now + seconds * 1000 }))
  armRest()
  pushRest()
}

/** The rest ended at `at` (ran out, Skip, −15 to zero, a set timer started): the next set's time starts here. */
function endRestRun(at: number) {
  if (!active.value?.restRun) return
  updateActive((x) => {
    if (!x.restRun) return
    x.mark = restEndMark(x.restRun, at)
    x.restRun = null
  })
}

// ---- Ticks: each one stamps the set's time in the same write ----------------------------

/**
 * Tick a set of the live workout: apply `patch` (values, done) and its timing, and make it the anchor
 * for the next set. `timedFrom`: when its set timer started, for a timed set.
 */
export function logTick(weId: string, setId: string, patch: Partial<WSet>, at = Date.now(), timedFrom: number | null = null) {
  updateActive((x) => {
    const st = x.exercises.find((e) => e.id === weId)?.sets.find((y) => y.id === setId)
    if (!st) return
    const t = tickTiming(x, at, timedFrom)
    Object.assign(st, patch, t.set)
    x.mark = t.mark
    x.restRun = t.restRun
  })
}

/** Untick a set of the live workout: its timing goes with it. */
export function unlogTick(weId: string, setId: string) {
  updateActive((x) => {
    const we = x.exercises.find((e) => e.id === weId)
    const i = we ? we.sets.findIndex((y) => y.id === setId) : -1
    if (!we || i < 0) return
    // unticked right after ticking it: the next tick is timed from where this one was
    const back = untickAnchor(x, we.sets[i])
    if (back) {
      x.mark = back.mark
      x.restRun = back.restRun
    }
    we.sets[i] = untickSet(we.sets[i])
  })
}

/** Tick or untick a warm-up / cool-down line ("w2", "c0"). A tick is the next set's anchor. */
export function logLine(key: string, on: boolean, at = Date.now()) {
  updateActive((x) => {
    x.checks = { ...(x.checks || {}), [key]: on }
    if (!on) return
    x.checkAt = { ...(x.checkAt || {}), [key]: at }
    const t = lineTick(x, at)
    x.mark = t.mark
    x.restRun = t.restRun
  })
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
  if (active.value?.restRun) updateActive((x) => void (x.restRun &&= { ...x.restRun, end }))
  armRest()
  pushRest()
}

export function stopRest() {
  if (restTimer.value) cancelPush('rest')
  restTimer.value = null
  endRestRun(Date.now())
  if (restTick) clearTimeout(restTick)
}

export function armRest() {
  if (restTick) clearTimeout(restTick)
  const r = restTimer.value
  if (!r) return
  restTick = setTimeout(() => {
    if (restTimer.value !== r) return
    restTimer.value = null
    // the scheduled end, not now: a frozen page runs this late
    endRestRun(r.end)
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

// ---- Set timer: timed sets (planks, hangs) and timed warm-up / cool-down lines ------------

/** What a set timer is timing: a duration set of the live workout, or a checklist line ("w2", "c0"). */
export type TimerTarget = { kind: 'set'; weId: string; setId: string } | { kind: 'line'; key: string }

export interface SetTimer {
  label: string // "Side Plank · set 2"
  target: TimerTarget
  secs: number // per side
  sides: 1 | 2
  side: 1 | 2
  phase: 'work' | 'switch' // 'switch': the short break to change sides
  end: number // when the current phase ends (while running)
  left: number | null // ms left in the current phase while paused
  total: number // seconds in the current phase
  started?: number // when it was first started (a timed set's time runs from here at the latest)
}

/** Seconds to change sides between side 1 and side 2. */
export const SWITCH_SECS = 5

function loadSetTimer(): SetTimer | null {
  try {
    const t = JSON.parse(localStorage.getItem('reps-set-timer') || 'null') as SetTimer | null
    return t && t.target && t.secs > 0 ? t : null
  } catch {
    return null
  }
}
export const setTimer = signal<SetTimer | null>(loadSetTimer())
setTimer.subscribe((t) => {
  try {
    if (t) localStorage.setItem('reps-set-timer', JSON.stringify(t))
    else localStorage.removeItem('reps-set-timer')
  } catch {
    /* storage blocked */
  }
})

let timerTick: ReturnType<typeof setTimeout> | null = null
let timerDone: ((t: SetTimer, held: number, at: number) => void) | null = null

/** The live screen says what finishing means (fill the set and tick it, or tick the line). */
export function onSetTimerDone(fn: (t: SetTimer, held: number, at: number) => void) {
  timerDone = fn
}

const vibrate = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p)
  } catch {
    /* no vibration */
  }
}

/** Start timing a set or a line. Stops the rest timer and any other set timer. Call from a tap (audio). */
export function startSetTimer(o: { label: string; target: TimerTarget; secs: number; sides: 1 | 2 }) {
  unlockAudio()
  stopRest()
  const secs = Math.max(1, Math.round(o.secs))
  const now = Date.now()
  setTimer.value = { ...o, secs, side: 1, phase: 'work', end: now + secs * 1000, left: null, total: secs, started: now }
  armSetTimer()
  pushSetTimer()
}

export function pauseSetTimer() {
  const t = setTimer.value
  if (!t || t.left != null) return
  setTimer.value = { ...t, left: Math.max(0, t.end - Date.now()) }
  armSetTimer()
  pushSetTimer()
}

export function resumeSetTimer() {
  const t = setTimer.value
  if (!t || t.left == null) return
  unlockAudio()
  setTimer.value = { ...t, end: Date.now() + t.left, left: null }
  armSetTimer()
  pushSetTimer()
}

/** Throw the timer away without logging anything. */
export function cancelSetTimer() {
  if (timerTick) clearTimeout(timerTick)
  timerTick = null
  if (setTimer.value) {
    setTimer.value = null
    cancelPush('rest')
  }
}

/** Seconds held so far: the full time once side 1 is done, else what's been held on this side. */
export function heldSeconds(t: SetTimer, now = Date.now()): number {
  if (t.phase === 'switch') return t.secs
  const left = t.left ?? Math.max(0, t.end - now)
  return Math.max(0, Math.min(t.secs, Math.round(t.total - left / 1000)))
}

/** Stop now and log the time actually held (marks the set or line done). */
export function finishSetTimer() {
  const t = setTimer.value
  if (!t) return
  const held = heldSeconds(t)
  cancelSetTimer()
  if (held >= 1) timerDone?.(t, held, Date.now())
}

// One push for the very end (the server sends it only if the app didn't beep on screen).
function pushSetTimer() {
  const t = setTimer.value
  if (!t || t.left != null) return cancelPush('rest')
  const rest = t.phase === 'work' && t.side === 1 && t.sides === 2 ? (SWITCH_SECS + t.secs) * 1000 : t.phase === 'switch' ? t.secs * 1000 : 0
  schedulePush('rest', t.end + rest + 2500, 'Time’s up', t.label)
}

/** Move through side 1 → switch → side 2 → done as the clock passes each end. */
function advanceSetTimer() {
  let t = setTimer.value
  if (!t || t.left != null) return
  const now = Date.now()
  let cue: number[] | null = null
  while (now >= t.end) {
    const late = now - t.end > 1500 // restored after a reload: don't play every cue we missed
    if (t.phase === 'work' && t.side === 1 && t.sides === 2) {
      t = { ...t, phase: 'switch', end: t.end + SWITCH_SECS * 1000, total: SWITCH_SECS }
      cue = late ? null : [988]
    } else if (t.phase === 'switch') {
      t = { ...t, phase: 'work', side: 2, end: t.end + t.secs * 1000, total: t.secs }
      cue = late ? null : [880, 1320]
    } else {
      timerTick = null
      setTimer.value = null
      if (!late) {
        beep()
        vibrate([200, 100, 200])
      }
      // on screen and beeped, so the server's notification isn't needed
      if (document.visibilityState === 'visible') cancelPush('rest')
      // it ran out at its scheduled end, even if the page was frozen then
      timerDone?.(t, t.secs, t.end)
      return
    }
  }
  if (cue) {
    beep(cue)
    vibrate(cue.length > 1 ? [120, 80, 120] : 200)
  }
  setTimer.value = t
  armSetTimer()
}

export function armSetTimer() {
  if (timerTick) clearTimeout(timerTick)
  timerTick = null
  const t = setTimer.value
  if (!t || t.left != null) return
  timerTick = setTimeout(advanceSetTimer, Math.max(0, t.end - Date.now()))
}

// A set timer restored after a reload keeps going (or finishes) whichever screen opens first.
if (setTimer.value) armSetTimer()

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
