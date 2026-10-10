// The muscle model (shared/fatigue.mjs) on your data: which body regions each exercise trains, how
// fatigued each region is now, and working sets per region over the last 7 days.
import { exMap, exercises, workouts } from './store'
import MAP from './data/muscles.json'
import { guessRegions, muscleStatus, musclesText, parseMap, REGIONS, workoutLoad, type MuscleMap, type RegionId, type RegionStatus } from '../shared/fatigue.mjs'
import type { Workout } from './types'

export { REGIONS, regionById, fatigueLevel, volumeLevel, FRESH_BELOW, FATIGUED_FROM } from '../shared/fatigue.mjs'
export type { RegionId, RegionStatus, FatigueState } from '../shared/fatigue.mjs'

const DATA = MAP as Record<string, string>
const cache = new Map<string, MuscleMap>()
let cacheFor: unknown = null

/** Regions an exercise trains: the generated table (scripts/muscles.mjs), else a guess from its name
 * and muscle field (custom exercises, ones the coach added). */
export function musclesOf(exerciseId: string): MuscleMap {
  if (cacheFor !== exercises.value) (cache.clear(), (cacheFor = exercises.value))
  let m = cache.get(exerciseId)
  if (!m) {
    const ex = exMap.value.get(exerciseId)
    m = DATA[exerciseId] ? parseMap(DATA[exerciseId]) : ex ? guessRegions(ex.name, ex.muscle) : { p: [], s: [] }
    cache.set(exerciseId, m)
  }
  return m
}

let last: { list: Workout[]; ex: unknown; at: number; res: Record<RegionId, RegionStatus> } | null = null
/** Every region's status at `now` (cached per minute and per change to workouts or exercises). */
export function muscleStatusAt(now = Date.now()): Record<RegionId, RegionStatus> {
  const at = Math.floor(now / 60000)
  if (last && last.list === workouts.value && last.ex === exercises.value && last.at === at) return last.res
  const res = muscleStatus(workouts.value, now, musclesOf)
  last = { list: workouts.value, ex: exercises.value, at, res }
  return res
}

/** Per region from one workout (for the "muscles worked" map): effort-weighted and plain working sets. */
export function workoutRegions(w: Workout): Partial<Record<RegionId, { eff: number; sets: number }>> {
  const load = workoutLoad(w, musclesOf)
  const out: Partial<Record<RegionId, { eff: number; sets: number }>> = {}
  for (const [id, l] of Object.entries(load)) if (l && l.sets > 0) out[id as RegionId] = { eff: l.eff, sets: l.sets }
  return out
}

/** MUSCLES block for the coach context. */
export function muscleCoachText(now = Date.now()): string {
  const st = muscleStatusAt(now)
  return musclesText(st, now, (id) => exMap.value.get(id)?.name || id)
}

export const regionName = (id: RegionId, short = false) => {
  const r = REGIONS.find((x) => x.id === id)!
  return short ? r.short || r.name : r.name
}
