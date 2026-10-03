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
  // Today's targets from the coach (take priority over last time's numbers as placeholders).
  cw?: number | null
  cr?: number | null
  /** Reps left in the tank on this set (0 = couldn't do another), from the effort tap after an exercise. */
  rir?: number | null
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
  checkAt?: Record<string, number> // when each warm-up / cool-down item was ticked
  feedback?: Feedback
  /** Expected minutes when the workout started (see timeplan.ts). */
  timePlan?: { budget: number; warmup: number; main: number; cooldown: number; fixed: boolean }
  /** Copied from the routine when the workout started. */
  warmup?: string[]
  cooldown?: string[]
  /** The coach's targets for this session (live workout only, not saved). */
  coachPlan?: { focus: string; targets: { exercise: string; weight_kg?: number; reps?: string; note?: string }[]; applied?: boolean } | null
  coachPlanAsked?: boolean
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
  budget?: number | null // minutes you have for this routine; null = use the estimate
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
  weightGoal?: number | null // kg
  /** how to pick a time of day: clock dial (default) or scroll wheels */
  timePicker?: 'clock' | 'wheels'
  fastRemind?: boolean // notify when the eating window is about to close
  moveGoal?: number // daily Move ring, minutes of any workout
  showPace?: boolean // time budget and pace on the workout screen
  /** A program the coach built and the athlete approved: routines to rotate through. Replaces the Comeback plan card while set. */
  program?: { name: string; routineIds: string[]; daysPerWeek: number; minutes?: number; summary?: string; start: number } | null
}

export interface Quote {
  text: string // words in CAPITALS are shown emphasised
  author?: string
  tag?: string
}

/**
 * The coach's memory, one store with a `kind`:
 * profile (single record id "profile"), note, goal, commitment, insight (weekly review / workout takeaway).
 */
/**
 * A measurable goal the app tracks and the coach coaches to.
 * lift: target is total kg (both dumbbells when each hand holds one) for `reps` reps;
 * exercise is a library name or "any" (any lift with a dumbbell in each hand).
 * bodyweight: kg. zone2: minutes a week. workouts: sessions a week. fast: hours. custom: judged by the coach.
 */
export interface GoalSpec {
  metric: 'lift' | 'bodyweight' | 'zone2' | 'workouts' | 'fast' | 'custom'
  target?: number
  exercise?: string
  reps?: number
  equipmentMax?: number // lift: heaviest dumbbell they own, kg
  baseline?: number // where they were when the goal was set
  milestones?: { value: number; due?: number | null; label?: string }[]
}

/** A multi-week training plan the coach proposed and the athlete approved. */
export interface BlockSpec {
  start: number // local midnight of day 1
  weeks: number
  summary?: string
  goalId?: string
  phases: { from: number; to: number; focus: string; reps?: string; sets?: number; effort?: string; notes?: string }[]
  deloadWeek?: number | null
  keyLifts?: { exercise: string; progression: string }[]
}

export interface CoachItem extends Rec {
  kind: 'profile' | 'note' | 'goal' | 'commitment' | 'insight' | 'snapshot' | 'block' | 'source'
  text?: string
  created?: number
  due?: number | null // goals and commitments
  status?: 'open' | 'done' | 'missed' | 'dropped'
  outcome?: string
  goal?: GoalSpec // kind 'goal': what to measure
  block?: BlockSpec // kind 'block': the plan
  body?: string // kind 'source': the material (text is its title)
  source?: 'coach' | 'you' | 'app'
  type?: 'weekly' | 'workout' // insights
  ref?: string // insight: workout id or week start (YYYY-MM-DD)
  // profile fields
  goals?: string
  injuries?: string
  equipment?: string
  schedule?: string
  preferences?: string
  age?: number | null
  maxHr?: number | null
  tz?: string
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
  note?: string
}

/** A note for one day. id is the local date, "YYYY-MM-DD". */
export interface DayNote extends Rec {
  text: string
  /** Morning check-in, 1 (bad) to 3 (good) each; stress 3 = calm. */
  sleep?: 1 | 2 | 3 | null
  energy?: 1 | 2 | 3 | null
  stress?: 1 | 2 | 3 | null
}

export type StoreName = 'exercises' | 'routines' | 'workouts' | 'settings' | 'body' | 'fasts' | 'readings' | 'coach' | 'days'

/** How a workout felt, for the coach. Exercise ratings are keyed by the workout exercise's id. */
export interface Feedback {
  length?: 'short' | 'right' | 'long'
  warmup?: 'right' | 'long'
  cooldown?: 'right' | 'long'
  ex?: Record<string, 'easy' | 'right' | 'hard' | 'pain'>
  note?: string
  at?: number
}
