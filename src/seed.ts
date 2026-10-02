import type { Exercise, ExType, Routine, WExercise, WSet } from './types'

// Seed records use a fixed, tiny updatedAt so anything you edit (or anything
// already on the server) always wins over the built-in defaults.
const SEED_TIME = 1

type Def = [name: string, muscle: string, equipment: string, type?: ExType, video?: string]

const LIBRARY: Def[] = [
  // From the Dumbbell Comeback Plan
  ['Goblet Squat', 'Legs', 'Dumbbell', 'weight_reps', 'dumbbell goblet squat form'],
  ['One-Arm Dumbbell Row', 'Back', 'Dumbbell', 'weight_reps', 'dumbbell one arm row without bench staggered stance'],
  ['Dumbbell Floor Press', 'Chest', 'Dumbbell', 'weight_reps', 'dumbbell floor press form'],
  ['Glute Bridge', 'Glutes', 'Dumbbell', 'weight_reps', 'dumbbell glute bridge form'],
  ['Single-Leg Glute Bridge', 'Glutes', 'Bodyweight', 'weight_reps', 'single leg glute bridge form'],
  ['Dead Bug', 'Core', 'Bodyweight', 'weight_reps', 'dead bug exercise form'],
  ['Prone Y-T Raise', 'Shoulders', 'Bodyweight', 'weight_reps', 'prone Y T raises'],
  ['Dumbbell Romanian Deadlift', 'Legs', 'Dumbbell', 'weight_reps', 'dumbbell romanian deadlift form'],
  ['Bent-Over Dumbbell Row', 'Back', 'Dumbbell', 'weight_reps', 'dumbbell bent over row form'],
  ['Half-Kneeling One-Arm Press', 'Shoulders', 'Dumbbell', 'weight_reps', 'half kneeling single arm dumbbell press'],
  ['Standing One-Arm Press', 'Shoulders', 'Dumbbell', 'weight_reps', 'standing single arm dumbbell shoulder press'],
  ['Reverse Lunge', 'Legs', 'Dumbbell', 'weight_reps', 'dumbbell reverse lunge form'],
  ['Side Plank', 'Core', 'Bodyweight', 'duration', 'side plank form'],
  ['Bird Dog', 'Core', 'Bodyweight', 'reps', 'bird dog exercise form'],
  ['Rear Delt Fly', 'Shoulders', 'Dumbbell', 'weight_reps', 'dumbbell bent over rear delt fly form'],
  ['Dumbbell Split Squat', 'Legs', 'Dumbbell', 'weight_reps', 'dumbbell split squat form'],
  ['Hammer Curl', 'Arms', 'Dumbbell', 'weight_reps', 'dumbbell hammer curl form'],
  ['Floor Skull Crusher', 'Arms', 'Dumbbell', 'weight_reps', 'dumbbell skull crusher on floor'],
  ['Dumbbell Front Squat', 'Legs', 'Dumbbell', 'weight_reps', 'dumbbell front squat form'],
  ['Plank Dumbbell Drag', 'Core', 'Dumbbell', 'weight_reps', 'plank dumbbell drag'],
  ['Bulgarian Split Squat', 'Legs', 'Dumbbell', 'weight_reps', 'bulgarian split squat dumbbell at home chair'],
  ['Single-Leg Romanian Deadlift', 'Legs', 'Dumbbell', 'weight_reps', 'dumbbell single leg romanian deadlift form'],
  ['Push-Up', 'Chest', 'Bodyweight', 'reps', 'push up form'],
  // General library
  ['Dumbbell Bench Press', 'Chest', 'Dumbbell'],
  ['Incline Dumbbell Press', 'Chest', 'Dumbbell'],
  ['Dumbbell Fly', 'Chest', 'Dumbbell'],
  ['Bench Press', 'Chest', 'Barbell'],
  ['Incline Bench Press', 'Chest', 'Barbell'],
  ['Cable Fly', 'Chest', 'Cable'],
  ['Chest Dip', 'Chest', 'Bodyweight', 'reps'],
  ['Pull-Up', 'Back', 'Bodyweight', 'reps'],
  ['Chin-Up', 'Back', 'Bodyweight', 'reps'],
  ['Lat Pulldown', 'Back', 'Cable'],
  ['Seated Cable Row', 'Back', 'Cable'],
  ['Barbell Row', 'Back', 'Barbell'],
  ['Deadlift', 'Back', 'Barbell'],
  ['Face Pull', 'Shoulders', 'Cable'],
  ['Dumbbell Shrug', 'Back', 'Dumbbell'],
  ['Dumbbell Shoulder Press', 'Shoulders', 'Dumbbell'],
  ['Arnold Press', 'Shoulders', 'Dumbbell'],
  ['Overhead Press', 'Shoulders', 'Barbell'],
  ['Lateral Raise', 'Shoulders', 'Dumbbell'],
  ['Front Raise', 'Shoulders', 'Dumbbell'],
  ['Dumbbell Curl', 'Arms', 'Dumbbell'],
  ['Incline Dumbbell Curl', 'Arms', 'Dumbbell'],
  ['Concentration Curl', 'Arms', 'Dumbbell'],
  ['Barbell Curl', 'Arms', 'Barbell'],
  ['Overhead Triceps Extension', 'Arms', 'Dumbbell'],
  ['Triceps Kickback', 'Arms', 'Dumbbell'],
  ['Triceps Pushdown', 'Arms', 'Cable'],
  ['Close-Grip Push-Up', 'Arms', 'Bodyweight', 'reps'],
  ['Back Squat', 'Legs', 'Barbell'],
  ['Front Squat', 'Legs', 'Barbell'],
  ['Romanian Deadlift', 'Legs', 'Barbell'],
  ['Leg Press', 'Legs', 'Machine'],
  ['Leg Extension', 'Legs', 'Machine'],
  ['Lying Leg Curl', 'Legs', 'Machine'],
  ['Walking Lunge', 'Legs', 'Dumbbell'],
  ['Step-Up', 'Legs', 'Dumbbell'],
  ['Sumo Squat', 'Legs', 'Dumbbell'],
  ['Standing Calf Raise', 'Legs', 'Dumbbell'],
  ['Hip Thrust', 'Glutes', 'Barbell'],
  ['Dumbbell Hip Thrust', 'Glutes', 'Dumbbell'],
  ['Kettlebell Swing', 'Glutes', 'Kettlebell'],
  ['Plank', 'Core', 'Bodyweight', 'duration'],
  ['Crunch', 'Core', 'Bodyweight', 'reps'],
  ['Hanging Leg Raise', 'Core', 'Bodyweight', 'reps'],
  ['Russian Twist', 'Core', 'Dumbbell'],
  ['Ab Wheel Rollout', 'Core', 'Bodyweight', 'reps'],
  ['Hollow Hold', 'Core', 'Bodyweight', 'duration'],
  ["Farmer's Carry", 'Full Body', 'Dumbbell', 'duration'],
  ['Dumbbell Thruster', 'Full Body', 'Dumbbell'],
  ['Burpee', 'Full Body', 'Bodyweight', 'reps'],
  ['Mountain Climber', 'Core', 'Bodyweight', 'duration'],
  ['Jump Rope', 'Cardio', 'Other', 'duration'],
]

