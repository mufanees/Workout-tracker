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
  video?: string // YouTube search words for when there's no saved video
  /** Videos you've saved for it, preferred first. */
  videos?: { url: string; title?: string; added: number }[]
  /** How its weight is logged: 'each' = one dumbbell of a pair (per hand), 'one' = a single weight, 'total' = everything together. Missing = guessed from the name. */
  load?: 'each' | 'one' | 'total'
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
  /** Timing, from live ticks (see shared/timing.mjs): when it was ticked done (epoch ms), */
  at?: number
  /** seconds from its start anchor (end of the rest before it, or the previous tick) to the tick; null = unknown (ticked during a rest), */
  work?: number | null
  /** seconds actually rested before it, when a rest ran, and the rest planned then. */
  rested?: number | null
  restPlan?: number | null
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
  timePlan?: { budget: number; warmup: number; main: number; cooldown: number; fixed: boolean; paced?: boolean }
  /** Where the time went, in seconds (saved on finish; see shared/timing.mjs). */
  timing?: { warmup: number; work: number; rest: number; transition: number; cooldown: number; total: number }
  /** Live workout only: the last start anchor for the next set, and the rest that's running. */
  mark?: { at: number; kind: 'tick' | 'rest-end'; rested?: number; plan?: number } | null
  restRun?: { start: number; plan: number; end: number } | null
  /** The mobility plan day (YYYY-MM-DD) this session came from, for a standalone mobility session. */
  mobility?: string
  /** A cardio session (see cardio.ts): one clock through warm-up → main → cool-down stretches; no exercises. */
  cardio?: CardioSession
  /** Copied from the routine when the workout started (plus that day's mobility add-ons). */
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
  /** The program this routine belongs to (programs hold folders, folders hold routines); '' or missing = none. */
  program?: string
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
  /** Settings → Goo (see gooConfig.ts); missing fields use the defaults */
  goo?: Partial<import('./gooConfig').GooTweaks>
  /** accent colour as #rrggbb; null or missing = lime */
  accent?: string | null
  /** how to pick a time of day: clock dial (default) or scroll wheels */
  timePicker?: 'clock' | 'wheels'
  fastRemind?: boolean // notify when the eating window is about to close
  liveFast?: boolean // running fast in the notification shade (default on)
  liveHR?: boolean // heart rate in the notification shade while Gloop is in the background (default on)
  liveHRVisible?: boolean // ...and also while Gloop is on screen (default off)
  moveGoal?: number // daily Move ring, minutes of any workout
  showPace?: boolean // time budget and pace on the workout screen
  /** A program the coach built and the athlete approved: routines to rotate through. Replaces the Comeback plan card while set. */
  program?: {
    name: string
    routineIds: string[]
    daysPerWeek: number
    minutes?: number
    summary?: string
    start: number
    /** A phased program (from the program library): each phase is one folder of the program, run for `weeks` weeks. Its routines are found by program + folder, so routineIds can be empty. */
    phases?: { folder: string; weeks: number; days?: number }[]
    /** Which catalogue program this came from, if any. */
    catalog?: string
  } | null
  /** Train (home) screen layout: section ids in your order, and the ones you've hidden. Missing = default order, all shown. */
  home?: { order?: string[]; hidden?: string[] }
  /** Warm-up and cool-down moves you've linked by hand: move name (lower-case letters only) → exercise id, or '' for text only. */
  moveLinks?: Record<string, string>
  /** Your cardio quick start (see cardio.ts): activity ('' = not chosen yet), zone to hold (null = free), phase minutes, cool-down stretches. */
  cardio?: CardioPrefs
}

/** A cardio session's timeline. Warm-up runs from `start` until mainStart, cool-down from cooldownStart. */
export interface CardioSession {
  activity: string // "Elliptical"
  warmupMin: number
  cooldownMin: number
  mainStart?: number | null
  cooldownStart?: number | null
  stretches?: string[] // cool-down lines, ticked as checks "c0", "c1"…
}

export interface CardioPrefs {
  activity: string
  target: number | null
  warmupMin: number
  cooldownMin: number
  /** Your own stretch list; missing = the activity's defaults. */
  stretches?: string[]
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

export interface MobilityMove {
  name: string // exercise library name
  sets?: number
  reps?: number
  seconds?: number
  cue?: string
}

/** One day of a coach-built mobility plan: add-ons for that day's workout and/or a standalone session. */
export interface MobilityDay {
  date: string // local YYYY-MM-DD
  intensity: 'hard' | 'moderate' | 'easy' | 'rest'
  focus?: string
  warmup?: string[] // added to the warm-up of whatever workout starts that day
  cooldown?: string[] // added to its cool-down
  session?: { name: string; minutes?: number; moves: MobilityMove[] }
}

export interface MobilitySpec {
  scope: 'today' | 'week'
  summary?: string
  days: MobilityDay[]
}

export interface CoachItem extends Rec {
  kind: 'profile' | 'note' | 'goal' | 'commitment' | 'insight' | 'snapshot' | 'block' | 'source' | 'mobility'
  text?: string
  created?: number
  due?: number | null // goals and commitments
  status?: 'open' | 'done' | 'missed' | 'dropped'
  outcome?: string
  goal?: GoalSpec // kind 'goal': what to measure
  block?: BlockSpec // kind 'block': the plan
  mobility?: MobilitySpec // kind 'mobility': stretches and rehab built into the day or week
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
