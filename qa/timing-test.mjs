// Unit checks for shared/timing.mjs (the measured set / rest / workout times).
// Run: node qa/timing-test.mjs
// It replays a workout the way src/workout.ts drives the core: ticks (logTick / logLine),
// rests starting (startRest) and ending (endRestRun: ran out, Skip, a set timer started).
import { exerciseTimes, lineTick, paceStats, restEndMark, settle, tickTiming, untickAnchor, untickSet, workoutTiming } from '../shared/timing.mjs'

let pass = 0
let fail = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`)
}

const S = 1000
const T0 = 1_700_000_000_000
const t = (s) => T0 + s * S

function workout() {
  const set = (id, kind = 'normal') => ({ id, kind, weight: 16, reps: 10, seconds: null, done: false })
  return {
    id: 'w1',
    name: 'Test',
    start: t(0),
    end: null,
    checkAt: {},
    checks: {},
    mark: null,
    restRun: null,
    exercises: [
      { id: 'e1', exerciseId: 'x-goblet-squat', sets: [set('a1'), set('a2'), set('a3')] },
      { id: 'e2', exerciseId: 'x-press', superset: 'ss', sets: [set('b1'), set('b2')] },
      { id: 'e3', exerciseId: 'x-row', superset: 'ss', sets: [set('c1'), set('c2')] },
      { id: 'e4', exerciseId: 'x-plank', sets: [set('d1')] },
    ],
  }
}
const find = (w, id) => w.exercises.flatMap((e) => e.sets).find((s) => s.id === id)
const timingOf = (s) => ({ work: s.work, rested: s.rested, restPlan: s.restPlan })

// the app's actions
const tick = (w, id, at, timedFrom = null) => {
  const r = tickTiming(w, at, timedFrom)
  Object.assign(find(w, id), { done: true }, r.set)
  w.mark = r.mark
  w.restRun = r.restRun
}
const line = (w, key, at) => {
  w.checks[key] = true
  w.checkAt[key] = at
  const r = lineTick(w, at)
  w.mark = r.mark
  w.restRun = r.restRun
}
const startRest = (w, at, secs) => (w.restRun = { start: at, plan: secs, end: at + secs * S })
const endRest = (w, at) => {
  if (!w.restRun) return
  w.mark = restEndMark(w.restRun, at)
  w.restRun = null
}

const w = workout()

// --- first set after the warm-up: its time starts at the last warm-up tick
line(w, 'w0', t(30))
line(w, 'w1', t(75))
tick(w, 'a1', t(120))
check('first set after warm-up: from the last warm-up tick', timingOf(find(w, 'a1')), { work: 45, rested: null, restPlan: null })
check('the tick records when', find(w, 'a1').at, t(120))

// --- rest, then idle, then tick: idle counts toward the set
startRest(w, t(120), 60)
endRest(w, t(180)) // timer ran out (armRest passes the scheduled end)
tick(w, 'a2', t(195)) // 15 s idle after the rest
check('rest then idle then tick', timingOf(find(w, 'a2')), { work: 15, rested: 60, restPlan: 60 })

// --- page frozen: the rest ran out while nothing ran; the tick settles it at the scheduled end
startRest(w, t(195), 60)
tick(w, 'a3', t(290)) // rest ended at 255, never handled
check('rest ran out while the page was frozen: ends at its scheduled end', timingOf(find(w, 'a3')), { work: 35, rested: 60, restPlan: 60 })

// --- Skip pressed late on a frozen page still can't end the rest after its scheduled end
check('a late rest-end is capped at the scheduled end', restEndMark({ start: t(0), plan: 60, end: t(60) }, t(90)), { at: t(60), kind: 'rest-end', rested: 60, plan: 60 })
check('settle keeps a running rest running', settle({ mark: null, restRun: { start: t(0), plan: 60, end: t(60) } }, t(30)).restRun != null, true)

// --- rest to the superset, skipped early, then the superset with no rest in between
startRest(w, t(290), 90)
endRest(w, t(330)) // Skip after 40 s
tick(w, 'b1', t(370))
check('skipped rest: rested is what was taken', timingOf(find(w, 'b1')), { work: 40, rested: 40, restPlan: 90 })
tick(w, 'c1', t(410)) // mid-superset: no rest, anchor = previous tick
check('superset with no rest: from the previous tick', timingOf(find(w, 'c1')), { work: 40, rested: null, restPlan: null })

// --- ticking while the rest is still running (started early): rest ends at the tick, work unknown
startRest(w, t(410), 90)
tick(w, 'b2', t(470))
check('ticked during a running rest', timingOf(find(w, 'b2')), { work: null, rested: 60, restPlan: 90 })
check('the running rest is closed by the tick', w.restRun, null)
tick(w, 'c2', t(500))
check('next superset set after that', timingOf(find(w, 'c2')), { work: 30, rested: null, restPlan: null })

// --- timed set via the set timer: starting the timer ends the rest; time = anchor to the timer's end
startRest(w, t(500), 60)
endRest(w, t(530)) // startSetTimer → stopRest
tick(w, 'd1', t(575), t(530)) // timer ran 45 s
check('timed set via the set timer', timingOf(find(w, 'd1')), { work: 45, rested: 30, restPlan: 60 })

// timed set when the rest was still marked as running (e.g. its timer state was lost): measured from the timer start
{
  const v = workout()
  v.mark = { at: t(0), kind: 'tick' }
  startRest(v, t(0), 90)
  tick(v, 'd1', t(80), t(40))
  check('timed set with the rest still running: rest ends at the timer start', timingOf(find(v, 'd1')), { work: 40, rested: 40, restPlan: 90 })
}

// --- no warm-up, no mark (an older workout in progress): from the workout start, else the latest tick
{
  const v = workout()
  tick(v, 'a1', t(50))
  check('first set with no warm-up: from the workout start', timingOf(find(v, 'a1')), { work: 50, rested: null, restPlan: null })
  const old = workout()
  old.checkAt = { w0: t(20) }
  find(old, 'a1').done = true
  find(old, 'a1').at = t(70)
  tick(old, 'a2', t(100))
  check('no mark: falls back to the latest tick', find(old, 'a2').work, 30)
}

// --- a warm-up line ticked after a rest ended keeps the rest for the next set
{
  const v = workout()
  startRest(v, t(0), 30)
  endRest(v, t(30))
  line(v, 'c0', t(40))
  tick(v, 'a1', t(60))
  check('rest carried past a checklist tick', timingOf(find(v, 'a1')), { work: 20, rested: 30, restPlan: 30 })
}

// --- untick clears the timing
{
  const s = untickSet({ ...find(w, 'a2') })
  check('untick clears at/work/rested/restPlan', [s.done, 'at' in s, 'work' in s, 'rested' in s, 'restPlan' in s], [false, false, false, false, false])
  check('untick keeps the values', [s.weight, s.reps], [16, 10])
}

// --- untick right after a tick, then tick again: timed from the same anchor as before
{
  const v = workout()
  startRest(v, t(0), 60)
  endRest(v, t(60))
  tick(v, 'a1', t(80))
  const back = untickAnchor(v, find(v, 'a1'))
  check('untick of the latest tick puts its anchor back', back && back.mark, { at: t(60), kind: 'rest-end', rested: 60, plan: 60 })
  v.mark = back.mark
  v.restRun = back.restRun
  Object.assign(find(v, 'a1'), untickSet(find(v, 'a1')))
  tick(v, 'a1', t(85))
  check('re-tick after an untick keeps the rest and the anchor', timingOf(find(v, 'a1')), { work: 25, rested: 60, restPlan: 60 })
  startRest(v, t(85), 60)
  tick(v, 'a2', t(100)) // during the rest
  const back2 = untickAnchor(v, find(v, 'a2'))
  check('untick of a set ticked during a rest: the rest runs again', back2 && back2.restRun, { start: t(85), plan: 60, end: t(145) })
  startRest(v, t(100), 60)
  check('no anchor change once a newer rest has started', untickAnchor(v, find(v, 'a2')), null)
}

// --- cool-down and finish: the summary adds up to the total
line(w, 'c0', t(600))
line(w, 'c1', t(640))
w.end = t(700)
const sum = workoutTiming(w)
check('summary parts', sum, { warmup: 75, work: 45 + 15 + 35 + 40 + 40 + 30 + 45, rest: 60 + 60 + 40 + 60 + 30, transition: 60, cooldown: 65, total: 700 }) // other = last cool-down tick → Finish
check('summary adds up', sum.warmup + sum.work + sum.rest + sum.transition + sum.cooldown, sum.total)

const ex = exerciseTimes(w)
const squat = ex.find((e) => e.weId === 'e1')
check('per exercise: sets, works, rests after them', [squat.sets, squat.works, squat.rests, squat.plans], [3, [45, 15, 35], [60, 60, 40], [60, 60, 90]])
check('per exercise: total = work + rests after', [squat.work, squat.rest, squat.total, squat.avg], [95, 160, 255, 32])
const press = ex.find((e) => e.weId === 'e2')
check('unknown work is left out of the average', [press.works, press.avg], [[40, null], 40])

// --- older workouts without ticks have no summary
check('no ticks, no summary', workoutTiming({ ...workout(), end: t(100) }), null)

// --- pace across workouts
const p = paceStats([{ ...w, timePlan: { budget: 10 } }], 0)
check('pace: seconds per set by exercise', p.exercises.find((e) => e.exerciseId === 'x-goblet-squat'), { exerciseId: 'x-goblet-squat', sets: 3, sessions: 1, avg: 32 })
check('pace: rest overrun vs plan', p.rest, { n: 5, overrun: Math.round((0 + 0 - 50 - 30 - 30) / 5), taken: 50, plan: 72 })
check('pace: idle per workout and budget', [p.transition, p.sessions[0].budget], [60, 10])

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
