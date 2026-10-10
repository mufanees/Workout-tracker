// Builds src/data/muscles.json: exercise id → body regions it trains ("primary|secondary", region ids
// from shared/fatigue.mjs). Sources, in order: the hand map below (every curated, Comeback, Buff Dudes
// and rehab move, checked by hand), free-exercise-db's primaryMuscles/secondaryMuscles (public domain,
// https://github.com/yuhonas/free-exercise-db, the same file scripts/library.mjs reads), then keyword
// rules on the name and the app's muscle field (guessRegions). Stretches and cardio map to nothing.
// Usage: node scripts/muscles.mjs path/to/free-exercise-db/dist/exercises.json
import { readFileSync, writeFileSync } from 'node:fs'
import { formatMap, guessRegions, parseMap, regionsOfFedb } from '../shared/fatigue.mjs'
import { rehabLibraryRows } from '../shared/rehabKnowledge.mjs'

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const CURATED = read('../src/data/curated.json')
const LIBRARY = read('../src/data/library.json')
const fedbPath = process.argv[2]
const FEDB = fedbPath ? JSON.parse(readFileSync(fedbPath, 'utf8')) : []
if (!fedbPath) console.warn('No free-exercise-db file given: library rows fall back to keyword rules.')

// Same as slug() in src/seed.ts
const slug = (name) => 'x-' + name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Hand map: "primary|secondary". */
const HAND = {
  // curated (Comeback plan and common lifts)
  'Goblet Squat': 'quads,glutes|adductors,abs',
  'One-Arm Dumbbell Row': 'lats|rear_delts,biceps,traps,forearms',
  'Dumbbell Floor Press': 'chest,triceps|front_delts',
  'Glute Bridge': 'glutes|hamstrings',
  'Single-Leg Glute Bridge': 'glutes|hamstrings,abs',
  'Dead Bug': 'abs',
  'Prone Y-T Raise': 'rear_delts,traps|side_delts',
  'Dumbbell Romanian Deadlift': 'hamstrings,glutes|lower_back,forearms,traps',
  'Bent-Over Dumbbell Row': 'lats|rear_delts,biceps,traps,lower_back',
  'Half-Kneeling One-Arm Press': 'front_delts|side_delts,triceps,abs',
  'Standing One-Arm Press': 'front_delts|side_delts,triceps,abs',
  'Reverse Lunge': 'quads,glutes|adductors,hamstrings',
  'Side Plank': 'abs|glutes',
  'Bird Dog': 'abs,lower_back|glutes',
  'Rear Delt Fly': 'rear_delts|traps',
  'Dumbbell Split Squat': 'quads,glutes|adductors',
  'Hammer Curl': 'biceps,forearms',
  'Floor Skull Crusher': 'triceps',
  'Dumbbell Front Squat': 'quads|glutes,abs',
  'Plank Dumbbell Drag': 'abs|front_delts',
  'Bulgarian Split Squat': 'quads,glutes|adductors,hamstrings',
  'Single-Leg Romanian Deadlift': 'hamstrings,glutes|lower_back,abs',
  'Push-Up': 'chest|front_delts,triceps,abs',
  'Dumbbell Bench Press': 'chest|front_delts,triceps',
  'Incline Dumbbell Press': 'chest,front_delts|triceps',
  'Dumbbell Fly': 'chest|front_delts',
  'Bench Press': 'chest|front_delts,triceps',
  'Incline Bench Press': 'chest,front_delts|triceps',
  'Cable Fly': 'chest|front_delts',
  'Chest Dip': 'chest,triceps|front_delts',
  'Pull-Up': 'lats|biceps,rear_delts,forearms',
  'Chin-Up': 'lats,biceps|forearms',
  'Lat Pulldown': 'lats|biceps,rear_delts',
  'Seated Cable Row': 'lats|rear_delts,biceps,traps',
  'Barbell Row': 'lats|rear_delts,biceps,traps,lower_back',
  Deadlift: 'glutes,hamstrings,lower_back|quads,traps,lats,forearms',
  'Face Pull': 'rear_delts|traps,side_delts',
  'Dumbbell Shrug': 'traps|forearms',
  'Dumbbell Shoulder Press': 'front_delts|side_delts,triceps',
  'Arnold Press': 'front_delts|side_delts,triceps',
  'Overhead Press': 'front_delts|side_delts,triceps,abs',
  'Lateral Raise': 'side_delts|traps',
  'Front Raise': 'front_delts|side_delts',
  'Dumbbell Curl': 'biceps|forearms',
  'Incline Dumbbell Curl': 'biceps|forearms',
  'Concentration Curl': 'biceps',
  'Barbell Curl': 'biceps|forearms',
  'Overhead Triceps Extension': 'triceps',
  'Triceps Kickback': 'triceps',
  'Triceps Pushdown': 'triceps',
  'Close-Grip Push-Up': 'triceps,chest|front_delts',
  'Back Squat': 'quads,glutes|adductors,lower_back',
  'Front Squat': 'quads|glutes,abs',
  'Romanian Deadlift': 'hamstrings,glutes|lower_back,forearms',
  'Leg Press': 'quads,glutes|adductors',
  'Leg Extension': 'quads',
  'Lying Leg Curl': 'hamstrings|calves',
  'Walking Lunge': 'quads,glutes|adductors,hamstrings',
  'Step-Up': 'quads,glutes|hamstrings',
  'Sumo Squat': 'quads,glutes,adductors',
  'Standing Calf Raise': 'calves',
  'Hip Thrust': 'glutes|hamstrings',
  'Dumbbell Hip Thrust': 'glutes|hamstrings',
  'Kettlebell Swing': 'glutes,hamstrings|lower_back,abs,forearms',
  Plank: 'abs|front_delts',
  Crunch: 'abs',
  'Hanging Leg Raise': 'abs,adductors|forearms',
  'Russian Twist': 'abs',
  'Ab Wheel Rollout': 'abs|lats',
  'Hollow Hold': 'abs|adductors',
  "Farmer's Carry": 'forearms,traps|abs,calves',
  'Dumbbell Thruster': 'quads,front_delts|glutes,triceps,side_delts',
  Burpee: 'quads,chest|front_delts,triceps,abs',
  'Mountain Climber': 'abs|adductors,front_delts',
  'Jump Rope': 'calves',
  'Dumbbell Roll-Out': 'abs|lats',
  'Farmer Squat': 'quads,glutes|forearms,traps',
  'Twisting Plank': 'abs',
  'Commando Row': 'lats,abs|rear_delts,biceps,triceps',
  'Dumbbell Hang Clean and Press': 'front_delts,glutes|traps,hamstrings,quads,triceps,side_delts',
  'Superman Lift': 'lower_back|glutes,rear_delts',
  'Overhead Dumbbell Split Squat': 'quads,glutes|front_delts,abs,adductors',
  'Scott Press': 'front_delts,side_delts|triceps',
  'Windshield Wiper': 'abs|adductors',
  'Dumbbell Jump Squat': 'quads,glutes|calves',
  'Incline High Row': 'rear_delts,lats|traps,biceps',
  'Dumbbell Push Press': 'front_delts|triceps,quads,side_delts',
  'Dumbbell Box Squat': 'quads,glutes|adductors',
  'Bent-Over Shoulder Extension': 'rear_delts,lats|triceps',
  'Sumo to Goblet Squat': 'quads,glutes,adductors|lower_back',
  'Dumbbell Man Maker': 'chest,front_delts,quads|lats,triceps,glutes,abs',
  'Dumbbell Swing': 'glutes,hamstrings|lower_back,front_delts,abs',
  'Seated Dumbbell Calf Raise': 'calves',
  'Dumbbell Snatch': 'glutes,front_delts|hamstrings,quads,traps,side_delts',
  'Dumbbell Sumo Deadlift': 'glutes,adductors,quads|hamstrings,traps,forearms',
  'Lying Dumbbell Hamstring Curl': 'hamstrings',
  'Accordion Crunch': 'abs|adductors',
  'Dumbbell Windmill Press': 'front_delts,abs|side_delts,triceps',
  // Buff Dudes 12 Week moves that come from the library
  'Dumbbell Incline Row': 'lats,rear_delts|biceps,traps',
  'Dumbbell Step Ups': 'quads,glutes|hamstrings',
  'One Arm Dumbbell Bench Press': 'chest|front_delts,triceps,abs',
  'Dumbbell One-Arm Shoulder Press': 'front_delts|side_delts,triceps',
  'Otis-Up': 'abs|front_delts',
  'Lying Dumbbell Tricep Extension': 'triceps',
  'Dumbbell Bicep Curl': 'biceps|forearms',
  'Close-Grip Dumbbell Press': 'triceps,chest|front_delts',
  'Straight-Arm Dumbbell Pullover': 'lats,chest|triceps',
  'Around The Worlds': 'chest|front_delts',
  'Standing One-Arm Dumbbell Triceps Extension': 'triceps',
  'Concentration Curls': 'biceps',
  'Weighted Crunches': 'abs',
  'Standing Alternating Dumbbell Press': 'front_delts|side_delts,triceps',
  'Dumbbell Flyes': 'chest|front_delts',
  'Reverse Crunch': 'abs',
  'Dumbbell Lunges': 'quads,glutes|adductors,hamstrings',
  'Standing Dumbbell Calf Raise': 'calves',
  'Dumbbell Seated One-Leg Calf Raise': 'calves',
  'Tricep Dumbbell Kickback': 'triceps',
  'Front Incline Dumbbell Raise': 'front_delts',
  'Side Lateral Raise': 'side_delts|traps',
  'Reverse Flyes': 'rear_delts|traps',
  // rehab moves that load a muscle (the stretches map to nothing)
  'Scapular Setting': 'traps|rear_delts',
  'Wall Slide': 'traps|front_delts,side_delts',
  'Isometric External Rotation': 'rear_delts',
  'Side-Lying External Rotation': 'rear_delts',
  'Prone Y Raise': 'traps,rear_delts|side_delts',
  'McGill Curl-Up': 'abs',
  Clamshell: 'glutes',
  'Side-Lying Hip Abduction': 'glutes',
  'Adductor Squeeze': 'adductors',
  'Copenhagen Plank (Short Lever)': 'adductors|abs',
  'Spanish Squat': 'quads',
  'Wall Sit': 'quads|glutes',
  'Terminal Knee Extension': 'quads',
  'Eccentric Heel Drop': 'calves',
  'Calf Raise with Toe Towel': 'calves',
  'Single-Leg Balance': 'calves|glutes',
  'Toe Yoga': 'calves',
  'Isometric Wrist Extension': 'forearms',
  'Eccentric Wrist Extension': 'forearms',
  'Hip Airplane': 'glutes|hamstrings,abs',
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const fedbByName = new Map(FEDB.map((e) => [norm(e.name), e]))

function fromFedb(e) {
  if (e.category === 'stretching' || e.category === 'cardio') return { p: [], s: [] }
  const p = e.primaryMuscles.flatMap((m) => regionsOfFedb(m, e.name, 'p'))
  const s = e.secondaryMuscles.flatMap((m) => regionsOfFedb(m, e.name, 's'))
  // overhead presses also work the side delts
  if (p.includes('front_delts') && /press|push press|jerk/i.test(e.name) && !p.includes('chest')) s.push('side_delts')
  return { p, s }
}

const out = {}
const seen = new Set()
let hand = 0
let fedb = 0
let guess = 0
let none = 0
for (const [name, muscle] of [...CURATED, ...rehabLibraryRows(), ...LIBRARY]) {
  const id = slug(name)
  if (seen.has(id)) continue
  seen.add(id)
  let m
  if (HAND[name]) ((m = parseMap(HAND[name])), hand++)
  else if (muscle === 'Mobility' || muscle === 'Cardio') m = { p: [], s: [] }
  else if (fedbByName.has(norm(name))) ((m = fromFedb(fedbByName.get(norm(name)))), fedb++)
  else ((m = guessRegions(name, muscle)), guess++)
  if (!m.p.length && m.s.length) m = { p: m.s, s: [] }
  if (!m.p.length) {
    none++
    continue
  }
  out[id] = formatMap(m)
}
const missing = Object.keys(HAND).filter((n) => !seen.has(slug(n)))
if (missing.length) console.warn('Hand-mapped names not in the library:', missing.join(', '))
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(new URL('../src/data/muscles.json', import.meta.url), JSON.stringify(sorted, null, 0).replace(/","/g, '",\n"') + '\n')
console.log(`${Object.keys(out).length} exercises mapped (${hand} by hand, ${fedb} from free-exercise-db, ${guess} by keywords); ${none} stretches/cardio left out`)
