// The live coach's pure engine (shared/liveCoach.mjs): progression by effort, heart rate, equipment cap,
// rounding, reps targets without a weight, and time actions when behind.   node qa/live-coach-test.mjs
import * as LC from '../shared/liveCoach.mjs'
import { parseMap, guessRegions } from '../shared/fatigue.mjs'
import { kindOf } from '../shared/budget.mjs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

let failed = 0
const check = (ok, what, got) => {
  if (!ok) failed++
  console.log((ok ? 'PASS ' : 'FAIL ') + what + (got !== undefined && !ok ? `  (got ${JSON.stringify(got)})` : ''))
}

const T0 = 1_000_000_000_000
let n = 0
const set = (o = {}) => ({ id: 's' + ++n, kind: 'normal', weight: null, reps: null, seconds: null, done: false, ...o })
const ex = (o = {}) => ({
  id: 'e' + ++n,
  exerciseId: 'x-' + (o.name || 'lift').toLowerCase().replace(/\W+/g, '-'),
  name: 'Floor Press',
  muscle: 'Chest',
  equipment: 'Dumbbell',
  type: 'weight_reps',
  load: 'each',
  target: '8-10',
  rest: 75,
  superset: null,
  history: [],
  ...o,
  sets: o.sets || [set(), set(), set()],
})
const ctx = (exercises, o = {}) => ({ now: T0 + 10 * 60000, start: T0, exercises, budget: { total: 25, warmup: 5, cooldown: 5 }, equipment: { step: 1, max: 24 }, ...o })
const doneAt = (min, o) => set({ done: true, at: T0 + min * 60000, ...o })

// ---- progression within a session, by effort
{
  const e = ex({ sets: [doneAt(5, { weight: 12, reps: 10, rir: 3 }), set(), set()] })
  const p = LC.nextSetPlan(e, ctx([e]))
  check(p && p.kind === 'up' && p.weight === 13, '3+ left → up one dumbbell step (12 → 13)', p)
  check(p && p.setIds.length === 2 && /go 13 kg/.test(p.reason), 'suggestion covers the open sets with a reason', p?.reason)
}
{
  const e = ex({ sets: [doneAt(5, { weight: 20, reps: 9, rir: 3 }), set()] })
  const p = LC.nextSetPlan(e, ctx([e]))
  check(p && p.weight === 22, '3+ left at 20 kg → 22 (about +7.5%, rounded to 1 kg)', p?.weight)
}
{
  const e = ex({ sets: [doneAt(5, { weight: 12, reps: 9, rir: 1.5 }), set()] })
  const p = LC.nextSetPlan(e, ctx([e]))
  check(p && p.kind === 'keep' && p.weight === 12, '1–2 left → keep 12', p)
}
{
  const e = ex({ sets: [doneAt(5, { weight: 12, reps: 9, rir: 0 }), set()] })
  const p = LC.nextSetPlan(e, ctx([e]))
  check(p && p.weight === 12 && p.reps === 8, 'nothing left at 9 → same weight, aim for 8', p)
}
{
  const e = ex({ sets: [doneAt(5, { weight: 12, reps: 6 }), set()] })
  const p = LC.nextSetPlan(e, ctx([e]))
  check(p && p.kind === 'down' && p.weight === 11 && p.reps === 8, 'missed reps (6 of 8–10, no tap) → down to 11 × 8', p)
}
{
  const e = ex({ sets: [doneAt(5, { weight: 12, reps: 10, cr: 10 }), set({ cr: 10 })] })
  const p = LC.nextSetPlan(e, ctx([e]))
  check(p && p.kind === 'keep' && p.weight === 12, 'grey values accepted as planned (no tap, no HR) → keep, no runaway jumps', p)
}
{
  const e = ex({ sets: [doneAt(5, { weight: 12, reps: 13 }), set()] })
  const p = LC.nextSetPlan(e, ctx([e]))
  check(p && p.kind === 'up', 'beat the top of the range by 2+ with no tap → inferred 3+ left → up', p)
}
// heart rate as an effort signal
{
  const e = ex({ sets: [doneAt(5, { weight: 12, reps: 10, cr: 10 }), set({ cr: 10 })] })
  const hr = { samples: [[290, 112], [295, 115], [300, 116]], now: 100, max: 185 }
  const p = LC.nextSetPlan(e, ctx([e], { hr }))
  check(p && p.kind === 'up' && /HR only 116/.test(p.reason), 'planned reps with HR only 116 (63% of 185) → room to push: up', p?.reason)
  const hr2 = { samples: [[290, 160], [300, 172]], now: 150, max: 185 }
  const q = LC.nextSetPlan(e, ctx([e], { hr: hr2 }))
  check(q && q.kind === 'keep', 'HR peaked at 93% of max → not an up', q)
}

