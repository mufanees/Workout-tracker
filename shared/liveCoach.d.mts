export interface LCSet {
  id: string
  kind: string
  weight: number | null
  reps: number | null
  seconds?: number | null
  done: boolean
  rir?: number | null
  at?: number
  work?: number | null
  rested?: number | null
  restPlan?: number | null
  cw?: number | null
  cr?: number | null
  tw?: number | null
  tr?: number | null
  ts?: number | null
}
export interface LCExercise {
  id: string
  exerciseId: string
  name: string
  muscle?: string
  equipment?: string
  type: 'weight_reps' | 'reps' | 'duration'
  bodyweight?: boolean
  /** how the stored weight reads: one dumbbell of a pair, a single weight, or a total */
  load?: 'each' | 'one' | 'total' | null
  accessory?: boolean
  /** movement pattern (push, pull, legs, core, full, other): two of the same don't superset */
  pattern?: string
  /** muscle regions it trains (shared/fatigue.mjs ids): main and helpers */
  regions?: { p: string[]; s: string[] }
  target: string
  rest: number
  superset: string | null
  sets: LCSet[]
  /** previous sessions, newest first */
  history?: { start: number; sets: { kind: string; weight: number | null; reps: number | null; rir?: number | null }[] }[]
  /** measured seconds per set (incl. start delay), if known */
  pace?: number | null
}
export interface LCBudget {
  total: number
  warmup: number
  cooldown: number
}
export interface LCState {
  now: number
  start: number
  exercises: LCExercise[]
  budget?: Partial<LCBudget>
  warmup?: { open: boolean; secs?: number }
  cooldown?: { done: boolean; secs?: number }
  /** the app's estimate in minutes (src/timeplan.ts): projections are scaled to it so there's one number */
  plan?: { warmup: number; main: number; cooldown: number } | null
  /** the app can fit the whole session to the budget (offered at the start) */
  canFit?: boolean
  restRun?: { start: number; plan: number; end: number } | null
  restOverrun?: number
  hr?: { samples?: [number, number][]; now?: number | null; max?: number; zones?: number[] } | null
  equipment?: { step?: number; max?: number }
  fmt?: { w(kg: number, ex: LCExercise): string }
  /** muscle fatigue by region id, 0–1 (shared/fatigue.mjs) */
  fatigue?: Record<string, { fatigue: number; name?: string }>
}
export interface Effort {
  rir: number
  source: 'tap' | 'reps' | 'reps+signals'
  why: string
  missed: boolean
}
export interface SetPlan {
  weId: string
  setIds: string[]
  weight: number | null
  reps: number | null
  kind: 'up' | 'keep' | 'down' | 'reps'
  reason: string
}
export interface TimeStatus {
  total: number
  elapsed: number
  left: number
  lifting: number
  projected: number
  over: number
  state: 'on' | 'over' | 'ahead' | 'out'
  main: number
  cooldown: number
  warmupLeft: number
  restLeft: number
}
export interface TimeAction {
  id: string
  kind: 'rest' | 'drop-sets' | 'superset' | 'skip' | 'fit'
  label: string
  short: string
  saves: number
  cost: number
  weIds: string[]
  restTo?: number
  setIds?: string[]
}
export interface HRState {
  bpm: number
  pct: number
  zone: number
  max: number
  high: boolean
  restAge: number | null
  atRestStart: number | null
  drop60: number | null
}
export interface HRAdvice {
  text: string
  extend: number
  reps: number | null
  cost?: number
}
export interface LiveResult {
  plans: SetPlan[]
  time: TimeStatus
  actions: TimeAction[]
  best: TimeAction | null
  hr: HRState | null
  form: number | null
}
export const DEFAULT_BUDGET: LCBudget
export function parseRange(target: string): { lo: number; hi: number } | null
export function roundTo(w: number, step?: number): number
export function equipmentFor(ex: Pick<LCExercise, 'equipment' | 'load'>, eq?: { step?: number; max?: number }): { step: number; max: number }
export function loadUp(w: number, eq: { step: number; max: number }): number
export function loadDown(w: number, eq: { step: number; max: number }): number
export function effortOf(s: LCSet, ex: LCExercise, ctx: LCState): Effort
export function nextSetPlan(ex: LCExercise, ctx: LCState): SetPlan | null
export function firstSetPlan(ex: LCExercise, ctx: LCState, form?: number | null): SetPlan | null
export function formToday(ctx: LCState): number | null
export function setSecs(ex: LCExercise, s?: LCSet): number
export function groups<T extends { superset: string | null }>(list: T[]): T[][]
export function mainLeft(ctx: LCState, list?: LCExercise[]): { secs: number; rests: { secs: number; weIds: string[] }[] }
export function timeStatus(ctx: LCState): TimeStatus
export function isAccessory(ex: Pick<LCExercise, 'name' | 'muscle' | 'accessory'>): boolean
export function timeActions(ctx: LCState, status?: TimeStatus): TimeAction[]
export function hrState(ctx: LCState): HRState | null
export function hrAdvice(ctx: LCState, status?: TimeStatus, plan?: SetPlan | null): HRAdvice | null
export function plansFor(ctx: LCState): SetPlan[]
export function liveCoach(ctx: LCState): LiveResult
export function clock(secs: number): string
export function timeText(t: TimeStatus): string
export function startBrief(ctx: LCState): { text: string; action: TimeAction | null; result: LiveResult }
export function finishVerdict(ctx: LCState): string
export function sessionLine(ctx: LCState): string
export function restCue(ctx: LCState, status?: TimeStatus): { text: string; go: true; saves: number } | null
export function setCue(ctx: LCState, o?: { since?: number | null; timed?: boolean }): { key: 'high' | 'easy'; text: string } | null
export interface FatigueAdvice {
  weIds: string[]
  names: string[]
  regions: { id: string; name: string; fatigue: number }[]
  text: string
  short: string
}
export function fatigueAdvice(ctx: LCState, from?: number): FatigueAdvice | null
export function lighter(plan: SetPlan | null, ex: LCExercise, ctx: LCState): SetPlan | null
export function lackedTerms(text: string | null | undefined): string[]
export interface SwapCandidate {
  id: string
  name: string
  equipment?: string
  type?: string
  muscle?: string
  pattern?: string
  regions?: { p: string[]; s: string[] }
}
export interface Alternative {
  id: string
  name: string
  equipment?: string
  score: number
  why: string
}
export function alternatives(target: SwapCandidate, candidates: SwapCandidate[], o?: { have?: string[]; lack?: string[]; fatigue?: Record<string, number>; logged?: Set<string>; limit?: number }): Alternative[]
export function familyOf(name: string): string | null
