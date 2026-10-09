// Cardio sessions: an activity on one clock, warm-up → main → cool-down stretches. No exercises, no
// per-exercise timers. The quick start remembers your activity, zone and minutes in Settings.cardio.
import { active, saveSettings, setActive, settings, updateActive } from './store'
import type { CardioPrefs, CardioSession, Workout } from './types'
import { cancelSetTimer, discardActive, finishActive, restTimer } from './workout'
import { navigate } from './router'
import { confirmDialog } from './ui/overlay'
import { haptic, uid } from './util'
import { pushLiveHR, summarizeHR, type HRSummary } from './hr'

export const ACTIVITIES = ['Elliptical', 'Treadmill walk', 'Run', 'Bike', 'Rower', 'Stair climber', 'Swim']

// Short and gentle: about 5 minutes, the muscles each activity loads most.
const S = {
  calf: 'Standing calf stretch · 30 s / side',
  ham: 'Standing hamstring stretch · 30 s / side',
  hip: 'Kneeling hip flexor stretch · 30 s / side',
  quad: 'Standing quad stretch · 30 s / side',
  chest: 'Doorway chest stretch · 30 s / side',
  glute: 'Figure-four glute stretch · 30 s / side',
  child: 'Child’s pose · 45 s',
  shoulder: 'Cross-body shoulder stretch · 30 s / side',
  tri: 'Overhead triceps stretch · 30 s / side',
}

/** Cool-down stretches that suit an activity (editable; these are only the starting point). */
export function defaultStretches(activity: string): string[] {
  switch (activity) {
    case 'Elliptical':
      return [S.calf, S.ham, S.hip, S.quad, S.chest]
    case 'Treadmill walk':
    case 'Stair climber':
      return [S.calf, S.ham, S.hip, S.quad, S.glute]
    case 'Run':
      return [S.calf, S.ham, S.hip, S.quad, S.glute]
    case 'Bike':
      return [S.hip, S.quad, S.ham, S.glute, S.child]
    case 'Rower':
      return [S.ham, S.glute, S.child, S.chest, S.shoulder]
    case 'Swim':
      return [S.chest, S.shoulder, S.tri, S.child, S.calf]
    default:
      return [S.calf, S.ham, S.hip, S.quad, S.child]
  }
}

const clampMin = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(60, Math.round(v))) : d)

/** Your saved cardio quick start, with defaults filled in. activity '' = never chosen. */
export function cardioPrefs(): CardioPrefs {
  const c = (settings.value.cardio || {}) as Partial<CardioPrefs>
  const target = c.target === null ? null : typeof c.target === 'number' && c.target >= 1 && c.target <= 5 ? c.target : 2
  const stretches = Array.isArray(c.stretches) ? c.stretches.filter((x) => typeof x === 'string' && x.trim()) : undefined
  return {
    activity: typeof c.activity === 'string' ? c.activity : '',
    target,
    warmupMin: clampMin(c.warmupMin, 5),
    cooldownMin: clampMin(c.cooldownMin, 5),
    stretches: stretches?.length ? stretches : undefined,
  }
}

export const stretchesFor = (p: Pick<CardioPrefs, 'activity' | 'stretches'>) => (p.stretches?.length ? p.stretches : defaultStretches(p.activity))

export async function saveCardioPrefs(p: CardioPrefs) {
  await saveSettings({ cardio: { ...p, stretches: p.stretches?.length ? p.stretches : undefined } })
}

/** "Elliptical · Zone 2", or just "Run" for free cardio. */
export const sessionName = (activity: string, target: number | null) => (target ? `${activity || 'Cardio'} · Zone ${target}` : activity || 'Cardio')

/** Start a cardio session from your saved choices (or the ones just picked). */
export async function startCardioSession(p: CardioPrefs = cardioPrefs()) {
  if (active.value) {
    const ok = await confirmDialog({
      title: 'Workout in progress',
      message: `“${active.value.name}” is still running. Discard it and start a new one?`,
      confirm: 'Discard & start',
      cancel: 'Keep it',
      danger: true,
    })
    if (!ok) return
  }
  restTimer.value = null
  cancelSetTimer()
  const now = Date.now()
  const activity = p.activity || 'Cardio'
  const stretches = stretchesFor(p)
  setActive({
    id: uid('w'),
    name: sessionName(activity, p.target),
    routineId: null,
    start: now,
    end: null,
    notes: '',
    exercises: [],
    targetZone: p.target,
    cardio: { activity, warmupMin: p.warmupMin, cooldownMin: p.cooldownMin, mainStart: p.warmupMin ? null : now, cooldownStart: null, stretches },
    // the stretches are the workout's cool-down too, so feedback and timing see them
    cooldown: stretches,
    checks: {},
    updatedAt: 0,
  })
  navigate('/live')
}

// ---- phases --------------------------------------------------------------------------

export type CardioPhase = 'warmup' | 'main' | 'cooldown'
export const PHASE_NAMES: Record<CardioPhase, string> = { warmup: 'Warm-up', main: 'Main', cooldown: 'Cool-down' }

/** Where a cardio session is now; null for any other workout. */
export function cardioPhase(w: Pick<Workout, 'start' | 'cardio'>, now = Date.now()): CardioPhase | null {
  const c = w.cardio
  if (!c) return null
  if (c.cooldownStart) return 'cooldown'
  if (c.mainStart || now >= w.start + c.warmupMin * 60000) return 'main'
  return 'warmup'
}