// ---- equipment cap and rounding
{
  const e = ex({ sets: [doneAt(5, { weight: 24, reps: 10, rir: 3 }), set()] })
  const p = LC.nextSetPlan(e, ctx([e]))
  check(p && p.weight === 24 && p.reps === 12, 'at 24 kg (the heaviest dumbbell) → reps up instead (12)', p)
  const e2 = ex({ sets: [doneAt(5, { weight: 23.5, reps: 10, rir: 3 }), set()] })
  check(LC.nextSetPlan(e2, ctx([e2])).weight === 24, 'never past the cap (23.5 → 24, not 25)')
  const e3 = ex({ sets: [doneAt(5, { weight: 18, reps: 10, rir: 3 }), set()] })
  check(LC.nextSetPlan(e3, ctx([e3], { equipment: { step: 1, max: 20 } })).weight === 19, 'equipmentMax from goals (20) respected, 1 kg steps')
  check(LC.loadUp(8, { step: 1, max: 24 }) === 9 && LC.loadDown(8, { step: 1, max: 24 }) === 7, 'light weights still move one full step')
  check(LC.roundTo(12.6, 1) === 13 && LC.roundTo(12.4, 2) === 12, 'rounding to the dumbbell step')
  check(LC.equipmentFor({ equipment: 'Barbell', load: 'total' }).step === 2.5, 'non-dumbbell loads use 2.5 kg steps, no dumbbell cap')
}

// ---- no weight → reps target
{
  const e = ex({ name: 'Push-Up', equipment: 'Bodyweight', bodyweight: true, load: null, target: '8-12', sets: [doneAt(5, { reps: 12, rir: 3 }), set()] })
  const p = LC.nextSetPlan(e, ctx([e]))
  check(p && p.weight == null && p.reps === 14 && /Bodyweight: aim for 14/.test(p.reason), 'bodyweight 3+ left → aim for 14', p)
  const f = ex({ name: 'Push-Up', equipment: 'Bodyweight', bodyweight: true, load: null, target: '12', history: [{ start: T0 - 3 * 86400000, sets: [{ kind: 'normal', weight: null, reps: 11 }] }] })
  const q = LC.firstSetPlan(f, ctx([f]))
  check(q && q.weight == null && q.reps === 12 && /Bodyweight: aim for 12/.test(q.reason), 'first set, bodyweight → "Bodyweight: aim for 12"', q)
  const g = ex({ name: 'Arnold Press', target: '10' })
  const r = LC.firstSetPlan(g, ctx([g]))
  check(r && r.weight == null && r.reps === 10, 'new lift with no history and no plan weight → a reps target only', r)
}

// ---- first set from last session (double progression) and today's form
{
  const hist = [{ start: T0 - 3 * 86400000, sets: [{ kind: 'normal', weight: 12, reps: 10 }, { kind: 'normal', weight: 12, reps: 10 }, { kind: 'normal', weight: 12, reps: 10, rir: 2 }] }]
  const e = ex({ history: hist })
  const p = LC.firstSetPlan(e, ctx([e]))
  check(p && p.weight === 13 && p.reps === 8 && /Hit 10s at 12 kg/.test(p.reason), 'top of the range on every set last time → 13 × 8', p)
  // today's form down: another lift is well below last time
  const other = ex({ name: 'Goblet Squat', load: 'one', history: [{ start: T0 - 3 * 86400000, sets: [{ kind: 'normal', weight: 20, reps: 10, rir: 2 }] }], sets: [doneAt(3, { weight: 16, reps: 8, rir: 0 }), doneAt(5, { weight: 16, reps: 8, rir: 0 })] })
  const q = LC.firstSetPlan(e, ctx([other, e]))
  check(q && q.weight === 12 && /a bit down/.test(q.reason), 'today’s form down → hold 12 instead of going up', q)
  const missed = ex({ history: [{ start: T0 - 86400000, sets: [{ kind: 'normal', weight: 14, reps: 7 }] }] })
  const m = LC.firstSetPlan(missed, ctx([missed]))
  check(m && m.weight === 14 && m.reps === 8, 'short of the range last time → stay at 14, own 8 first', m)
}

