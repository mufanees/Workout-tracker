export const REHAB_CORE: string
export const REHAB_KNOWLEDGE: Record<string, string>
export interface RehabExercise {
  name: string
  areas: string[]
  equipment: string
  type: 'weight_reps' | 'reps' | 'duration'
  dose: string
  for: string[]
  steps: string[]
}
export const REHAB_EXERCISES: RehabExercise[]
export function findStretches(q?: { area?: string; goal?: string; equipment?: string; max?: number }): string
export function rehabLibraryRows(): [string, string, string, 'weight_reps' | 'reps' | 'duration', string][]
