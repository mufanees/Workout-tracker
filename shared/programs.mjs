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

// ---- Buff Dudes 12 Week · 25 min ----
// The same program cut to the owner's hard time budget: 5 min warm-up, ~15 min lifting, 5 min cool-down.
// Written by hand with the fitting rules of shared/budget.mjs (fitToBudget), then checked with its estimate
// (qa/budget-test.mjs): each phase keeps its moves and split, sets go heavier for fewer reps (3 × 10 → 3 × 6–8,
// about 15% heavier, roughly the same weight × reps), non-competing pairs become supersets (push + pull,
// legs + core) with 60 s after each round, and what doesn't fit goes in this order: isolation, then core,
// then a compound that repeats on another day of the phase. No bench: floor presses, the sofa or a sturdy
// chair where a bench helped.

const BD25 = 'Buff Dudes 12 Week · 25 min'
const BD25_WARMUP = ['Jump Rope · 2 min', "World's Greatest Stretch · 30 s / side", 'Arm Circles · 45 s', 'Cat Stretch · 45 s']
const BD25_COOLDOWN = ["Child's Pose · 60 s", 'Hamstring Stretch · 30 s / side', 'Chest And Front Of Shoulder Stretch · 30 s / side', 'Intermediate Hip Flexor and Quad Stretch · 30 s / side']
const BD25_NOTE = 'Two supersets: do A1 then A2, rest 60 s (up to 75 if you need it), 3 rounds; then the same for B. Heavier than the original: pick a weight you could lift about 2 more times than the top of the range.'
const HEAVY = 'Heavier than for 10: about 15% more. '
// [library name, sets, reps, superset ('A' | 'B'), notes?, extra?]
const ss = (name, sets, reps, superset, notes = '', extra = {}) => ({
  name,
  sets,
  reps: String(reps),
  notes,
  equipment: /plank|crunch|superman|wiper|roll-?out/i.test(name) ? 'Bodyweight' : 'Dumbbell',
  superset,
  rest: 60,
  ...extra,
})
const bd25Day = (folder, name, exercises, notes = '') => ({ folder, name, notes: [notes, BD25_NOTE].filter(Boolean).join(' '), warmup: BD25_WARMUP, cooldown: BD25_COOLDOWN, budget: 25, exercises })

const Q1 = 'Phase 1 · Full Body (weeks 1–3)'
const Q2 = 'Phase 2 · Full Body Plus (weeks 4–6)'
const Q3 = 'Phase 3 · Upper/Lower (weeks 7–9)'
const Q4 = 'Phase 4 · Classic Split (weeks 10–12)'