export const slug = (name: string) =>
  'x-' + name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Full Body', 'Cardio']
export const EQUIPMENT = ['Dumbbell', 'Barbell', 'Kettlebell', 'Cable', 'Machine', 'Bodyweight', 'Band', 'Other']

export function seedExercises(): Exercise[] {
  return LIBRARY.map(([name, muscle, equipment, type = 'weight_reps', video]) => ({
    id: slug(name),
    name,
    muscle,
    equipment,
    type,
    video,
    updatedAt: SEED_TIME,
  }))
}

// ---- Dumbbell Comeback Plan -------------------------------------------------

export const PLAN_FOLDER = 'Dumbbell Comeback'
export const PLAN_PHASES = [
  { n: 1, name: 'Rebuild', weeks: [1, 3], note: 'Week 1: 2 sets · Weeks 2–3: 3 sets · 10–12 reps · 3–4 reps in reserve' },
  { n: 2, name: 'Build', weeks: [4, 6], note: '3 sets · 8–10 reps · 2–3 reps in reserve' },
  { n: 3, name: 'Strength', weeks: [7, 9], note: 'Pair 1: 4 × 6–8 · Pairs 2–3: 3 × 8–12 · Rest 75–90 s after pair 1' },
  { n: 4, name: 'Peak', weeks: [10, 12], note: 'Pair 1: 4 × 5–8 · Pairs 2–3: 3 × 8–10 · Week 12: test pair 1' },
]

// [exercise name, target, note, sets]
type Slot = [string, string, string?, number?]
type Day = { pairs: [Slot, Slot][]; heavyRest?: number }