/** When the main part started (recorded, or due once the warm-up's minutes ran out); null while warming up. */
export function mainStartOf(w: Pick<Workout, 'start' | 'cardio'>, now = Date.now()): number | null {
  const c = w.cardio
  if (!c) return null
  if (c.mainStart) return c.mainStart
  const due = w.start + c.warmupMin * 60000
  return now >= due || c.cooldownStart ? Math.min(due, c.cooldownStart ?? due) : null
}

/** When the current phase began. */
export function phaseStart(w: Workout, now = Date.now()): number {
  const p = cardioPhase(w, now)
  if (p === 'cooldown') return w.cardio!.cooldownStart!
  if (p === 'main') return mainStartOf(w, now) ?? w.start
  return w.start
}

/** Heart rate samples between two times (epoch ms; `to` null = up to now). */
export function samplesBetween(w: Workout, from: number, to: number | null): [number, number][] {
  const a = (from - w.start) / 1000
  const b = to == null ? Infinity : (to - w.start) / 1000
  return (w.hr || []).filter(([t]) => t >= a && t < b)
}

/** The main part's heart rate: average, max, seconds in each zone. Null until there are two samples. */
export function mainHR(w: Workout, now = Date.now()): HRSummary | null {
  const from = mainStartOf(w, now)
  if (from == null) return null
  return summarizeHR(samplesBetween(w, from, w.cardio?.cooldownStart ?? w.end ?? null))
}

/** Seconds spent in each phase (for the summary). */
export function phaseSeconds(w: Workout, now = Date.now()): { warmup: number; main: number; cooldown: number } | null {
  const c = w.cardio
  if (!c) return null
  const end = w.end ?? now
  const main = mainStartOf(w, end) ?? end
  const cool = c.cooldownStart ?? end
  const s = (ms: number) => Math.max(0, Math.round(ms / 1000))
  return { warmup: s(Math.min(main, cool) - w.start), main: s(cool - main), cooldown: s(end - cool) }
}

// ---- moving through the session ----------------------------------------------------------

function patch(fn: (c: CardioSession) => void) {
  updateActive((x) => x.cardio && fn(x.cardio))
  pushLiveHR()
}

/** End the warm-up now ("Start main"). */
export function startMain() {
  haptic(12)
  patch((c) => void (c.mainStart = Date.now()))
}

/** Main → cool-down stretches. */
export function startCooldown() {
  haptic(12)
  const now = Date.now()
  patch((c) => {
    c.mainStart ||= now
    c.cooldownStart = now
  })
}

/** Changed your mind: back to the main part. */
export function resumeMain() {
  cancelSetTimer()
  patch((c) => void (c.cooldownStart = null))
}

/** Change the running session (from its settings sheet). Stretch ticks reset if the list changed. */
export function updateSession(p: CardioPrefs) {
  updateActive((x) => {
    const c = x.cardio
    if (!c) return
    const before = sessionName(c.activity, x.targetZone ?? null)
    const stretches = stretchesFor(p)
    if (JSON.stringify(stretches) !== JSON.stringify(c.stretches || [])) {
      x.checks = Object.fromEntries(Object.entries(x.checks || {}).filter(([k]) => !/^c\d/.test(k)))
      cancelSetTimer()
    }
    c.activity = p.activity || 'Cardio'
    c.warmupMin = p.warmupMin
    c.cooldownMin = p.cooldownMin
    c.stretches = stretches
    x.cooldown = stretches
    x.targetZone = p.target
    if (x.name === before) x.name = sessionName(c.activity, p.target)
  })
  pushLiveHR()
}

/** Save the session and go to its summary. */
export async function finishCardio() {
  const w = active.value
  if (!w) return
  if ((w.hr?.length || 0) < 6 && Date.now() - w.start < 60000) {
    const discard = await confirmDialog({
      title: 'Nothing recorded yet',
      message: 'Less than a minute in and no heart rate yet. Discard this session?',
      confirm: 'Discard',
      cancel: 'Keep going',
      danger: true,
    })
    if (discard) {
      await discardActive()
      navigate('/train', { replace: true })
    }
    return
  }
  const now = Date.now()
  const c = w.cardio!
  const saved = await finishActive(w.name, w.notes, { cardio: { ...c, mainStart: mainStartOf(w, now) } })
  pushLiveHR()
  if (saved) navigate('/history/' + saved.id + '?done=1', { replace: true })
}

export async function discardCardio() {
  const ok = await confirmDialog({ title: 'Discard session?', message: 'The time and heart rate from this session will be lost.', confirm: 'Discard', cancel: 'Cancel', danger: true })
  if (!ok) return false
  await discardActive()
  pushLiveHR()
  navigate('/train', { replace: true })
  return true
}

// The warm-up hands over to the main part on its own when its minutes are up (on any screen).
setInterval(() => {
  const w = active.value
  const c = w?.cardio
  if (!w || !c || c.mainStart || c.cooldownStart) return
  const due = w.start + c.warmupMin * 60000
  if (Date.now() < due) return
  updateActive((x) => void (x.cardio && (x.cardio.mainStart = due)))
  haptic(200)
  pushLiveHR()
}, 1000)
