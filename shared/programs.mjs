// Ready-made programs anyone can start from Train → Programs (or the coach can offer).
// Plain JS so the app and the server (coach) share one list. Routines use the plan-import format
// (shared/planImport.mjs) with a "program" name and a folder per phase; exercise names are exact
// library names (src/data/curated.json has the moves the library lacked), the program's own name for a
// move goes in the notes when it differs.

// [library name, sets, reps, notes?, extra?]
const ex = (name, sets, reps, notes = '', extra = {}) => ({ name, sets, reps: String(reps), notes, equipment: /plank|crunch|superman|wiper|otis/i.test(name) ? 'Bodyweight' : 'Dumbbell', rest: 75, ...extra })

const BD_WARMUP = ['Jump Rope · 5 min', 'Mobility drills · 10–15 min']
const BD_NOTE = 'Rest 60–90 s between sets.'
const BD = 'Buff Dudes 12 Week'

const bdDay = (folder, name, exercises, notes = '') => ({ folder, name, notes: [notes, BD_NOTE].filter(Boolean).join(' '), warmup: BD_WARMUP, cooldown: [], exercises })

const P1 = 'Phase 1 · Full Body (weeks 1–3)'
const P2 = 'Phase 2 · Full Body Plus (weeks 4–6)'
const P3 = 'Phase 3 · Upper/Lower (weeks 7–9)'
const P4 = 'Phase 4 · Classic Split (weeks 10–12)'

