export interface Budget {
  total: number
  warmup: number
  cooldown: number
}
export interface BudgetSet {
  id?: string
  kind: string
  weight?: number | null
  reps?: number | null
  seconds?: number | null
  tw?: number | null
  tr?: number | null
  ts?: number | null
}
export interface BudgetExercise {
  exerciseId: string
  target: string
  rest: number
  superset: string | null
  sets: BudgetSet[]
}
export interface BudgetRoutine {
  warmup?: string[]
  cooldown?: string[]
  exercises: BudgetExercise[]
}
export interface BudgetCtx {
  info?: (exerciseId: string) => { name: string; muscle?: string; equipment?: string; type?: string } | undefined
  setSecs?: (exerciseId: string) => number | null
  restOverrun?: number
  fmtWeight?: (exerciseId: string, kg: number) => string
}
export interface Parts {
  warmup: number
  main: number
  cooldown: number
  paced?: boolean
}
export interface FitResult<R> {
  routine: R
  changes: string[]
  before: number
  after: number
  fits: boolean
  budget: Budget
}
export const DEFAULT_BUDGET: Budget
export function budgetOf(b: Partial<Budget> | number | null | undefined): Budget
export function lineSeconds(line: string): number
export function plannedReps(we: BudgetExercise, i?: number): number | null
export function setWork(we: BudgetExercise, i: number, ctx?: BudgetCtx): number
export function groupsOf<E extends { superset: string | null }>(exercises: E[]): E[][]
export function mainSeconds(exercises: BudgetExercise[], ctx?: BudgetCtx): { secs: number; paced: boolean }
export function estimateParts(src: BudgetRoutine, ctx?: BudgetCtx): Parts
export function totalOf(e: Parts): number
export function kindOf(info: { name?: string; muscle?: string } | undefined): { role: 'compound' | 'isolation' | 'core'; pattern: 'push' | 'pull' | 'legs' | 'core' | 'full' | 'other' }
export function pairScore(a: string, b: string): number
export function heavierFor(reps: number | null | undefined): { top: number; low: number; factor: number } | null
export function fitLines(lines: string[] | undefined, budgetSecs: number): string[]
export function fitToBudget<R extends BudgetRoutine>(routine: R, budget: Partial<Budget> | number, ctx?: BudgetCtx): FitResult<R>
export function plannedVolume(routine: BudgetRoutine): number