// ---- heart rate not recovered
{
  const e = ex({ sets: [doneAt(9, { weight: 12, reps: 10 }), set({ cr: 10 }), set()] })
  const restStart = T0 + 9 * 60000
  const now = restStart + 65000
  const hr = { samples: [[540, 160], [570, 158], [600, 156], [605, 155]], now: 155, max: 180, zones: [119, 145, 160, 175] }
  const c = ctx([e], { now, hr, restRun: { start: restStart, plan: 75, end: restStart + 75000 } })
  const st = LC.hrState(c)
  check(st && st.high && st.restAge === 65 && st.drop60 === 4, 'HR 155 of 180 (86%) at 65 s into rest: not recovered, dropped only 4', st)
  const plan = LC.nextSetPlan(e, c)
  const a = LC.hrAdvice(c, LC.timeStatus(c), plan)
  check(a && a.extend === 30 && /HR still 155 after 60 s: rest 30 s more or drop to 8 reps/.test(a.text), 'on time: rest 30 s more, or drop to 8 reps', a?.text)
  const late = { ...c, now: T0 + 19 * 60000, restRun: { start: T0 + 19 * 60000 - 65000, plan: 75, end: T0 + 19 * 60000 + 10000 }, hr: { ...hr, samples: [[1075, 160], [1080, 158], [1140, 155]] } }
  const b = LC.hrAdvice(late, LC.timeStatus(late), plan)
  check(b && b.extend === 0 && /no time for more rest, go 8 reps/.test(b.text), 'behind time: no extra rest, fewer reps instead', b?.text)
  const ok = { ...c, hr: { ...hr, now: 118 } }
  check(LC.hrAdvice(ok, LC.timeStatus(ok), plan) === null, 'recovered (118) → no HR advice')
}

// ---- adaptive rest and in-set cues
{
  const e = ex({ sets: [doneAt(19, { weight: 12, reps: 10 }), set(), set()] })
  const rs = T0 + 19 * 60000
  const base = { restRun: { start: rs, plan: 90, end: rs + 90000 }, hr: { samples: [[1140, 158], [1170, 140], [1180, 128]], now: 128, max: 185, zones: [119, 145, 160, 175] } }
  const late = ctx([e, ex({ name: 'Row', muscle: 'Back' })], { now: rs + 40000, ...base })
  const cue = LC.restCue(late)
  check(cue && cue.go && cue.saves === 50 && /Recovered \(HR 128, down 30\): go now, saves 0:50/.test(cue.text), 'recovered (128, down 30) and time is tight → go now, saves 0:50', cue?.text)
  const early = ctx([e], { now: T0 + 3 * 60000 + 40000, ...base, restRun: { start: T0 + 3 * 60000, plan: 90, end: T0 + 3 * 60000 + 90000 }, hr: { ...base.hr, samples: [[180, 158], [220, 128]] } })
  check(LC.restCue(early) === null, 'recovered but plenty of time → let the rest run')
  const notRec = ctx([e, ex({ name: 'Row', muscle: 'Back' })], { now: rs + 40000, ...base, hr: { ...base.hr, now: 150, samples: [[1140, 158], [1180, 150]] } })
  check(LC.restCue(notRec) === null, 'not recovered (150, down 8) → no early go')
  const plan = LC.nextSetPlan(e, notRec)
  const adv = LC.hrAdvice({ ...notRec, now: rs + 65000, hr: { ...notRec.hr, now: 162, samples: [[1140, 165], [1200, 162]] } }, { state: 'on', over: -300 }, plan)
  check(adv && /\(costs 0:30\)/.test(adv.text), 'extending the rest shows its time cost', adv?.text)
  const inSet = (bpm2) => ctx([e], { now: T0 + 10 * 60000, hr: { samples: [], now: bpm2, max: 185, zones: [119, 145, 160, 175] } })
  const since = T0 + 10 * 60000 - 25000
  check(/HR 178: finish this rep and rack it/.test(LC.setCue(inSet(178), { since })?.text || ''), 'during a set, HR 178 (96%) → finish this rep and rack it')
  check(/Still easy at 112: add 2 reps/.test(LC.setCue(inSet(112), { since })?.text || ''), 'during a set, HR 112 after 25 s → add 2 reps if you can')
  check(LC.setCue(inSet(112), { since, timed: true }) === null, 'a timed set never gets "more reps"')
  check(LC.setCue(inSet(140), { since }) === null && LC.setCue(inSet(178), { since: T0 + 10 * 60000 - 5000 }) === null, 'moderate HR, or under 10 s in → quiet')
}

