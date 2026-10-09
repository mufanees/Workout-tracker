export interface TimingMark {
  at: number
  kind: 'tick' | 'rest-end'
  /** the rest that ended before this anchor: seconds it lasted, and the rest planned then */
  rested?: number
  plan?: number
}
export interface RestRun {
  start: number
  plan: number
  /** scheduled end */
  end: number
}
export interface SetTiming {
  at: number
  work: number | null
  rested: number | null
  restPlan: number | null
}
export interface TimingSummary {
  warmup: number
  work: number
  rest: number
  transition: number
  cooldown: number
  total: number
}
interface TSet {
  id: string
  kind?: string
  done: boolean
  at?: number
  work?: number | null
  rested?: number | null
  restPlan?: number | null
}
interface TWorkout {
  id?: string
  name?: string
  start: number
  end?: number | null
  mark?: TimingMark | null
  restRun?: RestRun | null
  checkAt?: Record<string, number>
  timing?: TimingSummary
  timePlan?: { budget: number }
  exercises: { id: string; exerciseId: string; sets: TSet[] }[]
}
export interface ExerciseTime {
  weId: string
  exerciseId: string
  sets: number
  works: (number | null)[]
  rests: number[]
  plans: (number | null)[]
  work: number
  rest: number
  total: number
  avg: number | null
}
export interface PaceStats {
  exercises: { exerciseId: string; sets: number; sessions: number; avg: number }[]
  rest: { n: number; overrun: number; taken: number; plan: number } | null
  transition: number | null
  sessions: { id?: string; start: number; name?: string; timing: TimingSummary; budget: number | null }[]
}
export const MAX_SET_SECS: number
export function restEndMark(restRun: RestRun, at: number): TimingMark
export function settle(w: Pick<TWorkout, 'mark' | 'restRun'>, now: number): { mark: TimingMark | null; restRun: RestRun | null }
export function tickTiming(w: TWorkout, now: number, timedFrom?: number | null): { set: SetTiming; mark: TimingMark; restRun: null }
export function lineTick(w: Pick<TWorkout, 'mark' | 'restRun'>, now: number): { mark: TimingMark; restRun: RestRun | null }
export function untickSet<S extends TSet>(s: S): S
export function untickAnchor(w: Pick<TWorkout, 'mark' | 'restRun'>, s: TSet): { mark: TimingMark; restRun: RestRun | null } | null
export function workoutTiming(w: TWorkout): TimingSummary | null
export function exerciseTimes(w: TWorkout): ExerciseTime[]
export function fmtSecs(s: number | null | undefined): string
export function paceStats(list: TWorkout[], since?: number): PaceStats