const BUFF_DUDES = {
  program: BD,
  routines: [
    bdDay(P1, 'Day 1 · Full Body', [
      ex('Goblet Squat', 3, 10),
      ex('Bent-Over Dumbbell Row', 3, 10, 'Bent over rows'),
      ex('Dumbbell Bench Press', 3, 10, 'No bench? Floor press'),
      ex('Dumbbell Shoulder Press', 3, 10),
      ex('Dumbbell Roll-Out', 3, 15, 'Core: roll outs'),
    ], 'Ease in: these weeks build the base. Lifting for a while and it feels light? Skip ahead and repeat later phases instead.'),
    bdDay(P1, 'Day 2 · Full Body', [
      ex('Farmer Squat', 3, 10, 'Dumbbells at your sides'),
      ex('Dumbbell Incline Row', 3, 10, 'Prone rows: chest on an incline bench'),
      ex('Incline Dumbbell Press', 3, 10),
      ex('Dumbbell Shoulder Press', 3, 10, 'Seated'),
      ex('Twisting Plank', 3, '15 / side', 'Core: twisting planks, 30 total'),
    ]),
    bdDay(P1, 'Day 3 · Full Body', [
      ex('One-Arm Dumbbell Row', 3, '10 / side', 'Single arm rows'),
      ex('Dumbbell Step Ups', 3, '10 / side'),
      ex('One Arm Dumbbell Bench Press', 3, '10 / side', 'Single arm press'),
      ex('Dumbbell One-Arm Shoulder Press', 3, '10 / side', 'Single arm shoulder press'),
      ex('Otis-Up', 3, 15, 'Core: Otis ups'),
    ]),

    bdDay(P2, 'Day 1 · Full Body + Iso', [
      ex('Dumbbell Thruster', 4, 8, 'Squat thrusters'),
      ex('Commando Row', 4, 8),
      ex('Dumbbell Floor Press', 4, 8),
      ex('Dumbbell Hang Clean and Press', 4, 8),
      ex('Lying Dumbbell Tricep Extension', 3, 10, 'Isolation: skull crushers'),
      ex('Dumbbell Bicep Curl', 3, 10, 'Supinating curls: turn the palm up as you curl'),
      ex('Superman Lift', 3, 15, "Core: superman's"),
    ], 'Adds isolation work and a fourth day.'),
    bdDay(P2, 'Day 2 · Full Body + Iso', [
      ex('Overhead Dumbbell Split Squat', 4, '8 / side'),
      ex('Bent-Over Dumbbell Row', 4, 8, 'Support your head on a bench'),
      ex('Close-Grip Dumbbell Press', 4, 8, 'Close bench press'),
      ex('Scott Press', 4, 8),
      ex('Straight-Arm Dumbbell Pullover', 3, 10, 'Isolation: pull overs'),
      ex('Around The Worlds', 3, 10, 'Isolation: around the world (chest)'),
      ex('Windshield Wiper', 3, '10 / side', 'Core: windshield wipers, 20 total'),
    ]),
    bdDay(P2, 'Day 3 · Full Body + Iso', [
      ex('Dumbbell Jump Squat', 4, 8, 'Squat jumps, weighted'),
      ex('Incline High Row', 4, 8, 'Incline “high rows”: chest on the bench, elbows wide'),
      ex('Incline Dumbbell Press', 4, 8, 'Twisting: palms in at the bottom, forward at the top'),
      ex('Dumbbell Push Press', 4, 8),
      ex('Standing One-Arm Dumbbell Triceps Extension', 3, '10 / side', 'Isolation: single arm French press'),
      ex('Concentration Curls', 3, '10 / side', 'Isolation'),
      ex('Weighted Crunches', 3, 15, 'Core: hold a dumbbell on your chest', { equipment: 'Other' }),
    ]),
    bdDay(P2, 'Day 4 · Full Body + Iso', [
      ex('Dumbbell Box Squat', 4, 8),
      ex('Bent-Over Dumbbell Row', 4, 8, 'Alternating: one arm, then the other'),
      ex('Incline Dumbbell Press', 4, 8, 'Alternating: one arm, then the other'),
      ex('Standing Alternating Dumbbell Press', 4, 8, 'Alternating shoulder press'),
      ex('Bent-Over Shoulder Extension', 3, 10, 'Isolation: bent over, straight arms back'),
      ex('Dumbbell Flyes', 3, 10, 'Isolation: underhand flys, palms toward your head'),
      ex('Reverse Crunch', 3, 15, 'Core', { equipment: 'Bodyweight' }),
    ]),

    bdDay(P3, 'Day 1 · Lower', [
      ex('Sumo to Goblet Squat', 4, 10),
      ex('Dumbbell Hip Thrust', 4, 10, 'Elevated: shoulders on a bench or sofa'),
      ex('Dumbbell Lunges', 4, '10 / side', 'Walking lunges'),
      ex('Dumbbell Romanian Deadlift', 4, 10, "RDL's"),
      ex('Standing Dumbbell Calf Raise', 4, 10),
      ex('Russian Twist', 3, '25 / side', 'Core: 50 total', { equipment: 'Dumbbell' }),
    ], 'Splits the body into lower and upper days for more volume per muscle.'),
    bdDay(P3, 'Day 2 · Upper', [
      ex('Commando Row', 4, 10),
      ex('Dumbbell Bench Press', 4, 10, 'Wide to close: one rep wide, one close'),
      ex('Dumbbell Hang Clean and Press', 4, 10),
      ex('Straight-Arm Dumbbell Pullover', 4, 10, 'Pull over'),
      ex('Dumbbell Man Maker', 3, 10, 'Man makers'),
      ex('Otis-Up', 3, 30, 'Core: weighted Otis ups, hold a dumbbell'),
    ]),
    bdDay(P3, 'Day 3 · Lower', [
      ex('Bulgarian Split Squat', 4, '10 / side'),
      ex('Dumbbell Swing', 4, 10, 'Like a kettlebell swing'),
      ex('Farmer Squat', 4, 10, 'Superset: farmer squats, then walk 50 m', { superset: '1', rest: 0 }),
      ex("Farmer's Carry", 4, '50 m', 'Farmer walks', { superset: '1', type: 'duration' }),
      ex('Single-Leg Romanian Deadlift', 4, '10 / side', "Single leg RDL's"),
      ex('Seated Dumbbell Calf Raise', 4, 10),
      ex('Superman Lift', 3, 20, "Core: superman's"),
    ]),
    bdDay(P3, 'Day 4 · Upper', [
      ex('Dumbbell Incline Row', 4, 10, 'Low to high: alternate a low row and a high row'),
      ex('Dumbbell Floor Press', 4, 10),
      ex('Dumbbell Snatch', 4, '10 / side', 'Single arm snatch'),
      ex('Around The Worlds', 4, 10, 'Chest'),
      ex('Side Plank', 3, '60 s / side', 'Core', { seconds: 60, equipment: 'Bodyweight' }),
    ]),

    bdDay(P4, 'Day 1 · Legs', [
      ex('Dumbbell Front Squat', 4, 12, 'Squats, dumbbells held on the shoulders'),
      ex('Dumbbell Sumo Deadlift', 4, 12),
      ex('Dumbbell Romanian Deadlift', 4, 12, "RDL's"),
      ex('Bulgarian Split Squat', 4, '12 / side', 'Jumping: explode up between reps'),
      ex('Lying Dumbbell Hamstring Curl', 4, 12),
      ex('Dumbbell Seated One-Leg Calf Raise', 4, '12 / side'),
      ex('Accordion Crunch', 3, 30, 'Core'),
    ], 'A classic bodybuilding split: each major muscle group gets its own day.'),
    bdDay(P4, 'Day 2 · Back & Biceps', [
      ex('Bent-Over Dumbbell Row', 4, 12, 'Low row: pull to the hips'),
      ex('Incline High Row', 4, 12),
      ex('One-Arm Dumbbell Row', 4, '12 / side', 'Close to wide: alternate grip width each rep'),
      ex('Straight-Arm Dumbbell Pullover', 4, 12, 'Pull overs'),
      ex('Hammer Curl', 3, 12),
      ex('Dumbbell Bicep Curl', 3, 12, 'Circular curls: circle out at the top'),
      ex('Twisting Plank', 3, '25 / side', 'Core: 50 total'),
    ]),
    bdDay(P4, 'Day 3 · Chest & Triceps', [
      ex('Dumbbell Bench Press', 4, 12, 'Twisting: palms in at the bottom, forward at the top'),
      ex('Close-Grip Dumbbell Press', 4, 12, 'Incline close press'),
      ex('Dumbbell Floor Press', 4, '12 / side', 'Single arm'),
      ex('Dumbbell Flyes', 4, 12, 'Underhand fly, palms toward your head'),
      ex('Lying Dumbbell Tricep Extension', 3, 12, 'Skull crushers'),
      ex('Tricep Dumbbell Kickback', 3, 12, 'Kickbacks'),
      ex('Dumbbell Roll-Out', 3, 25, 'Core: roll outs'),
    ]),
    bdDay(P4, 'Day 4 · Shoulders & Traps', [
      ex('Dumbbell Hang Clean and Press', 4, 12),
      ex('Scott Press', 4, 12),
      ex('Dumbbell Windmill Press', 4, '12 / side'),
      ex('Front Incline Dumbbell Raise', 4, 10, 'Superset: front raise', { superset: '1', rest: 0 }),
      ex('Side Lateral Raise', 4, 10, 'Superset: lateral raise', { superset: '1', rest: 0 }),
      ex('Reverse Flyes', 4, 10, 'Superset: reverse fly, then rest', { superset: '1' }),
      ex('Dumbbell Shrug', 4, 12, 'Seated shrugs'),
      ex('Weighted Crunches', 3, 25, 'Core: hold a dumbbell on your chest', { equipment: 'Other' }),
    ]),
  ],
}