const BUFF_DUDES_25 = {
  program: BD25,
  routines: [
    bd25Day(Q1, 'Day 1 · Full Body', [
      ss('Dumbbell Floor Press', 3, '6–8', 'A', HEAVY + 'The original’s bench press, on the floor'),
      ss('Bent-Over Dumbbell Row', 3, '6–8', 'A', HEAVY),
      ss('Goblet Squat', 3, '6–8', 'B', HEAVY + 'Heaviest dumbbell, slow on the way down'),
      ss('Dumbbell Roll-Out', 3, 10, 'B', 'Core: roll outs'),
    ], 'Shoulder press is on days 2 and 3.'),
    bd25Day(Q1, 'Day 2 · Full Body', [
      ss('Dumbbell Shoulder Press', 3, '6–8', 'A', HEAVY + 'Seated on a chair or standing'),
      ss('Bent Over Two-Dumbbell Row With Palms In', 3, '6–8', 'A', HEAVY + 'The original’s prone row, without the bench'),
      ss('Farmer Squat', 3, '6–8', 'B', HEAVY + 'Dumbbells at your sides'),
      ss('Twisting Plank', 3, '6 / side', 'B', 'Core: twisting planks'),
    ], 'Incline press needs a bench: floor press is on days 1 and 3.'),
    bd25Day(Q1, 'Day 3 · Full Body', [
      ss('Dumbbell Floor Press', 3, '6–8', 'A', 'Alternating: one arm, then the other (the original’s single arm press)'),
      ss('One-Arm Dumbbell Row', 3, '5–6 / side', 'A', HEAVY + 'Free hand on the sofa or a chair'),
      ss('Dumbbell Step Ups', 3, '5–6 / side', 'B', 'A sturdy step, stair or chair'),
      ss('Otis-Up', 2, 8, 'B', 'Core: Otis ups, 2 hard sets', { equipment: 'Other' }),
    ], 'Single arm shoulder press: on day 2 as the two-arm press.'),

    bd25Day(Q2, 'Day 1 · Full Body + Iso', [
      ss('Dumbbell Floor Press', 3, '5–7', 'A', 'Heavier than the original 4 × 8'),
      ss('Commando Row', 3, '6–8', 'A', 'Rows from a plank: core too'),
      ss('Dumbbell Thruster', 3, '6–8', 'B', 'Squat thrusters'),
      ss('Superman Lift', 3, 12, 'B', "Core: superman's"),
    ], 'Isolation (skull crushers, curls) left out to fit 25 min: add 2 sets each on a day with time to spare.'),
    bd25Day(Q2, 'Day 2 · Full Body + Iso', [
      ss('Close-Grip Dumbbell Press', 3, '5–7', 'A', 'On the floor'),
      ss('Bent-Over Dumbbell Row', 3, '5–7', 'A', 'Forehead on the sofa arm if your back needs it'),
      ss('Overhead Dumbbell Split Squat', 3, '6 / side', 'B'),
      ss('Windshield Wiper', 3, '5 / side', 'B', 'Core: windshield wipers'),
    ], 'Scott press, pull overs and around the worlds left out to fit 25 min.'),
    bd25Day(Q2, 'Day 3 · Full Body + Iso', [
      ss('Dumbbell Push Press', 3, '5–7', 'A'),
      ss('Bent Over Two-Dumbbell Row', 3, '6–8', 'A', 'High row: elbows wide, pull to the chest (the original’s incline high row, no bench)'),
      ss('Dumbbell Jump Squat', 3, 6, 'B', 'Squat jumps, light dumbbells, land soft'),
      ss('Weighted Crunches', 3, 12, 'B', 'Core: hold a dumbbell on your chest', { equipment: 'Other' }),
    ], 'Incline press needs a bench (pressing is on days 1, 2 and 4); isolation left out to fit 25 min.'),
    bd25Day(Q2, 'Day 4 · Full Body + Iso', [
      ss('Standing Alternating Dumbbell Press', 3, '6–8', 'A', 'Alternating shoulder press'),
      ss('Bent-Over Dumbbell Row', 3, '6–8', 'A', 'Alternating: one arm, then the other'),
      ss('Dumbbell Box Squat', 3, '6–8', 'B', 'Sit back to a chair or the sofa edge'),
      ss('Reverse Crunch', 3, 12, 'B', 'Core', { equipment: 'Bodyweight' }),
    ], 'Isolation (shoulder extensions, flys) left out to fit 25 min.'),

    bd25Day(Q3, 'Day 1 · Lower', [
      ss('Sumo to Goblet Squat', 3, '6–8', 'A', HEAVY),
      ss('Russian Twist', 3, '6 / side', 'A', 'Core', { equipment: 'Dumbbell' }),
      ss('Dumbbell Romanian Deadlift', 3, '6–8', 'B', HEAVY + "RDL's"),
      ss('Standing Dumbbell Calf Raise', 2, '8–10', 'B', 'Slow, full stretch at the bottom'),
    ], 'Lower and upper days for more volume per muscle. Hip thrusts and walking lunges left out to fit 25 min.'),
    bd25Day(Q3, 'Day 2 · Upper', [
      ss('Dumbbell Floor Press', 3, '6–8', 'A', HEAVY + 'Wide to close: one rep wide, one close'),
      ss('Commando Row', 3, '6–8', 'A', HEAVY),
      ss('Dumbbell Hang Clean and Press', 3, '6–8', 'B', HEAVY),
      ss('Otis-Up', 3, 12, 'B', 'Core: hold a dumbbell', { equipment: 'Other' }),
    ], 'Pull overs and man makers left out to fit 25 min.'),
    bd25Day(Q3, 'Day 3 · Lower', [
      ss('Bulgarian Split Squat', 3, '5–6 / side', 'A', HEAVY + 'Back foot on the sofa or a chair'),
      ss('Superman Lift', 3, 8, 'A', "Core: superman's, 2 s hold at the top"),
      ss('Dumbbell Swing', 3, 10, 'B', 'Like a kettlebell swing: snap the hips'),
      ss("Farmer's Carry", 2, '40 s', 'B', 'Farmer walks: heaviest pair, walk the room', { type: 'duration', seconds: 40 }),
    ], 'Farmer squats, single leg RDLs and calf raises left out to fit 25 min.'),
    bd25Day(Q3, 'Day 4 · Upper', [
      ss('Dumbbell Floor Press', 3, '6–8', 'A', HEAVY),
      ss('Bent Over Two-Dumbbell Row With Palms In', 3, '6–8', 'A', HEAVY + 'Low to high: alternate a low row and a high row'),
      ss('Dumbbell Snatch', 3, '5 / side', 'B', 'Single arm snatch'),
      ss('Side Plank', 3, '30 s / side', 'B', 'Core', { seconds: 30, equipment: 'Bodyweight', type: 'duration' }),
    ], 'Around the worlds left out to fit 25 min.'),

    bd25Day(Q4, 'Day 1 · Legs', [
      ss('Dumbbell Front Squat', 3, '8–10', 'A', 'Heavier than for 12: about 15% more. Dumbbells on the shoulders'),
      ss('Accordion Crunch', 3, 10, 'A', 'Core'),
      ss('Dumbbell Romanian Deadlift', 3, '8–10', 'B', "Heavier than for 12: about 15% more. RDL's"),
      ss('Standing Dumbbell Calf Raise', 2, '10–12', 'B', '2 hard sets'),
    ], 'A body-part split, cut to the big moves: sumo deadlifts, jumping split squats and hamstring curls left out to fit 25 min.'),
    bd25Day(Q4, 'Day 2 · Back & Biceps', [
      ss('Bent-Over Dumbbell Row', 3, '8–10', 'A', 'Heavier than for 12: about 15% more. Low row: pull to the hips'),
      ss('Twisting Plank', 3, '6 / side', 'A', 'Core'),
      ss('Straight-Arm Dumbbell Pullover', 2, '8–10', 'B', 'On the floor. 2 hard sets'),
      ss('Hammer Curl', 2, '8–10', 'B', '2 hard sets'),
    ], 'One-arm rows, high rows and circular curls left out to fit 25 min.'),
    bd25Day(Q4, 'Day 3 · Chest & Triceps', [
      ss('Dumbbell Floor Press', 3, '8–10', 'A', 'Heavier than for 12: about 15% more. Twisting: palms in at the bottom, forward at the top'),
      ss('Dumbbell Roll-Out', 3, 10, 'A', 'Core: roll outs'),
      ss('Dumbbell Flyes', 2, '8–10', 'B', 'On the floor: underhand, palms toward your head. 2 hard sets'),
      ss('Lying Dumbbell Tricep Extension', 2, '8–10', 'B', 'Skull crushers, on the floor. 2 hard sets'),
    ], 'Close press, single arm press and kickbacks left out to fit 25 min.'),
    bd25Day(Q4, 'Day 4 · Shoulders & Traps', [
      ss('Dumbbell Hang Clean and Press', 3, '8–10', 'A', 'Heavier than for 12: about 15% more'),
      ss('Reverse Flyes', 3, '10–12', 'A', 'Rear delts: bent over, light'),
      ss('Side Lateral Raise', 2, '10–12', 'B', '2 hard sets'),
      ss('Dumbbell Shrug', 2, '8–10', 'B', 'Heaviest pair. 2 hard sets'),
    ], 'Scott press, windmill press, front raises and crunches left out to fit 25 min.'),
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
    id: 'buff-dudes-25',
    name: BD25,
    by: 'Buff Dudes, cut to 25 min',
    weeks: 12,
    daysPerWeek: 4,
    minutes: 25,
    equipment: 'Dumbbells, the floor, a sofa or sturdy chair (no bench)',
    summary: 'Buff Dudes 12 Week inside a hard 25-minute budget: 5 min warm-up (jump rope, mobility), 15 min of lifting, 5 min of stretches. Same phases and moves, done the minimalist way: heavier weights for fewer reps (3 × 6–8 instead of 3 × 10, about the same weight × reps), two supersets a day (push + pull, legs + core) with 60–75 s after each round, and the isolation extras left out.',
    phases: [
      { folder: Q1, weeks: 3, days: 3, summary: 'Full body, 3 × 6–8 heavier, three days a week' },
      { folder: Q2, weeks: 3, days: 4, summary: 'Full body plus, 3 × 5–8, four days' },
      { folder: Q3, weeks: 3, days: 4, summary: 'Upper/lower split, 3 × 6–8, four days' },
      { folder: Q4, weeks: 3, days: 4, summary: 'Classic split cut to the big moves, 3 × 8–10, four days' },
    ],
    plan: BUFF_DUDES_25,
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
