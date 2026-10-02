export type ExType = 'weight_reps' | 'reps' | 'duration'
export type SetKind = 'normal' | 'warmup' | 'failure' | 'drop'

export interface Rec {
  id: string
  updatedAt: number
  deleted?: boolean
}

export interface Exercise extends Rec {
  name: string
  muscle: string
  equipment: string
  type: ExType
  custom?: boolean
  video?: string
}

export interface WSet {
  id: string
  kind: SetKind
  weight: number | null // always stored in kg
  reps: number | null
  seconds: number | null
  done: boolean
  // Planned values carried over from a routine, used as placeholders.
  tw?: number | null
  tr?: number | null
  ts?: number | null
}

export interface WExercise {
  id: string
  exerciseId: string
  notes: string
  target: string // e.g. "10–12 / side", shown as guidance
  rest: number // seconds; 0 = off
  superset: string | null
  sets: WSet[]
}

export interface Workout extends Rec {
  name: string
  routineId: string | null
  start: number
  end: number | null
  notes: string
  exercises: WExercise[]
}

export interface Routine extends Rec {
  name: string
  folder: string
  notes: string
  order: number
  exercises: WExercise[]
}

export interface Settings extends Rec {
  unit: 'kg' | 'lb'
  defaultRest: number
  sound: boolean
  keepAwake: boolean
  theme: 'system' | 'light' | 'dark'
  showPlan: boolean
  planStart: number | null // start of week 1 of the Comeback plan; null = infer
}

export type StoreName = 'exercises' | 'routines' | 'workouts' | 'settings'
