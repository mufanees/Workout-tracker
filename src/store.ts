import { signal, computed, batch } from '@preact/signals'
import * as db from './db'
import type { BodyWeight, CoachItem, DayNote, Exercise, Fast, Quote, Reading, Rec, Routine, Settings, StoreName, Workout } from './types'
import QUOTES from './data/quotes.json'
import { seedExercises, seedRoutines } from './seed'
import { scheduleSync } from './sync'
import { sanitize } from './validate'
import { cloudSaveActive } from './cloud'

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  updatedAt: 1,
  unit: 'kg',
  defaultRest: 90,
  sound: true,
  keepAwake: true,
  theme: 'system',
  showPlan: true,
  planStart: null,
  hrZones: [119, 145, 160, 175],
  targetZone: null,
  fastGoal: 16,
  weightGoal: null,
  fastRemind: true,
  moveGoal: 30,
  askShoulder: true,
  zone2Goal: 150,
  reminderTime: null,
  quotes: QUOTES as Quote[],
  showQuotes: true,
}

export const ready = signal(false)
export const exercises = signal<Exercise[]>([])
export const routines = signal<Routine[]>([])
export const workouts = signal<Workout[]>([]) // newest first, finished only
export const settings = signal<Settings>(DEFAULT_SETTINGS)
export const active = signal<Workout | null>(null)
export const bodyWeights = signal<BodyWeight[]>([]) // newest first
export const fasts = signal<Fast[]>([]) // newest first
export const readings = signal<Reading[]>([]) // newest first
export const coachItems = signal<CoachItem[]>([])
export const dayNotes = signal<Map<string, DayNote>>(new Map())
export const activeFast = computed(() => fasts.value.find((f) => f.end == null) || null)

export const exMap = computed(() => new Map(exercises.value.map((e) => [e.id, e])))
export const unit = computed(() => settings.value.unit)

const SEED_VERSION = 3
let lastStamp = 0
/** A timestamp newer than the clock, our last write, and the record being replaced (guards against clock skew). */
export function stamp(after = 0) {
  lastStamp = Math.max(Date.now(), lastStamp + 1, after + 1)
  return lastStamp
}

// Bumped on every local write so a slow reload can't overwrite newer in-memory state.
let writeVersion = 0

const live = <T extends Rec>(list: T[]) => list.filter((r) => !r.deleted)
const byName = (a: Exercise, b: Exercise) => a.name.localeCompare(b.name)
const byOrder = (a: Routine, b: Routine) => a.order - b.order || a.name.localeCompare(b.name)
const byStartDesc = (a: Workout, b: Workout) => b.start - a.start
const byDateDesc = <T extends { date: number }>(a: T, b: T) => b.date - a.date
const byFastDesc = (a: Fast, b: Fast) => b.start - a.start
const byCreatedDesc = (a: CoachItem, b: CoachItem) => (b.created || 0) - (a.created || 0)

export async function reloadFromDb(): Promise<void> {
  const version = writeVersion
  const [ex, ro, wo, st, bw, fa, rd, co, dn] = await Promise.all([
    db.getAll<Exercise>('exercises'),
    db.getAll<Routine>('routines'),
    db.getAll<Workout>('workouts'),
    db.get<Settings>('settings', 'settings'),
    db.getAll<BodyWeight>('body'),
    db.getAll<Fast>('fasts'),
    db.getAll<Reading>('readings'),
    db.getAll<CoachItem>('coach'),
    db.getAll<DayNote>('days'),
  ])
  if (version !== writeVersion) return reloadFromDb()
  const ok = <T,>(store: StoreName, list: T[]) => list.map((r) => sanitize(store, r) as T | null).filter((r): r is T => r != null)
  batch(() => {
    exercises.value = live(ok('exercises', ex)).sort(byName)
    routines.value = live(ok('routines', ro)).sort(byOrder)
    workouts.value = live(ok('workouts', wo)).sort(byStartDesc)
    bodyWeights.value = live(ok('body', bw)).sort(byDateDesc)
    fasts.value = live(ok('fasts', fa)).sort(byFastDesc)
    readings.value = live(ok('readings', rd)).sort(byDateDesc)
    coachItems.value = live(ok('coach', co)).sort(byCreatedDesc)
    dayNotes.value = new Map(live(ok('days', dn)).map((d) => [d.id, d]))
    settings.value = { ...DEFAULT_SETTINGS, ...(st && !st.deleted ? st : {}) }
  })
}

export async function init() {
  const seeded = (await db.get<number>('meta', 'seedVersion')) || 0
  if (seeded < SEED_VERSION) {
    const existing = new Set([
      ...(await db.getAllKeys('exercises')).map((k) => 'exercises:' + k),
      ...(await db.getAllKeys('routines')).map((k) => 'routines:' + k),
    ])
    const items: { store: db.Store; key: string; value: unknown }[] = []
    for (const e of seedExercises()) if (!existing.has('exercises:' + e.id)) items.push({ store: 'exercises', key: e.id, value: e })
    for (const r of seedRoutines()) {
      // New seed content replaces built-in routines you haven't edited (updatedAt stays at the seed's 1).
      const cur = existing.has('routines:' + r.id) ? await db.get<Routine>('routines', r.id) : undefined
      if (!cur || (!cur.deleted && cur.updatedAt <= 1)) items.push({ store: 'routines', key: r.id, value: r })
    }
    items.push({ store: 'meta', key: 'seedVersion', value: SEED_VERSION })
    await db.putMany(items)
  }
  await reloadFromDb()
  active.value = (await db.get<Workout>('meta', 'active')) || null
  ready.value = true
}