// ---- time: on pace, no action
{
  const list = [ex({ name: 'Floor Press' }), ex({ name: 'Row', muscle: 'Back' })]
  const c = ctx(list, { now: T0 + 9 * 60000 })
  const t = LC.timeStatus(c)
  check(t.state === 'on' && LC.timeActions(c, t).length === 0, `6 sets at minute 9: on pace (projected ${Math.round(t.projected / 60)} of 25), no action`, t)
  check(/left · on pace/.test(LC.timeText(t)), 'status reads "… left · on pace"', LC.timeText(t))
}

// ---- time: behind, actions ranked; never the cool-down, never a compound before accessories
{
  const list = [
    ex({ name: 'Goblet Squat', muscle: 'Quadriceps', load: 'one', sets: [doneAt(8, { weight: 16, reps: 10 }), doneAt(10, { weight: 16, reps: 10 }), doneAt(12, { weight: 16, reps: 10 })] }),
    ex({ name: 'Floor Press', muscle: 'Chest' }),
    ex({ name: 'Bent-Over Row', muscle: 'Back' }),
    ex({ name: 'Lateral Raise', muscle: 'Shoulders', target: '12-15' }),
    ex({ name: 'Prone Y-T Raise', muscle: 'Shoulders', target: '10' }),
  ]
  const c = ctx(list, { now: T0 + 13 * 60000 })
  const t = LC.timeStatus(c)
  const acts = LC.timeActions(c, t)
  check(t.state === 'over' && t.over > 60, `behind: projected ${Math.round(t.projected / 60)} min of 25`, t)
  check(t.cooldown === 300, 'cool-down (5 min) is reserved in the projection')
  check(acts.length >= 3 && acts.every((a) => a.saves > 0), 'several ranked options', acts.map((a) => a.label))
  check(acts[0].saves >= t.over || acts.every((a) => a.saves < t.over), 'best option covers the overshoot when any does', acts.map((a) => [a.label, a.saves, t.over]))
  check(!acts.some((a) => /cool/i.test(a.label)), 'no option touches the cool-down')
  const skip = acts.filter((a) => a.kind === 'skip')
  check(skip.length === 1 && skip[0].label === 'Skip Prone Y-T Raise', 'skip offers the last accessory, not a compound', skip.map((a) => a.label))
  check(!acts.some((a) => a.kind === 'drop-sets' && a.weIds.some((id) => !/Raise/.test(list.find((e) => e.id === id).name))), 'set drops only from accessories while any are left')
  const ss = acts.find((a) => a.kind === 'superset')
  check(ss && ss.label === 'Superset Floor Press with Bent-Over Row', 'superset the next two not-started exercises', ss?.label)
  const order = acts.filter((a) => a.saves >= t.over).map((a) => a.cost)
  check(order.every((c2, i) => i === 0 || order[i - 1] <= c2), 'covering options ordered cheapest first', order)
  // just a little behind: shorter rests is enough and cheapest
  const c2 = ctx([ex({ name: 'Floor Press' }), ex({ name: 'Bent-Over Row', muscle: 'Back' }), ex({ name: 'Lateral Raise', muscle: 'Shoulders', target: '12-15' })].slice(0, 2), { now: T0 + 11.5 * 60000 })
  const t2 = LC.timeStatus(c2)
  const a2 = LC.timeActions(c2, t2)
  check(t2.state === 'over' && a2[0]?.kind === 'rest', `slightly behind (${Math.round(t2.over)} s): shorter rests first`, a2.map((a) => [a.label, a.saves]))
}
{
  // no accessories left: compounds may give way, and the cool-down still never does
  const list = [ex({ name: 'Floor Press', sets: [doneAt(20, { weight: 14, reps: 8 }), set(), set()] }), ex({ name: 'Bent-Over Row', muscle: 'Back' })]
  const c = ctx(list, { now: T0 + 22 * 60000 })
  const t = LC.timeStatus(c)
  const acts = LC.timeActions(c, t)
  check(t.state === 'out' || t.state === 'over', `no lifting time left at minute 22 (${t.state}, lifting ${t.lifting} s)`, t)
  check(acts.some((a) => a.kind === 'skip' && a.label === 'Skip Bent-Over Row'), 'skip the last compound only once no accessory is left', acts.map((a) => a.label))
}
{
  // supersets take one rest per round: the estimate drops
  const a = ex({ name: 'Floor Press' })
  const b = ex({ name: 'Bent-Over Row', muscle: 'Back' })
  const solo = LC.mainLeft(ctx([a, b])).secs
  const sa = { ...a, superset: 'ss1' }
  const sb = { ...b, superset: 'ss1' }
  const both = LC.mainLeft(ctx([sa, sb])).secs
  check(both < solo - 150, `superset estimate shorter (${both} s vs ${solo} s)`)
}

