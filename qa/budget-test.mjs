// Time budget and total weights, without a browser: node qa/budget-test.mjs
// fitToBudget (shared/budget.mjs), the 25-minute Buff Dudes program, and the total/each weight conversions (src/util.ts).
import fs from 'node:fs'
import { budgetOf, estimateParts, fitLines, fitToBudget, heavierFor, kindOf, pairScore, plannedVolume, totalOf } from '../shared/budget.mjs'
import { resolvePlan } from '../shared/planImport.mjs'
import { PROGRAM_CATALOG } from '../shared/programs.mjs'
import { bindWeights, fmtSet, loadOf, LB, shownWeight, storedWeight, workoutVolume } from '../src/util.ts'

let pass = 0
let fail = 0
const ok = (cond, what, extra = '') => {
  if (cond) pass++
  else fail++
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`)
}

const root = new URL('..', import.meta.url).pathname
const rows = [...JSON.parse(fs.readFileSync(root + 'src/data/curated.json')), ...JSON.parse(fs.readFileSync(root + 'src/data/library.json'))]
const lib = rows.map((r, i) => ({ id: 'x' + i, name: r[0], muscle: r[1], equipment: r[2], type: r[3] || 'weight_reps', ...(r[5] ? { load: r[5] } : {}) }))
const byId = new Map(lib.map((e) => [e.id, e]))
const byName = (n) => lib.find((e) => e.name === n)
const ctx = { info: (id) => byId.get(id) }

// ---- a 45-minute routine ----
let sid = 0
const we = (name, sets, reps, weight, rest = 90, extra = {}) => {
  const ex = byName(name)
  if (!ex) throw new Error('not in library: ' + name)
  return { id: 'e' + ++sid, exerciseId: ex.id, notes: '', target: String(reps), rest, superset: null, sets: Array.from({ length: sets }, () => ({ id: 's' + ++sid, kind: 'normal', weight, reps: typeof reps === 'number' ? reps : null, seconds: null, done: false })), ...extra }
}
const long = {
  warmup: ['Jump Rope · 3 min', 'Cat Stretch · 60 s', 'Arm Circles · 60 s', "World's Greatest Stretch · 30 s / side"],
  cooldown: ["Child's Pose · 60 s", 'Hamstring Stretch · 30 s / side', 'Chest And Front Of Shoulder Stretch · 30 s / side', 'Cat Stretch · 60 s'],
  exercises: [
    we('Goblet Squat', 3, 10, 20),
    we('Dumbbell Floor Press', 3, 10, 12),
    we('Bent-Over Dumbbell Row', 3, 10, 12),
    we('Dumbbell Shoulder Press', 3, 10, 10),
    we('Dumbbell Bicep Curl', 3, 12, 8, 60),
    we('Dumbbell Roll-Out', 3, 12, null, 60),
  ],
}
const before = totalOf(estimateParts(long, ctx))
ok(before >= 40 && before <= 55, 'test routine is about 45 min', `${before} min`)
const fit = fitToBudget(long, 25, ctx)
console.log('  changes:\n' + fit.changes.map((c) => '    - ' + c).join('\n'))
ok(fit.fits && fit.after <= 25, 'fits 25 min', `${fit.before} → ${fit.after} min`)
ok(fit.after >= 18, 'uses the budget (not cut far below it)', `${fit.after} min`)
const role = (w) => kindOf(byId.get(w.exerciseId)).role
const kept = new Set(fit.routine.exercises.map((e) => e.id))
const dropped = long.exercises.filter((e) => !kept.has(e.id))
ok(!dropped.some((e) => role(e) === 'compound') || long.exercises.filter((e) => role(e) === 'isolation').every((e) => !kept.has(e.id)), 'never drops a compound while an isolation is still in', dropped.map((e) => byId.get(e.exerciseId).name).join(', ') || 'nothing dropped')
ok(long.exercises.filter((e) => role(e) === 'compound').every((e) => kept.has(e.id)), 'keeps every compound')
const compVol = (r) => plannedVolume({ exercises: r.exercises.filter((e) => role(e) === 'compound') })
const vc = compVol(fit.routine) / compVol(long)
ok(vc >= 0.9 && vc <= 1.1, 'compound weight × reps within 10%', `${Math.round(vc * 100)}%`)
// per exercise that kept its sets: heavier × fewer reps keeps weight × reps within 10%
const perEx = fit.routine.exercises.filter((e) => e.sets[0].weight).map((e) => {
  const o = long.exercises.find((x) => x.id === e.id)
  return o.sets.length === e.sets.length ? plannedVolume({ exercises: [e] }) / plannedVolume({ exercises: [o] }) : null
}).filter((x) => x != null)
ok(perEx.length > 0 && perEx.every((v) => v >= 0.9 && v <= 1.1), 'each heavier exercise keeps weight × reps within 10%', perEx.map((v) => Math.round(v * 100) + '%').join(' '))
const vt = plannedVolume(fit.routine) / plannedVolume(long)
console.log(`  whole routine: ${Math.round(vt * 100)}% of the weight × reps in ${fit.after} of ${fit.before} min`)
ok(fit.changes.length > 0 && fit.changes.every((c) => typeof c === 'string' && /^[A-Z]/.test(c) && c.length < 200 && !/undefined|NaN|null|\[object/.test(c)), 'changes are plain readable lines', `${fit.changes.length}`)
const sq = fit.routine.exercises.find((e) => byId.get(e.exerciseId).name === 'Goblet Squat')
ok(sq.target === '6–8' && sq.sets.every((s) => s.reps === 8) && sq.sets[0].weight === 23, 'Goblet Squat 3 × 10 @ 20 → 3 × 6–8 @ 23 (about +16%)', `${sq.target} @ ${sq.sets[0].weight}`)
const groups = new Map()
for (const e of fit.routine.exercises) if (e.superset) groups.set(e.superset, [...(groups.get(e.superset) || []), e])
ok(groups.size >= 2, 'pairs exercises into supersets', `${groups.size}`)
ok([...groups.values()].every((g) => g.length === 2 && pairScore(kindOf(byId.get(g[0].exerciseId)).pattern, kindOf(byId.get(g[1].exerciseId)).pattern) > 0), 'supersets never pair competing moves', [...groups.values()].map((g) => g.map((e) => byId.get(e.exerciseId).name).join(' + ')).join('; '))
ok([...groups.values()].every((g) => g.every((e) => e.rest >= 60 && e.rest <= 75)), 'superset rounds rest 60–75 s')
ok(long.exercises[0].sets[0].weight === 20 && long.exercises[0].target === '10', 'input routine untouched')

// already fits: nothing changes
const short = { warmup: ['Jump Rope · 2 min'], cooldown: ["Child's Pose · 60 s"], exercises: [we('Goblet Squat', 3, 8, 20), we('Dumbbell Floor Press', 3, 8, 12)] }
const f2 = fitToBudget(short, 25, ctx)
ok(f2.fits && f2.changes.length === 0, 'a routine that fits comes back unchanged')

// slow measured pace: still fits by cutting accessories first
const slow = fitToBudget(long, 25, { ...ctx, setSecs: () => 80, restOverrun: 20 })
const slowKept = new Set(slow.routine.exercises.map((e) => e.id))
ok(slow.fits, 'fits even at a slow measured pace', `${slow.before} → ${slow.after} min`)
ok(long.exercises.filter((e) => role(e) === 'compound').some((e) => slowKept.has(e.id)) && (!long.exercises.some((e) => role(e) === 'compound' && !slowKept.has(e.id)) || long.exercises.every((e) => role(e) !== 'isolation' || !slowKept.has(e.id))), 'slow pace: isolation goes before any compound')

// a live workout's sets (tw / tr placeholders) are fitted the same way
const live = structuredClone(long)
for (const e of live.exercises) for (const s of e.sets) Object.assign(s, { tw: s.weight, tr: s.reps, weight: null, reps: null })
const f3 = fitToBudget(live, 25, ctx)
const lsq = f3.routine.exercises.find((e) => byId.get(e.exerciseId).name === 'Goblet Squat')
ok(f3.fits && lsq.sets[0].tw === 23 && lsq.sets[0].tr === 8 && lsq.sets[0].weight == null, 'live sets: tw/tr adjusted, typed values left empty')

// pieces
const h = heavierFor(10)
ok(h.top === 8 && h.low === 6 && h.factor > 1.15 && h.factor <= 1.2, 'heavierFor(10) = 6–8 at about +16%', `${h.low}–${h.top} ×${h.factor.toFixed(3)}`)
ok(heavierFor(8) === null, 'heavierFor(8): already heavy, unchanged')
const wl = fitLines(['Jump Rope · 5 min', 'Mobility drills · 10–15 min'], 300)
ok(totalOf(estimateParts({ warmup: wl, exercises: [] }, ctx)) <= 6, 'Buff Dudes warm-up 20 min → about 5', wl.join(', '))
ok(budgetOf(undefined).total === 25 && budgetOf({ total: 30, warmup: 5, cooldown: 5 }).total === 30, 'budget defaults to 25 / 5 / 5')

// ---- the 25-minute Buff Dudes ----
const p25 = PROGRAM_CATALOG.find((p) => p.id === 'buff-dudes-25')
const p12 = PROGRAM_CATALOG.find((p) => p.id === 'buff-dudes-12')
ok(p25 && p25.minutes === 25 && p25.name === 'Buff Dudes 12 Week · 25 min', 'catalogue has Buff Dudes 12 Week · 25 min')
let n = 0
const res = resolvePlan(p25.plan, lib, () => 'id' + ++n)
ok(res.newExercises.length === 0 && res.matches.every((m) => m.from === m.to), 'every move is an exact library name', res.matches.filter((m) => m.from !== m.to).map((m) => `${m.from}→${m.to}`).join(', ') || `${res.matches.length} moves`)
const mins = res.routines.map((r) => totalOf(estimateParts(r, ctx)))
ok(mins.every((m) => m >= 20 && m <= 25), 'every workout estimates 20–25 min', mins.join(' '))
ok(res.routines.every((r) => estimateParts(r, ctx).warmup === 5 && estimateParts(r, ctx).cooldown === 5), '5 min warm-up and 5 min cool-down')
ok(p25.plan.routines.every((r) => r.warmup[0] === 'Jump Rope · 2 min' && r.warmup.every((l) => /\d+\s*(s|min)\b/.test(l)) && r.cooldown.every((l) => /\d+\s*(s|min)\b/.test(l))), 'warm-up starts with 2 min of jump rope; every line is timed')
ok(res.routines.every((r) => !r.exercises.some((e) => /bench|incline (dumbbell )?press|incline row|incline high/i.test(byId.get(e.exerciseId).name))), 'no bench moves')
ok(res.routines.every((r) => new Set(r.exercises.map((e) => e.superset)).size === 2 && r.exercises.every((e) => e.superset)), 'two supersets a day')
ok(p25.plan.routines.every((r) => r.budget === 25), 'routines carry a 25 min budget')
ok(res.routines.every((r) => fitToBudget(r, 25, ctx).changes.length === 0), 'fitToBudget leaves it as it is')
ok(p25.phases.map((x) => x.folder).join() === p12.phases.map((x) => x.folder).join(), 'same four phases as the original')
// the original is as it was
ok(p12.minutes === 60 && p12.plan.routines.length === 15 && p12.plan.routines[0].warmup.join() === 'Jump Rope · 5 min,Mobility drills · 10–15 min' && p12.plan.routines[0].exercises[0].reps === '10', 'original Buff Dudes unchanged')
// and the original fits 25 through fitToBudget, compounds kept ahead of isolation
n = 0
const orig = resolvePlan(p12.plan, lib, () => 'o' + ++n)
const fits = orig.routines.map((r) => fitToBudget(r, 25, ctx))
ok(fits.every((f) => f.fits), 'every original routine can be fitted to 25 min', fits.map((f) => `${f.before}→${f.after}`).join(' '))
ok(
  fits.every((f, i) => {
    const keptIds = new Set(f.routine.exercises.map((e) => e.id))
    const lost = orig.routines[i].exercises.filter((e) => !keptIds.has(e.id))
    return !lost.some((e) => role(e) === 'compound') || orig.routines[i].exercises.every((e) => role(e) !== 'isolation' || !keptIds.has(e.id))
  }),
  'fitting the original never drops a compound before an isolation',
)

// ---- total weights ----
const row = byName('Bent-Over Dumbbell Row')
const goblet = byName('Goblet Squat')
const rowKind = loadOf(row)
ok(rowKind === 'each' && loadOf(goblet) === 'one', 'row is a pair, goblet squat a single weight')
ok(shownWeight(row, 6, 'kg', 'total') === 12 && storedWeight(row, 12, 'kg', 'total') === 6, 'bent-over row: 12 total ↔ 6 per dumbbell')
ok(storedWeight(row, 13, 'kg', 'total') === 6.5, 'typing 13 total stores 6.5')
ok(shownWeight(row, 6, 'kg', 'each') === 6 && storedWeight(row, 6, 'kg', 'each') === 6, "'each' view shows and stores one dumbbell")
ok(shownWeight(goblet, 24, 'kg', 'total') === 24 && storedWeight(goblet, 24, 'kg', 'total') === 24, 'a single weight is never doubled')
let rt = true
for (let t = 0.5; t <= 60; t += 0.5) if (shownWeight(row, storedWeight(row, t, 'kg', 'total'), 'kg', 'total') !== t) rt = false
ok(rt, 'kg round trip for every 0.5 kg total from 0.5 to 60')
let rtl = true
for (let t = 1; t <= 130; t += 0.5) if (shownWeight(row, storedWeight(row, t, 'lb', 'total'), 'lb', 'total') !== t) rtl = (console.log('  lb miss', t), false)
ok(rtl, 'lb round trip for every 0.5 lb total from 1 to 130')
ok(shownWeight(row, 15 / LB, 'lb', 'total') === 30, '15 lb dumbbells show as 30 lb total')
bindWeights({ ex: (id) => byId.get(id), view: () => 'total', unit: () => 'kg' })
const w = { exercises: [{ exerciseId: row.id, sets: [{ kind: 'normal', weight: 6, reps: 10, done: true }] }, { exerciseId: goblet.id, sets: [{ kind: 'normal', weight: 20, reps: 10, done: true }] }] }
ok(workoutVolume(w) === 320, 'volume counts both dumbbells of a pair (6 × 10 × 2 + 20 × 10)', `${workoutVolume(w)}`)
bindWeights({ ex: (id) => byId.get(id), view: () => 'each', unit: () => 'kg' })
ok(workoutVolume(w) === 320, 'volume is the same in the each view')
ok(fmtSet({ kind: 'normal', weight: 6, reps: 8, seconds: null, done: true }, 'weight_reps', 'kg', row) === '6 kg × 8', 'each view: set reads 6 kg × 8')
bindWeights({ ex: (id) => byId.get(id), view: () => 'total', unit: () => 'kg' })
ok(fmtSet({ kind: 'normal', weight: 6, reps: 8, seconds: null, done: true }, 'weight_reps', 'kg', row) === '12 kg × 8', 'total view: set reads 12 kg × 8')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
