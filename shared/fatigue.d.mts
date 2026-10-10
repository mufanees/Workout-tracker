export type RegionId =
  | 'traps'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'chest'
  | 'lats'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'calves'

export interface Region {
  id: RegionId
  name: string
  short?: string
  size: 'small' | 'medium' | 'large'
  target: [number, number]
  views: ('front' | 'back')[]
}
export interface MuscleMap {
  p: string[]
  s: string[]
}
export type FatigueState = 'fresh' | 'recovering' | 'fatigued'
export interface RegionStatus {
  id: RegionId
  fatigue: number
  state: FatigueState
  v: number
  freshAt: number | null
  weekSets: number
  weekEff: number
  target: [number, number]
  last: number | null
  top: { exerciseId: string; sets: number }[]
}
export interface RegionLoad {
  eff: number
  sets: number
  byEx: Record<string, number>
}
interface SetLike {
  done: boolean
  kind: string
  reps: number | null
  seconds: number | null
  rir?: number | null
  tr?: number | null
}
interface ExLike {
  exerciseId: string
  target: string
  sets: SetLike[]
}
interface WorkoutLike {
  start: number
  end: number | null
  deleted?: boolean
  exercises: ExLike[]
}

export const HALF_LIFE_H: { small: number; medium: number; large: number }
export const FATIGUED_FROM: number
export const FRESH_BELOW: number
export const SCALE: number
export const SESSION_CAP: number
export const SECONDARY: number
export const V_FRESH: number
export const REGIONS: Region[]
export const REGION_IDS: RegionId[]
export const regionById: Record<RegionId, Region>
export function halfLifeOf(id: string): number
export function parseMap(str: string | null | undefined): MuscleMap
export function formatMap(m: MuscleMap): string
export function deltOf(name: string): RegionId
export function regionsOfFedb(muscle: string, name: string, role: 'p' | 's'): RegionId[]
export function guessRegions(name?: string, muscle?: string): MuscleMap
export function effortWeight(rir: number | null | undefined): number
export function parseTarget(t: string | null | undefined): [number, number] | null
export function inferRir(reps: number | null, range: [number, number] | null): number | null
export function exerciseEfforts<S extends SetLike>(we: { target: string; sets: S[] }): { set: S; rir: number | null; source: 'logged' | 'kind' | 'inferred' | 'default'; weight: number }[]
export function workoutTime(w: { start: number; end: number | null }): number
export function workoutLoad(w: WorkoutLike, musclesOf: (exerciseId: string) => MuscleMap | null | undefined): Partial<Record<RegionId, RegionLoad>>
export function fatigueFrom(v: number): number
export function stateOf(f: number): FatigueState
export function muscleStatus(
  workouts: WorkoutLike[],
  now: number,
  musclesOf: (exerciseId: string) => MuscleMap | null | undefined,
  opts?: { days?: number; scanDays?: number },
): Record<RegionId, RegionStatus>
export function volumeLevel(sets: number, target: [number, number]): number
export function fatigueLevel(f: number): number
export function musclesText(status: Record<RegionId, RegionStatus>, now: number, nameOf?: (exerciseId: string) => string): string