const PLAN: Record<string, Day> = {
  '1A': {
    pairs: [
      [['Goblet Squat', '10–12'], ['One-Arm Dumbbell Row', '10–12 / side', 'Staggered stance, free hand on knee']],
      [['Dumbbell Floor Press', '10–12', 'Neutral grip'], ['Glute Bridge', '12–15', 'Dumbbell on hips']],
      [['Dead Bug', '8 / side'], ['Prone Y-T Raise', '8 each', 'No weight']],
    ],
  },
  '1B': {
    pairs: [
      [['Dumbbell Romanian Deadlift', '10–12'], ['Bent-Over Dumbbell Row', '10–12', 'Both arms']],
      [['Half-Kneeling One-Arm Press', '10 / side', 'Neutral grip, light, pain-free range only'], ['Reverse Lunge', '8 / side', 'Bodyweight']],
      [['Side Plank', '20–30 s / side', 'Knees down is fine'], ['Bird Dog', '8 / side']],
    ],
  },
  '2A': {
    pairs: [
      [['Goblet Squat', '8–10', '1 s pause at bottom'], ['One-Arm Dumbbell Row', '8–10 / side']],
      [['Dumbbell Floor Press', '8–10', 'Two dumbbells'], ['Single-Leg Glute Bridge', '10 / side']],
      [['Rear Delt Fly', '12–15', 'Bent over, light'], ['Dead Bug', '8 / side', 'Holding one dumbbell']],
    ],
  },
  '2B': {
    pairs: [
      [['Dumbbell Romanian Deadlift', '8–10'], ['Bent-Over Dumbbell Row', '8–10', 'Both arms']],
      [['Dumbbell Split Squat', '8–10 / side'], ['Half-Kneeling One-Arm Press', '8–10 / side']],
      [['Hammer Curl', '10–12'], ['Floor Skull Crusher', '10–12']],
    ],
  },
  '3A': {
    heavyRest: 90,
    pairs: [
      [['Dumbbell Floor Press', '6–8', '2 s pause on the floor', 4], ['One-Arm Dumbbell Row', '6–8 / side', 'Heavy', 4]],
      [['Dumbbell Front Squat', '8–10', 'Dumbbells on shoulders'], ['Reverse Lunge', '8 / side', 'With dumbbells']],
      [['Prone Y-T Raise', '10 each', '1–2 kg'], ['Plank Dumbbell Drag', '8 / side']],
    ],
  },
  '3B': {
    heavyRest: 90,
    pairs: [
      [['Dumbbell Romanian Deadlift', '6–8', 'Heavy', 4], ['Bent-Over Dumbbell Row', '6–8', 'Both arms', 4]],
      [['Bulgarian Split Squat', '8 / side', 'Back foot on a sturdy chair or sofa'], ['Standing One-Arm Press', '8 / side', 'Stay half-kneeling if overhead still feels stiff']],
      [['Hammer Curl', '10–12'], ['Floor Skull Crusher', '10–12']],
    ],
  },
  '4A': {
    heavyRest: 90,
    pairs: [
      [['Dumbbell Floor Press', '5–8', 'Week 12: test your heaviest for clean reps', 4], ['One-Arm Dumbbell Row', '5–8 / side', undefined, 4]],
      [['Goblet Squat', '8–10', '3 s lowering (or front squat)'], ['Single-Leg Romanian Deadlift', '8 / side']],
      [['Rear Delt Fly', '12–15', 'Bent over'], ['Side Plank', '40 s / side']],
    ],
  },
  '4B': {
    heavyRest: 90,
    pairs: [
      [['Dumbbell Romanian Deadlift', '5–8', 'Week 12: test your heaviest for clean reps', 4], ['Bent-Over Dumbbell Row', '5–8', 'Both arms', 4]],
      [['Bulgarian Split Squat', '8 / side'], ['Push-Up', 'Stop 2 short of failure', 'Slow lowering']],
      [['Standing One-Arm Press', '8–10 / side', 'Standing or half-kneeling'], ['Hammer Curl', '10–12']],
    ],
  },
}

export const planRoutineId = (phase: number, day: 'A' | 'B') => `r-comeback-${phase}${day.toLowerCase()}`

const WARMUP_NOTE =
  'Warm-up (6 min): cat–cow, thread the needle, floor angels, scap push-ups, world’s greatest stretch, glute bridge + squat, ramp-up set. ' +
  'Superset pairs: do 1a then 1b, then rest. Cool down with 6 min of stretching.'

function emptySets(n: number, id: string): WSet[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${id}-s${i}`,
    kind: 'normal' as const,
    weight: null,
    reps: null,
    seconds: null,
    done: false,
  }))
}

export function seedRoutines(): Routine[] {
  const out: Routine[] = []
  let order = 0
  for (const phase of PLAN_PHASES) {
    for (const day of ['A', 'B'] as const) {
      const def = PLAN[`${phase.n}${day}`]
      const rid = planRoutineId(phase.n, day)
      const exercises: WExercise[] = []
      def.pairs.forEach((pair, pi) => {
        const group = `${rid}-p${pi + 1}`
        pair.forEach(([name, target, note, sets = 3], si) => {
          const id = `${rid}-e${pi + 1}${si ? 'b' : 'a'}`
          const rest = si === 0 ? 0 : pi === 0 && def.heavyRest ? def.heavyRest : 60
          exercises.push({ id, exerciseId: slug(name), notes: note || '', target, rest, superset: group, sets: emptySets(sets, id) })
        })
      })
      out.push({
        id: rid,
        name: `Phase ${phase.n} · Workout ${day}`,
        folder: PLAN_FOLDER,
        notes: WARMUP_NOTE,
        order: order++,
        exercises,
        updatedAt: SEED_TIME,
      })
    }
  }
  return out
}
