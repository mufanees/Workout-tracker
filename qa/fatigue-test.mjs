// Muscle fatigue model checks: node qa/fatigue-test.mjs
import { readFileSync } from 'node:fs'
import {
  effortWeight,
  exerciseEfforts,
  fatigueFrom,
  FRESH_BELOW,
  guessRegions,
  halfLifeOf,
  inferRir,
  muscleStatus,
  musclesText,
  parseMap,
  parseTarget,
  REGION_IDS,
  SECONDARY,
  volumeLevel,
  workoutLoad,
} from '../shared/fatigue.mjs'
import { PROGRAM_CATALOG } from '../shared/programs.mjs'

const MAP = JSON.parse(readFileSync(new URL('../src/data/muscles.json', import.meta.url), 'utf8'))
const CURATED = JSON.parse(readFileSync(new URL('../src/data/curated.json', import.meta.url), 'utf8'))
const slug = (name) => 'x-' + name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const musclesOf = (id) => parseMap(MAP[id])

let pass = 0
let fail = 0
const ok = (cond, msg) => {
  if (cond) pass++
  else (fail++, console.log('FAIL', msg))
}
const near = (a, b, eps, msg) => ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`)

const H = 3600000
const NOW = Date.UTC(2026, 9, 10, 12)
let n = 0
const set = (reps, extra = {}) => ({ id: 's' + n++, kind: 'normal', weight: 20, reps, seconds: null, done: true, ...extra })
const ex = (exerciseId, sets, target = '') => ({ id: 'e' + n++, exerciseId, notes: '', target, rest: 90, superset: null, sets })
const workout = (hoursAgo, exercises) => ({ id: 'w' + n++, name: 'W', routineId: null, start: NOW - hoursAgo * H - 30 * 60000, end: NOW - hoursAgo * H, notes: '', exercises, updatedAt: 1 })

// ---- effort ----
ok(effortWeight(0) === 1 && effortWeight(1) === 1, 'RIR 0–1 counts as a full set')
near(effortWeight(3), 0.7, 1e-9, 'RIR 3 = 0.7 of a set')
ok(effortWeight(10) === 0.4, 'easy sets floor at 0.4')
near(effortWeight(null), 0.85, 1e-9, 'unknown effort = 2 RIR')
ok(JSON.stringify(parseTarget('10–12 / side')) === '[10,12]', 'parse "10–12 / side"')
ok(JSON.stringify(parseTarget('8 each')) === '[8,8]', 'parse "8 each"')
ok(parseTarget('20–30 s / side') === null, 'timed target is not reps')
ok(inferRir(8, [10, 12]) === 0.5 && inferRir(11, [10, 12]) === 2 && inferRir(14, [10, 12]) === 3 && inferRir(16, [10, 12]) === 4, 'infer RIR from reps vs target')
{
  const e = exerciseEfforts(ex('x-goblet-squat', [set(10), set(10), set(9, { rir: 0 }), set(10, { kind: 'warmup' }), set(10, { done: false })], '10–12'))
  ok(e.length === 3, 'warm-ups and unticked sets do not count')
  ok(e[2].rir === 0 && e[2].source === 'logged', 'logged RIR on the last set')
  ok(e[0].rir === 1 && e[1].rir === 1 && e[0].source === 'logged', 'effort tap carries back as one more in reserve')
  const f = exerciseEfforts(ex('x-goblet-squat', [set(8), set(11), set(16)], '10–12'))
  ok(f[0].rir === 0.5 && f[1].rir === 2 && f[2].rir === 4 && f[2].source === 'inferred', 'inferred from reps vs the target')
  ok(f[0].weight > f[1].weight && f[1].weight > f[2].weight, 'harder sets weigh more')
  const g = exerciseEfforts(ex('x-plank', [set(null, { seconds: 40 })], '30 s'))
  ok(g[0].source === 'default' && g[0].weight === 0.85, 'timed set uses the default effort')
}

// ---- primary / secondary ----
{
  const w = workout(0, [ex('x-dumbbell-bench-press', [set(10, { rir: 0 }), set(10, { rir: 0 }), set(10, { rir: 0 })])])
  const l = workoutLoad(w, musclesOf)
  near(l.chest.eff, 3, 1e-9, 'bench press: chest 3 hard sets')
  near(l.triceps.eff, 3 * SECONDARY, 1e-9, 'bench press: triceps half')
  near(l.front_delts.sets, 1.5, 1e-9, 'secondary plain sets count half')
  ok(!l.quads, 'bench press does not touch quads')
}

// ---- decay ----
{
  const sq = (h) => workout(h, [ex('x-goblet-squat', [set(10, { rir: 0 }), set(10, { rir: 0 }), set(10, { rir: 0 }), set(10, { rir: 0 })])])
  const s0 = muscleStatus([sq(0)], NOW, musclesOf)
  const hl = halfLifeOf('quads')
  const s1 = muscleStatus([sq(hl)], NOW, musclesOf)
  near(s0.quads.v, 4, 1e-9, '4 hard sets right after')
  near(s1.quads.v, 2, 1e-9, 'half left after one half-life')
  near(s0.quads.fatigue, fatigueFrom(4), 1e-9, 'fatigue = 1 - exp(-v/4)')
  ok(s0.quads.state === 'fatigued', '4 hard sets of quads: fatigued right after')
  ok(s0.quads.freshAt > NOW, 'fresh time in the future')
  const later = muscleStatus([sq(0)], s0.quads.freshAt, musclesOf)
  near(later.quads.fatigue, FRESH_BELOW, 1e-6, 'fresh exactly at freshAt')
  const s3 = muscleStatus([sq(24 * 5)], NOW, musclesOf)
  ok(s3.quads.state === 'fresh' && s3.quads.freshAt === null, 'fresh 5 days later')
  ok(halfLifeOf('biceps') < halfLifeOf('chest') && halfLifeOf('chest') < halfLifeOf('quads'), 'small muscles recover faster than big ones')
  const two = muscleStatus([sq(0), sq(48)], NOW, musclesOf)
  ok(two.quads.v > s0.quads.v, 'sessions stack')
  const future = muscleStatus([sq(-5)], NOW, musclesOf)
  ok(future.quads.v === 0, 'a workout in the future does not count')
  const big = workout(0, [ex('x-goblet-squat', Array.from({ length: 20 }, () => set(10, { rir: 0 })))])
  ok(muscleStatus([big], NOW, musclesOf).quads.v === 10, 'one session is capped at 10 effective sets')
}

// ---- weekly volume ----
{
  const ws = [
    workout(24, [ex('x-dumbbell-bench-press', [set(10), set(10), set(10)])]),
    workout(24 * 3, [ex('x-push-up', [set(15), set(15)])]),
    workout(24 * 8, [ex('x-dumbbell-bench-press', [set(10), set(10), set(10)])]),
  ]
  const st = muscleStatus(ws, NOW, musclesOf)
  ok(st.chest.weekSets === 5, `chest 5 sets in 7 days (got ${st.chest.weekSets})`)
  ok(st.triceps.weekSets === 2.5, `triceps 2.5 sets (got ${st.triceps.weekSets})`)
  ok(st.chest.top[0].exerciseId === 'x-dumbbell-bench-press', 'top exercise for chest')
  ok(st.chest.last === ws[0].end, 'last trained = latest workout end')
  ok(st.quads.weekSets === 0 && st.quads.last === null, 'untrained region')
  ok(volumeLevel(0, [6, 12]) === 0 && volumeLevel(2, [6, 12]) === 2 && volumeLevel(6, [6, 12]) === 4, 'volume levels vs target')
  const text = musclesText(st, NOW, (id) => id)
  ok(/Chest: \d+% \w+.*5 sets in 7 days \(target 6–12\)/.test(text), 'coach text has fatigue and sets')
  ok(/Not trained in 7 days: .*Quads/.test(text), 'coach text lists untrained regions')
}

// ---- mapping coverage ----
{
  const missing = []
  for (const [name] of CURATED) if (!musclesOf(slug(name)).p.length) missing.push(name)
  for (const p of PROGRAM_CATALOG) for (const r of p.plan?.routines || []) for (const e of r.exercises) if (!musclesOf(slug(e.name)).p.length) missing.push(`${p.id}: ${e.name}`)
  ok(missing.length === 0, `every curated and program exercise maps to a region; missing: ${missing.join(', ')}`)
  const all = Object.values(MAP).flatMap((v) => v.replace('|', ',').split(','))
  ok(all.every((r) => REGION_IDS.includes(r)), 'only known region ids in muscles.json')
  ok(REGION_IDS.every((r) => all.includes(r)), 'every region is used by some exercise')
  ok(musclesOf('x-side-lateral-raise').p[0] === 'side_delts' && musclesOf('x-reverse-flyes').p[0] === 'rear_delts' && musclesOf('x-dumbbell-shoulder-press').p[0] === 'front_delts', 'delt heads split')
  ok(!MAP['x-doorway-pec-stretch'], 'stretches map to nothing')
  ok(guessRegions('My Cable Lateral Raise', 'Shoulders').p[0] === 'side_delts', 'custom exercise guessed from its name')
  ok(guessRegions('Mystery move', 'Legs').p.includes('quads'), 'falls back to the muscle field')
  ok(guessRegions('Couch stretch', 'Mobility').p.length === 0, 'mobility guessed as nothing')
}

console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