export const PROGRAM_CATALOG = [
  {
    id: 'buff-dudes-12',
    name: BD,
    by: 'Buff Dudes',
    weeks: 12,
    daysPerWeek: 4,
    minutes: 60,
    equipment: 'Dumbbells and a bench (floor press works without one)',
    summary: 'Four 3-week phases: full body, full body plus isolation, upper/lower, then a classic body-part split. Jump rope and mobility before every session.',
    phases: [
      { folder: P1, weeks: 3, days: 3, summary: 'Full body, 3 × 10, three days a week' },
      { folder: P2, weeks: 3, days: 4, summary: 'Full body plus isolation, 4 × 8, four days' },
      { folder: P3, weeks: 3, days: 4, summary: 'Upper/lower split, 4 × 10, four days' },
      { folder: P4, weeks: 3, days: 4, summary: 'Classic split, 4 × 12, four days' },
    ],
    plan: BUFF_DUDES,
  },
  {
    id: 'comeback',
    name: 'Dumbbell Comeback',
    weeks: 12,
    daysPerWeek: 3,
    minutes: 30,
    equipment: 'Dumbbells, floor, a chair',
    summary: 'A gentle return to lifting: two alternating 30-minute workouts (A and B) in superset pairs, 3 days a week, from 10–12 reps toward heavier 5–8 rep work. Shoulder-friendly.',
    phases: [
      { folder: 'Phase 1 · Rebuild', weeks: 3, days: 3, summary: '10–12 reps, 3–4 in reserve' },
      { folder: 'Phase 2 · Build', weeks: 3, days: 3, summary: '8–10 reps, 2–3 in reserve' },
      { folder: 'Phase 3 · Strength', weeks: 3, days: 3, summary: 'Heavy first pair, 6–8 reps' },
      { folder: 'Phase 4 · Peak', weeks: 3, days: 3, summary: 'Heavy first pair, 5–8 reps; week 12 test' },
    ],
  },
]

/** One line per catalogue program, for the coach. */
export function programCatalogText() {
  return PROGRAM_CATALOG.map((p) => `- ${p.id}: "${p.name}"${p.by ? ` (${p.by})` : ''}, ${p.weeks} weeks, ${p.daysPerWeek} days a week, ${p.equipment}. ${p.summary} Phases: ${p.phases.map((ph) => `${ph.folder} (${ph.summary})`).join('; ')}`).join('\n')
}