// ---- one estimate: the app's plan (timeplan.ts) scales the projection; Fit it at the start
{
  const list = [ex({ name: 'Floor Press' }), ex({ name: 'Bent-Over Row', muscle: 'Back' })]
  const c = ctx(list, { now: T0, plan: { warmup: 20, main: 28, cooldown: 0 }, warmup: { open: true, secs: 1200 }, cooldown: { done: false, secs: 0 }, canFit: true })
  const t = LC.timeStatus(c)
  check(Math.round(t.projected / 60) === 48, `at the start the projection is the app's estimate (48 min, got ${Math.round(t.projected / 60)})`)
  const b = LC.startBrief(c)
  check(b.action && b.action.kind === 'fit' && /Plan runs ~48 of 25 min: fit it to 25 min\?/.test(b.text), 'start: one nudge, "fit it to 25 min?"', b.text)
  const half = ctx([ex({ name: 'Floor Press', sets: [doneAt(20, { weight: 12, reps: 10 }), doneAt(22, { weight: 12, reps: 10 }), doneAt(24, { weight: 12, reps: 10 })] }), ex({ name: 'Bent-Over Row', muscle: 'Back' })], { now: T0 + 24 * 60000, plan: { warmup: 20, main: 28, cooldown: 0 }, warmup: { open: false }, cooldown: { done: false, secs: 0 } })
  const t2 = LC.timeStatus(half)
  check(t2.projected > 24 * 60 + 10 * 60 && t2.projected < 24 * 60 + 16 * 60, `halfway: about half the lifting estimate left (${Math.round((t2.projected - 24 * 60) / 60)} min)`)
}

// ---- lines
{
  const hist = [{ start: T0 - 3 * 86400000, sets: [{ kind: 'normal', weight: 12, reps: 10 }, { kind: 'normal', weight: 12, reps: 10 }] }]
  const list = [ex({ name: 'Floor Press', history: hist }), ex({ name: 'Row', muscle: 'Back' })]
  const b = LC.startBrief(ctx(list, { now: T0 }))
  check(/25 min: 2 exercises, 6 sets, 5 min cool-down\. Go 13 kg on Floor Press\./.test(b.text), 'start brief: the time plan and today’s focus', b.text)
  const line = LC.sessionLine(ctx(list, { now: T0 }))
  check(/^25 min: 2 exercises, go 13 kg on floor press today$/.test(line), 'Train line', line)
  const done = [ex({ name: 'Floor Press', history: hist, sets: [doneAt(5, { weight: 13, reps: 8 }), doneAt(7, { weight: 13, reps: 8 })] })]
  const v = LC.finishVerdict(ctx(done, { now: T0 + 18 * 60000 }))
  check(/^18 min, cool-down still fits in 25\. Up on Floor Press\./.test(v), 'finish verdict', v)
}
{
  const fmt = { w: (kg, e) => (e.load === 'each' ? `${kg * 2} kg` : `${kg} kg`) }
  const e = ex({ sets: [doneAt(5, { weight: 12, reps: 10, rir: 3 }), set()] })
  const p = LC.nextSetPlan(e, ctx([e], { fmt }))
  check(p.weight === 13 && /go 26 kg/.test(p.reason), 'numbers stay in stored units (13 per dumbbell); the words use the app’s formatter (26 kg total)', p)
}

