export interface LibExercise {
  id: string
  name: string
  muscle: string
  equipment: string
  type: string
  custom?: boolean
  video?: string
}
export interface ResolvedRoutine {
  id: string
  name: string
  folder: string
  notes: string
  order: number
  exercises: {
    id: string
    exerciseId: string
    notes: string
    target: string
    rest: number
    superset: string | null
    sets: { id: string; kind: 'normal'; weight: number | null; reps: number | null; seconds: number | null; done: boolean }[]
  }[]
}
export const PLAN_FORMAT: string
export function planPrompt(exerciseNames: string[]): string
export function slug(name: string): string
export function matchExercise(name: string, library: LibExercise[], equipment?: string): LibExercise | null
export function extractJson(text: string): unknown
export function resolvePlan(
  plan: unknown,
  library: LibExercise[],
  makeId: () => string,
  now?: number,
): { folder: string; routines: ResolvedRoutine[]; newExercises: LibExercise[]; matches: { from: string; to: string; created: boolean }[] }
