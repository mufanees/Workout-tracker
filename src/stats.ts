// Derived data: previous performance, personal records, exercise history.
import { computed } from '@preact/signals'
import { workouts, exMap } from './store'
import type { Workout, WSet, ExType } from './types'
import { counts, e1rm, setVolume } from './util'

export interface Session {
  workout: Workout
  sets: WSet[] // completed sets only
}

/** All completed sessions per exercise, newest first. */
export const sessionsByExercise = computed(() => {
  const map = new Map<string, Session[]>()
  for (const w of workouts.value) {
    for (const we of w.exercises) {
      const sets = we.sets.filter((s) => s.done)
      if (!sets.length) continue
      let list = map.get(we.exerciseId)
      if (!list) map.set(we.exerciseId, (list = []))
      // Merge if the same exercise appears twice in one workout.
      const same = list.find((s) => s.workout.id === w.id)
      if (same) same.sets.push(...sets)
      else list.push({ workout: w, sets })
    }
  }
  return map
})

export function previousSets(exerciseId: string, excludeWorkoutId?: string, before?: number): WSet[] {
  const list = sessionsByExercise.value.get(exerciseId) || []
  const s = list.find((x) => x.workout.id !== excludeWorkoutId && (before == null || x.workout.start < before))
  return s ? s.sets : []
}

/** Pair each set with the set in the same position (warm-ups matched separately). */
export function matchPrevious(sets: WSet[], prev: WSet[]): (WSet | undefined)[] {
  const pw = prev.filter((s) => s.kind === 'warmup')
  const pn = prev.filter((s) => s.kind !== 'warmup')
  let w = 0
  let n = 0
  return sets.map((s) => (s.kind === 'warmup' ? pw[w++] : pn[n++]))
}

export type PRKind = 'weight' | '1rm' | 'volume' | 'reps' | 'time'
export const PR_LABEL: Record<PRKind, string> = {
  weight: 'Heaviest weight',
  '1rm': 'Best est. 1RM',
  volume: 'Best set volume',
  reps: 'Most reps',
  time: 'Longest time',
}

interface Bests {
  weight: number
  '1rm': number
  volume: number
  reps: number
  time: number
}

function metrics(s: WSet, type: ExType): Partial<Bests> {
  if (type === 'duration') return { time: s.seconds || 0 }
  if (type === 'reps') return { reps: s.reps || 0 }
  if (s.weight == null || s.weight === 0) return { reps: s.reps || 0 }
  return { weight: s.weight, '1rm': e1rm(s.weight, s.reps || 0), volume: setVolume(s) }
}

/**
 * Personal records, computed once over the whole history in date order.
 * A PR is only awarded when the exercise has been done before.
 */
export const prIndex = computed(() => {
  const bySet = new Map<string, PRKind[]>()
  const byWorkout = new Map<string, number>()
  const best = new Map<string, Bests>()
  const ordered = [...workouts.value].sort((a, b) => a.start - b.start)
  for (const w of ordered) {
    let count = 0
    for (const we of w.exercises) {
      const type = exMap.value.get(we.exerciseId)?.type || 'weight_reps'
      const prior = best.get(we.exerciseId)
      const current: Bests = prior ? { ...prior } : { weight: 0, '1rm': 0, volume: 0, reps: 0, time: 0 }
      const winners = new Map<PRKind, string>()
      for (const s of we.sets) {
        if (!counts(s)) continue
        const m = metrics(s, type)
        for (const k of Object.keys(m) as PRKind[]) {
          const v = m[k]!
          if (v > current[k]) {
            current[k] = v
            winners.set(k, s.id)
          }
        }
      }
      if (prior) {
        for (const [k, setId] of winners) {
          if (prior[k] <= 0) continue
          const list = bySet.get(setId) || []
          if (!list.length) count++
          list.push(k)
          bySet.set(setId, list)
        }
      }
      if (we.sets.some(counts)) best.set(we.exerciseId, current)
    }
    byWorkout.set(w.id, count)
  }
  return { bySet, byWorkout }
})

export function exerciseRecords(exerciseId: string) {
  const sessions = sessionsByExercise.value.get(exerciseId) || []
  const type = exMap.value.get(exerciseId)?.type || 'weight_reps'
  let heaviest: WSet | null = null
  let best1rm: WSet | null = null
  let bestVol: WSet | null = null
  let mostReps: WSet | null = null
  let longest: WSet | null = null
  let bestSession = 0
  for (const s of sessions) {
    let vol = 0
    for (const set of s.sets) {
      if (!counts(set)) continue
      vol += setVolume(set)
      if (set.weight != null && (!heaviest || set.weight > heaviest.weight! || (set.weight === heaviest.weight && (set.reps || 0) > (heaviest.reps || 0)))) heaviest = set
      if (set.weight && set.reps && (!best1rm || e1rm(set.weight, set.reps) > e1rm(best1rm.weight!, best1rm.reps!))) best1rm = set
      if (setVolume(set) && (!bestVol || setVolume(set) > setVolume(bestVol))) bestVol = set
      if (set.reps && (!mostReps || set.reps > mostReps.reps!)) mostReps = set
      if (set.seconds && (!longest || set.seconds > longest.seconds!)) longest = set
    }
    bestSession = Math.max(bestSession, vol)
  }
  return { type, sessions, heaviest, best1rm, bestVol, mostReps, longest, bestSession }
}