// ---- fatigue: lighter on fatigued muscles
{
  const press = ex({ name: 'Dumbbell Floor Press', regions: { p: ['chest'], s: ['triceps', 'front_delts'] }, history: [{ start: T0 - 86400000, sets: [{ kind: 'normal', weight: 14, reps: 8 }] }] })
  const row = ex({ name: 'Bent-Over Row', muscle: 'Back', regions: { p: ['lats'], s: ['biceps'] } })
  const fatigue = { chest: { fatigue: 0.62, name: 'Chest' }, lats: { fatigue: 0.2, name: 'Back' } }
  const c = ctx([press, row], { now: T0, fatigue })
  const fa = LC.fatigueAdvice(c)
  check(fa && fa.weIds.length === 1 && fa.weIds[0] === press.id && /Chest still recovering \(62%\): go 10% lighter on Dumbbell Floor Press\?/.test(fa.text), 'fatigued chest (62%) → go 10% lighter on the press, not the row', fa?.text)
  const p = LC.lighter(LC.firstSetPlan(press, c), press, c)
  check(p.weight === 13 && p.kind === 'down', '14 kg → 13 kg (−10%, rounded, at least a step)', p)
  check(/^Chest still recovering: go lighter on Dumbbell Floor Press\. 25 min/.test(LC.sessionLine(c)), 'Train line mentions it', LC.sessionLine(c))
  check(LC.fatigueAdvice(ctx([press, row], { now: T0, fatigue: { chest: { fatigue: 0.3, name: 'Chest' } } })) === null, 'recovering under 50% → no warning')
}

// ---- swapping an exercise: alternatives from the real library
{
  const lib = [...require('../src/data/curated.json'), ...require('../src/data/library.json')]
  const map = require('../src/data/muscles.json')
  const slug = (name) => 'x-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const cands = lib.map(([name, muscle, equipment, type]) => {
    const id = slug(name)
    return { id, name, muscle, equipment, type, regions: map[id] ? parseMap(map[id]) : guessRegions(name, muscle), pattern: kindOf({ name, muscle }).pattern }
  })
  const target = cands.find((c) => c.name === 'Dumbbell Roll-Out')
  check(!!target, 'Dumbbell Roll-Out is in the library')
  const lack = LC.lackedTerms('Adjustable dumbbells to 24 kg, bands. No bench, no pull-up bar; no rollable dumbbells, no roller.')
  check(lack.includes('roll') && lack.includes('wheel') && lack.includes('bench') && !lack.includes('dumbbell'), 'lacked kit read from the profile (roll, wheel, bench; not dumbbells)', lack)
  const alts = LC.alternatives(target, cands, { lack, logged: new Set(), fatigue: {} })
  const names = alts.map((a) => a.name)
  check(alts.length >= 3 && alts.length <= 5, `3–5 alternatives: ${names.join(', ')}`)
  check(alts.every((a) => /dumbbell|bodyweight|band/i.test(a.equipment)), 'only kit they have (dumbbells, bodyweight, bands)', alts.map((a) => a.equipment))
  check(!names.some((n) => /roll|wheel|bench/i.test(n)), 'nothing that rolls, no ab wheel, no bench', names)
  check(alts.every((a) => map[a.id] ? parseMap(map[a.id]).p.includes('abs') : true), 'every one works the abs', names)
  check(names.some((n) => /Plank Dumbbell Drag|Dead Bug|Plank|Hollow/i.test(n)), 'ab-focused moves like Plank Dumbbell Drag / Dead Bug', names)
  const blind = LC.alternatives(target, cands, { limit: 50 })
  check(!blind.some((a) => /roll|wheel/i.test(a.name)), 'no profile yet: swapping a roll-out never offers another roll-out or the ab wheel (same kit)', blind.filter((a) => /roll|wheel/i.test(a.name)).map((a) => a.name))
  const noWheel = LC.alternatives(target, cands, { lack: LC.lackedTerms('no roller'), limit: 50 })
  check(!noWheel.some((a) => /ab wheel|roller|roll-?out/i.test(a.name)), '"no roller" also rules out the ab wheel', noWheel.filter((a) => /wheel|roll/i.test(a.name)).map((a) => a.name))
  const tired = LC.alternatives(target, cands, { lack, fatigue: { abs: 0.7 } })
  check(tired.length && tired.every((a) => /recovering/.test(a.why)), 'a fatigued main muscle is flagged in the reason', tired.map((a) => a.why))
  const press = cands.find((c) => c.name === 'Dumbbell Bench Press')
  const pa = LC.alternatives(press, cands, { lack, logged: new Set([slug('Dumbbell Floor Press')]) })
  check(pa[0] && /Floor Press/.test(pa[0].name), `no bench: Dumbbell Bench Press → ${pa[0]?.name} first`, pa.map((a) => a.name))
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
