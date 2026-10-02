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
  /** Heart rate samples: [seconds since start, bpm]. */
  hr?: [number, number][]
  /** Heart rate zone to hold (1-5), e.g. 2 for a zone 2 session. */
  targetZone?: number | null
  /** Shoulder stiffness after the session, 0 (none) to 10. */
  shoulder?: number | null
  /** Warm-up / cool-down items ticked off, keyed "w0", "c2"… */
  checks?: Record<string, boolean>
  /** Copied from the routine when the workout started. */
  warmup?: string[]
  cooldown?: string[]
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
  warmup?: string[]
  cooldown?: string[]
}

export interface Settings extends Rec {
  unit: 'kg' | 'lb'
  defaultRest: number
  sound: boolean
  keepAwake: boolean
  theme: 'system' | 'light' | 'dark'
  showPlan: boolean
  planStart: number | null // start of week 1 of the Comeback plan; null = infer
  ft?: Record<string, number> // when each field was last changed, for per-field sync merging
  /** Upper bpm of zones 1-4 (zone 5 is everything above the last). */
  hrZones: [number, number, number, number]
  targetZone: number | null
  fastGoal: number // hours
  askShoulder: boolean
  zone2Goal: number // minutes per week
  reminderTime: string | null // "07:00" for a training-day notification, null = off
  quotes: Quote[]
  showQuotes: boolean
}

export interface Quote {
  text: string // words in CAPITALS are shown emphasised
  author?: string
  tag?: string
}

/** A morning resting heart rate / HRV reading. */
export interface Reading extends Rec {
  date: number
  rhr: number // bpm
  hrv: number | null // RMSSD, ms
}

export interface BodyWeight extends Rec {
  date: number
  kg: number
}

export interface Fast extends Rec {
  start: number
  end: number | null
  goal: number // hours
}

export type StoreName = 'exercises' | 'routines' | 'workouts' | 'settings' | 'body' | 'fasts' | 'readings'