// ---- writes -----------------------------------------------------------------

async function write<T extends Rec>(store: StoreName, rec: T): Promise<T> {
  writeVersion++
  rec = { ...rec, updatedAt: stamp(rec.updatedAt) }
  await db.putMany([
    { store, key: rec.id, value: rec },
    { store: 'dirty', key: `${store}:${rec.id}`, value: { store, id: rec.id } },
  ])
  scheduleSync()
  return rec
}

function upsert<T extends Rec>(list: T[], rec: T, sort: (a: T, b: T) => number): T[] {
  const next = list.filter((r) => r.id !== rec.id)
  if (!rec.deleted) next.push(rec)
  return next.sort(sort)
}

export async function saveExercise(e: Exercise) {
  const rec = await write('exercises', e)
  exercises.value = upsert(exercises.value, rec, byName)
  return rec
}

export async function saveRoutine(r: Routine) {
  const rec = await write('routines', r)
  routines.value = upsert(routines.value, rec, byOrder)
  return rec
}

export async function saveWorkout(w: Workout) {
  const rec = await write('workouts', w)
  workouts.value = upsert(workouts.value, rec, byStartDesc)
  return rec
}

/** Settings sync per field (see sync.ts), so each change records when that field changed. */
export async function saveSettings(patch: Partial<Settings>) {
  const t = stamp(settings.value.updatedAt)
  const ft = { ...(settings.value.ft || {}) }
  for (const k of Object.keys(patch)) ft[k] = t
  const rec = await write('settings', { ...settings.value, ...patch, ft, id: 'settings' })
  settings.value = rec
}

export async function saveBodyWeight(b: BodyWeight) {
  const rec = await write('body', b)
  bodyWeights.value = upsert(bodyWeights.value, rec, byDateDesc)
  return rec
}

export async function saveCoachItem(c: CoachItem) {
  const rec = await write('coach', c)
  coachItems.value = upsert(coachItems.value, rec, byCreatedDesc)
  return rec
}

export async function saveReading(r: Reading) {
  const rec = await write('readings', r)
  readings.value = upsert(readings.value, rec, byDateDesc)
  return rec
}

export async function saveFast(f: Fast) {
  const rec = await write('fasts', f)
  fasts.value = upsert(fasts.value, rec, byFastDesc)
  return rec
}

/** Saves a day's note; an empty note becomes a tombstone. */
export async function saveDayNote(id: string, text: string) {
  const cur = dayNotes.value.get(id)
  if (!text.trim() && !cur) return
  if (cur && cur.text === text) return
  const rec = await write<DayNote>('days', text.trim() ? { id, text, updatedAt: cur?.updatedAt || 0 } : { id, text: '', deleted: true, updatedAt: cur?.updatedAt || 0 })
  const next = new Map(dayNotes.value)
  if (rec.deleted) next.delete(id)
  else next.set(id, rec)
  dayNotes.value = next
}

/** Deletes leave a tombstone so the deletion syncs to other devices. */
export async function remove(store: 'exercises' | 'routines' | 'workouts' | 'body' | 'fasts' | 'readings' | 'coach', id: string) {
  const lists: Record<string, Rec[]> = { exercises: exercises.value, routines: routines.value, workouts: workouts.value, body: bodyWeights.value, fasts: fasts.value, readings: readings.value, coach: coachItems.value }
  const list = lists[store]
  const tomb = await write(store, { id, deleted: true, updatedAt: list.find((r) => r.id === id)?.updatedAt || 0 })
  if (store === 'exercises') exercises.value = upsert(exercises.value, tomb as Exercise, byName)
  if (store === 'routines') routines.value = upsert(routines.value, tomb as Routine, byOrder)
  if (store === 'workouts') workouts.value = upsert(workouts.value, tomb as Workout, byStartDesc)
  if (store === 'body') bodyWeights.value = upsert(bodyWeights.value, tomb as BodyWeight, byDateDesc)
  if (store === 'fasts') fasts.value = upsert(fasts.value, tomb as Fast, byFastDesc)
  if (store === 'readings') readings.value = upsert(readings.value, tomb as Reading, byDateDesc)
  if (store === 'coach') coachItems.value = upsert(coachItems.value, tomb as CoachItem, byCreatedDesc)
}

// ---- active workout (device only, saved continuously) ----------------------

// Saved right away (coalesced within the same tick) so a set is safe the moment it's checked.
let activeQueued = false
export function setActive(w: Workout | null) {
  active.value = w
  if (activeQueued) return
  activeQueued = true
  queueMicrotask(() => void flushActive())
}

export function flushActive(now = false) {
  activeQueued = false
  const w = active.value
  cloudSaveActive(w, now)
  return w ? db.put('meta', 'active', w) : db.del('meta', 'active')
}

export function updateActive(fn: (w: Workout) => void) {
  const w = active.value
  if (!w) return
  const next = structuredClone(w)
  fn(next)
  setActive(next)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushActive(true)
  })
  window.addEventListener('pagehide', () => flushActive(true))
}
