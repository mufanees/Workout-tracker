// The live coach's brain: after every tick it decides the next set's weight and reps, reads heart rate
// and the clock, and proposes the one change that keeps the workout inside its time budget.
// Pure functions (no app state, no network), shared by the app (src/liveCoach.ts) and the tests
// (qa/live-coach-test.mjs). Deterministic: the same state always gives the same advice, and every
// suggestion carries a one-line reason.
//
// Units: weights are STORED kg (one dumbbell for a pair); times are seconds unless named *Min.
//
// Rules of thumb (see also the tests):
// - Effort: the effort tap (reps in reserve) when there is one; otherwise inferred from reps vs the
//   target range and the planned reps, nudged by heart rate at the tick (peak ≥ 90% of max: harder;
//   under 65% with the reps done: easier) and by how fast the set went vs their usual pace.
// - Next set, same exercise: 3+ left → +5–10% (at least one dumbbell step); 1–2 left → keep;
//   nothing left or missed reps → reps target down, or −5–10% when below the range.
// - First set of an exercise: double progression from last session (top of the range on every set
//   → next step up, reps back to the bottom), held back when today's form is down; no history → a reps
//   target only.
// - Never above the heaviest dumbbell they own; rounded to the dumbbell step; no weight → reps target.
// - Heart rate: still ≥ 85% of max (or zone 4+) at the end of a rest → rest 30 s more, or, when behind
//   time, fewer reps.
// - Time: the total budget is a hard cut and the cool-down is protected. When the projected finish
//   passes the budget, options are ranked (shorter rests, the accessories' last sets, supersetting the
//   next two, skipping an accessory; compounds only once no accessory is left) and the cheapest one
//   that covers the overshoot is proposed.

export const DEFAULT_BUDGET = { total: 25, warmup: 5, cooldown: 5 }

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const working = (s) => s.kind !== 'warmup'
const r2 = (n) => Math.round(n * 100) / 100

/** "8-10", "8–10 / side", "10", "15 / side" → { lo, hi }; null for times ("30 s") or nothing. */
export function parseRange(target) {
  const t = String(target || '')
  if (/\d\s*(s|sec|secs|seconds?|min|mins|minutes?)\b/i.test(t)) return null
  const m = t.match(/(\d+)\s*(?:[–-]\s*(\d+))?/)
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : a
  return { lo: Math.min(a, b), hi: Math.max(a, b) }
}

/** Round to the nearest step (1 kg per dumbbell by default). */
export function roundTo(w, step = 1) {
  return r2(Math.round(w / step) * step)
}

/** The step and the cap for an exercise's stored weight. */
export function equipmentFor(ex, eq = {}) {
  const dumbbell = /dumbbell/i.test(ex.equipment || '') || ex.load === 'each'
  const step = eq.step || 1
  const max = isNum(eq.max) ? eq.max : 24
  if (!dumbbell) return { step: 2.5, max: Infinity }
  // stored as the total of a pair: two steps, two dumbbells
  if (ex.load === 'total') return { step: step * 2, max: max * 2 }
  return { step, max }
}

/** About +5–10%, at least one step, never past the cap. Returns w itself at the cap. */
export function loadUp(w, eq) {
  if (w >= eq.max) return w
  let r = roundTo(w * 1.075, eq.step)
  if (r <= w) r = r2(w + eq.step)
  if (r > w * 1.1 && r > w + eq.step) r = r2(w + eq.step)
  return Math.min(r, eq.max)
}

/** About −5–10%, at least one step, never below one step. */
export function loadDown(w, eq) {
  let r = roundTo(w * 0.925, eq.step)
  if (r >= w) r = r2(w - eq.step)
  if (r < w * 0.9 && r < w - eq.step) r = r2(w - eq.step)
  return Math.max(eq.step, r)
}

/** Heart rate around a moment: the peak in the 30 s before `atMs` (+10 s after). */
function hrAround(ctx, atMs, before = 30, after = 10) {
  const list = ctx.hr?.samples
  if (!list?.length || !isNum(atMs)) return null
  const t = (atMs - ctx.start) / 1000
  let peak = null
  for (const [sec, bpm] of list) if (sec >= t - before && sec <= t + after) peak = Math.max(peak ?? 0, bpm)
  return peak
}

/** The sample nearest a moment (within 10 s). */
function hrAt(ctx, atMs) {
  const list = ctx.hr?.samples
  if (!list?.length) return null
  const t = (atMs - ctx.start) / 1000
  let best = null
  for (const [sec, bpm] of list) if (Math.abs(sec - t) <= 10 && (!best || Math.abs(sec - t) < Math.abs(best[0] - t))) best = [sec, bpm]
  return best ? best[1] : null
}

/** "12 kg", or whatever the app passes for how this person reads weights. */
const fmtW = (ctx, kg, ex) => (ctx.fmt?.w ? ctx.fmt.w(kg, ex) : `${r2(kg)} kg`)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * How hard a done set was: { rir, source, why, missed }.
 * source: 'tap' (their effort tap), 'reps' (reps vs target), plus heart rate and pace nudges.
 */
export function effortOf(s, ex, ctx) {
  if (isNum(s.rir)) return { rir: s.rir, source: 'tap', why: s.rir >= 3 ? '3+ left' : s.rir >= 1 ? '1–2 left' : 'nothing left', missed: false }
  const range = parseRange(ex.target)
  const planned = isNum(s.cr) ? s.cr : isNum(s.tr) ? s.tr : range ? range.hi : null
  const hi = range ? range.hi : planned
  const lo = range ? range.lo : isNum(planned) ? Math.max(1, planned - 2) : null
  let rir = 1.5
  let why = ''
  let missed = false
  const reps = s.reps
  if (isNum(reps) && isNum(hi)) {
    if (reps >= hi + 2) (rir = 3), (why = `${reps} reps, past the top of the range`)
    else if (isNum(planned) && reps > planned) (rir = 2.5), (why = `${reps} reps, more than planned`)
    else if (reps >= (planned ?? hi)) rir = 2
    else if (isNum(lo) && reps >= lo) (rir = 1), (why = `${reps} reps, short of ${planned ?? hi}`)
    else (rir = 0), (missed = true), (why = `${reps} reps, under ${lo}`)
  }
  const notes = []
  const peak = hrAround(ctx, s.at)
  const max = ctx.hr?.max
  if (isNum(peak) && isNum(max) && max > 0) {
    if (peak >= 0.9 * max) (rir -= 1), notes.push(`HR hit ${peak}`)
    else if (peak < 0.65 * max && !missed) (rir += 1), notes.push(`HR only ${peak}`)
  }
  if (isNum(s.work) && isNum(ex.pace) && ex.pace > 0 && s.work <= 240 && !missed && s.work < ex.pace * 0.8) (rir += 0.5), notes.push('moved fast')
  rir = clamp(Math.round(rir * 2) / 2, 0, 4)
  const all = [why, ...notes].filter(Boolean)
  return { rir, source: notes.length ? 'reps+signals' : 'reps', why: all.join(', ') || 'as planned', missed }
}

const openWork = (ex) => ex.sets.filter((s) => working(s) && !s.done)
const doneWork = (ex) => ex.sets.filter((s) => working(s) && s.done)
const usesWeight = (ex) => ex.type === 'weight_reps' && !ex.bodyweight

/** The last done working set (by tick time, else position). */
function lastDone(ex) {
  const d = doneWork(ex)
  if (!d.length) return null
  return d.reduce((a, b) => ((b.at ?? 0) >= (a.at ?? 0) ? b : a))
}

/**
 * The next set of an exercise in progress: { weId, setIds, weight, reps, kind, reason }.
 * kind: 'up' | 'keep' | 'down' | 'reps'. Null when nothing is done yet or nothing is left.
 */
export function nextSetPlan(ex, ctx) {
  if (ex.type === 'duration') return null
  const open = openWork(ex)
  const last = lastDone(ex)
  if (!last || !open.length) return null
  const e = effortOf(last, ex, ctx)
  const range = parseRange(ex.target)
  const planned = isNum(open[0].cr) ? open[0].cr : isNum(last.cr) ? last.cr : range ? range.hi : last.reps
  const lo = range ? range.lo : null
  const base = { weId: ex.id, setIds: open.map((s) => s.id) }
  const why = e.source === 'tap' ? cap(e.why) : e.why === 'as planned' ? 'Right on plan' : cap(e.why)
  const W = last.weight
  if (usesWeight(ex) && isNum(W) && W > 0) {
    const eq = equipmentFor(ex, ctx.equipment)
    if (e.rir >= 3) {
      const up = loadUp(W, eq)
      if (up > W) return { ...base, weight: up, reps: planned ?? last.reps, kind: 'up', reason: `${why}: go ${fmtW(ctx, up, ex)}` }
      const reps = (last.reps ?? planned ?? 8) + 2
      return { ...base, weight: W, reps, kind: 'up', reason: `${why} at your heaviest (${fmtW(ctx, W, ex)}): aim for ${reps}` }
    }
    if (e.rir >= 1) {
      const reps = isNum(planned) ? (e.rir < 1.5 && isNum(last.reps) ? Math.max(last.reps, lo ?? 1) : planned) : last.reps
      return { ...base, weight: W, reps, kind: 'keep', reason: `${why}: stay at ${fmtW(ctx, W, ex)} × ${reps}` }
    }
    const done = last.reps ?? planned ?? 8
    if (e.missed || (isNum(lo) && done - 1 < lo)) {
      const down = loadDown(W, eq)
      const reps = lo ?? planned ?? done
      return { ...base, weight: down, reps, kind: 'down', reason: `${why}: drop to ${fmtW(ctx, down, ex)} × ${reps}` }
    }
    const reps = Math.max(lo ?? 1, done - 1)
    return { ...base, weight: W, reps, kind: 'down', reason: `${why}: stay at ${fmtW(ctx, W, ex)}, aim for ${reps}` }
  }
  // no weight: a reps target
  const done = last.reps ?? planned ?? 10
  const reps = e.rir >= 3 ? done + 2 : e.rir >= 1 ? Math.max(done, e.rir >= 2 ? (planned ?? done) : done) : Math.max(1, done - 2)
  const what = ex.bodyweight ? 'Bodyweight' : cap(e.why)
  return { ...base, weight: null, reps, kind: 'reps', reason: `${what}: aim for ${reps}` }
}

/** Today's form: the average ratio of today's best estimated set to last session's, per lift. */
export function formToday(ctx) {
  const ratios = []
  for (const ex of ctx.exercises) {
    if (!usesWeight(ex)) continue
    const today = doneWork(ex).filter((s) => isNum(s.weight) && s.weight > 0 && isNum(s.reps))
    const prev = (ex.history?.[0]?.sets || []).filter((s) => working(s) && isNum(s.weight) && s.weight > 0 && isNum(s.reps))
    if (!today.length || !prev.length) continue
    const best = (list, tap) => Math.max(...list.map((s) => s.weight * (1 + Math.min(12, s.reps + (tap(s) ?? 0)) / 30)))
    const t = best(today, (s) => effortOf(s, ex, ctx).rir)
    const p = best(prev, (s) => (isNum(s.rir) ? s.rir : 1.5))
    if (p > 0) ratios.push(t / p)
  }
  return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null
}

/** The first set of an exercise nobody has started yet, from last session and today's form. */
export function firstSetPlan(ex, ctx, form = formToday(ctx)) {
  if (ex.type === 'duration' || doneWork(ex).length) return null
  const open = openWork(ex)
  if (!open.length) return null
  const base = { weId: ex.id, setIds: open.map((s) => s.id) }
  const range = parseRange(ex.target)
  const hist = (ex.history || []).find((h) => h.sets.some((s) => working(s) && isNum(s.reps)))
  const sets = hist ? hist.sets.filter((s) => working(s) && isNum(s.reps)) : []
  const planReps = range ? range.hi : isNum(open[0].tr) ? open[0].tr : null
  const down = isNum(form) && form < 0.95
  if (!sets.length) {
    const reps = planReps ?? 10
    if (usesWeight(ex) && isNum(open[0].tw) && open[0].tw > 0) return { ...base, weight: open[0].tw, reps, kind: 'keep', reason: `From the plan: ${fmtW(ctx, open[0].tw, ex)} × ${reps}` }
    if (ex.bodyweight || !usesWeight(ex)) return { ...base, weight: null, reps, kind: 'reps', reason: `${ex.bodyweight ? 'Bodyweight' : 'First time'}: aim for ${reps}` }
    return { ...base, weight: null, reps, kind: 'reps', reason: `New lift: pick a weight you can do ${reps} with 2 left` }
  }
  const lastRir = [...sets].reverse().find((s) => isNum(s.rir))?.rir ?? null
  const weighted = sets.filter((s) => isNum(s.weight) && s.weight > 0)
  if (usesWeight(ex) && weighted.length) {
    const eq = equipmentFor(ex, ctx.equipment)
    const W = Math.min(Math.max(...weighted.map((s) => s.weight)), eq.max)
    const atW = weighted.filter((s) => s.weight >= W)
    const best = Math.max(...atW.map((s) => s.reps))
    const hi = range ? range.hi : planReps ?? best
    const lo = range ? range.lo : Math.max(1, hi - 2)
    const hitTop = weighted.every((s) => s.reps >= hi)
    const missed = weighted.some((s) => s.reps < lo) || lastRir === 0
    if (((hitTop && (lastRir == null || lastRir >= 1)) || (lastRir != null && lastRir >= 3)) && !down) {
      const up = loadUp(W, eq)
      if (up > W) {
        const why = lastRir != null && lastRir >= 3 && !hitTop ? `3+ left at ${fmtW(ctx, W, ex)} last time` : `Hit ${hi}s at ${fmtW(ctx, W, ex)} last time`
        return { ...base, weight: up, reps: lo, kind: 'up', reason: `${why}: start ${fmtW(ctx, up, ex)} × ${lo}` }
      }
      return { ...base, weight: W, reps: best + 1, kind: 'up', reason: `${fmtW(ctx, W, ex)} is your heaviest: aim for ${best + 1}` }
    }
    if (missed && down) {
      const d = loadDown(W, eq)
      return { ...base, weight: d, reps: lo, kind: 'down', reason: `Short last time and today's a bit down: ${fmtW(ctx, d, ex)} × ${lo}` }
    }
    if (missed) return { ...base, weight: W, reps: lo, kind: 'keep', reason: `Stay at ${fmtW(ctx, W, ex)}: own ${lo} reps first` }
    const reps = Math.min(hi, best + 1)
    if (down) return { ...base, weight: W, reps: Math.min(best, hi), kind: 'keep', reason: `Today's a bit down: hold ${fmtW(ctx, W, ex)} × ${Math.min(best, hi)}` }
    return { ...base, weight: W, reps, kind: 'keep', reason: `${fmtW(ctx, W, ex)}: beat ${best}, aim for ${reps}` }
  }
  const best = Math.max(...sets.map((s) => s.reps))
  const reps = !down && (lastRir == null || lastRir >= 1.5) ? best + 1 : best
  return { ...base, weight: null, reps, kind: 'reps', reason: `${ex.bodyweight ? 'Bodyweight' : 'Last time ' + best}: aim for ${reps}` }
}

// ---------------------------------------------------------------- time

const TRANSITION = 15 // setting up the next exercise
const SS_SWITCH = 10 // moving between superset members

/** Seconds one set of an exercise takes: their measured pace, else a guess from the reps. */
export function setSecs(ex, s) {
  if (isNum(ex.pace) && ex.pace > 0) return ex.pace
  if (ex.type === 'duration') return (s?.seconds ?? s?.ts ?? 40) + 5
  const reps = s?.cr ?? s?.tr ?? parseRange(ex.target)?.hi ?? 10
  return Math.min(90, reps * 3.5 + 8)
}

/** Consecutive exercises in the same superset form one block. */
export function groups(list) {
  const out = []
  for (const ex of list) {
    const prev = out[out.length - 1]
    if (prev && ex.superset && prev[0].superset === ex.superset) prev.push(ex)
    else out.push([ex])
  }
  return out
}

const restOf = (group, ctx) => {
  const planned = Math.max(...group.map((e) => e.rest || 0))
  return planned ? Math.max(0, planned + clamp(ctx.restOverrun || 0, -30, 60)) : 0
}

/**
 * The lifting still to do: { secs, rests: [{ secs, weIds }], sets: [{ weId, setId, secs, rest }] }.
 * A rest follows every round except the very last one of the workout.
 */
export function mainLeft(ctx, list = ctx.exercises) {
  const gs = groups(list).map((g) => ({ g, open: g.map((e) => openWork(e)) })).filter((x) => x.open.some((o) => o.length))
  let secs = 0
  const rests = []
  gs.forEach(({ g, open }, gi) => {
    const rounds = Math.max(...open.map((o) => o.length))
    const rest = restOf(g, ctx)
    const started = g.some((e) => doneWork(e).length)
    if (!started && gi > 0) secs += TRANSITION
    for (let r = 0; r < rounds; r++) {
      let members = 0
      g.forEach((e, k) => {
        const s = open[k][r]
        if (!s) return
        secs += setSecs(e, s)
        members++
      })
      if (members > 1) secs += SS_SWITCH * (members - 1)
      const lastRound = gi === gs.length - 1 && r === rounds - 1
      if (!lastRound && rest) {
        secs += rest
        rests.push({ secs: rest, weIds: g.map((e) => e.id) })
      }
    }
  })
  return { secs: Math.round(secs), rests }
}

/**
 * Where the clock stands: elapsed, left to the hard cut, projected finish and the overshoot (all s).
 * state: 'on' (on pace), 'over' (projected past the budget by more than a minute), 'ahead' (3+ min spare),
 * 'out' (no time left for lifting: only the cool-down is left).
 */
export function timeStatus(ctx) {
  const b = { ...DEFAULT_BUDGET, ...(ctx.budget || {}) }
  const total = b.total * 60
  const elapsed = Math.max(0, (ctx.now - ctx.start) / 1000)
  const anyDone = ctx.exercises.some((e) => doneWork(e).length)
  const warmupLeft = ctx.warmup?.open && !anyDone ? Math.max(0, Math.min(ctx.warmup.secs ?? b.warmup * 60, b.warmup * 60 - elapsed)) : 0
  const restLeft = ctx.restRun && ctx.now < ctx.restRun.end ? (ctx.restRun.end - ctx.now) / 1000 : 0
  const main = mainLeft(ctx)
  const cooldown = ctx.cooldown?.done ? 0 : b.cooldown * 60
  let projected = Math.round(elapsed + warmupLeft + restLeft + main.secs + cooldown)
  if (ctx.plan) {
    // the app's own estimate (src/timeplan.ts) at the start, so there's one number: the lifting left is
    // scaled to it, the warm-up and cool-down are its timed lines
    const all = mainLeft(ctx, ctx.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, done: false })) }))).secs
    const k = all > 0 ? (ctx.plan.main * 60) / all : 1
    const warm = ctx.warmup?.open && !anyDone ? (isNum(ctx.warmup.secs) ? ctx.warmup.secs : ctx.plan.warmup * 60) : 0
    const cool = ctx.cooldown?.done ? 0 : isNum(ctx.cooldown?.secs) ? ctx.cooldown.secs : ctx.plan.cooldown * 60
    projected = Math.round(elapsed + warm + restLeft + main.secs * k + cool)
  }
  const over = projected - total
  const left = Math.round(total - elapsed)
  const lifting = left - cooldown // time left for lifting before the cool-down must start
  const open = ctx.exercises.some((e) => openWork(e).length)
  const state = open && lifting <= 0 ? 'out' : over > 60 ? 'over' : over < -180 && open ? 'ahead' : 'on'
  return { total, elapsed: Math.round(elapsed), left, lifting, projected, over, state, main: main.secs, cooldown, warmupLeft: Math.round(warmupLeft), restLeft: Math.round(restLeft) }
}

const ACCESSORY = /curl|raise|fly|flye|kickback|extension|shrug|crunch|plank|roll-?out|superman|wiper|otis|twist|calf|pullover|around the world|\by-?t\b|face pull|lateral|reverse crunch|bird dog|dead bug/i
/** Isolation and core work: the first to give way when time is short. */
export function isAccessory(ex) {
  if (typeof ex.accessory === 'boolean') return ex.accessory
  return ACCESSORY.test(ex.name || '') || /biceps|triceps|abdominals|calves|forearms/i.test(ex.muscle || '')
}

const names = (list) => (list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`)
const mins = (s) => Math.max(1, Math.round(s / 60))

/**
 * Ways to get back inside the budget, best first: { id, kind, label, saves, cost, ...data }.
 * kind: 'rest' (restTo, weIds), 'drop-sets' (setIds), 'superset' (weIds), 'skip' (weIds).
 * Never touches the cool-down.
 */
export function timeActions(ctx, status = timeStatus(ctx)) {
  const over = status.over
  if (over <= 60 && status.state !== 'out') return []
  const need = Math.max(over, 60)
  const out = []
  const list = ctx.exercises
  const main = mainLeft(ctx)

  // 1. shorter rests
  const rests = main.rests.filter((r) => r.secs > 45)
  if (rests.length) {
    let to = Math.max(45, Math.floor((Math.min(...rests.map((r) => r.secs)) - need / rests.length) / 15) * 15)
    to = Math.min(to, Math.max(...rests.map((r) => r.secs)) - 15)
    const saves = Math.round(rests.reduce((a, r) => a + Math.max(0, r.secs - to), 0))
    const from = Math.max(...list.filter((e) => openWork(e).length && e.rest > to).map((e) => e.rest), 0)
    const weIds = list.filter((e) => openWork(e).length && e.rest > to).map((e) => e.id)
    if (saves >= 30 && weIds.length) out.push({ id: `rest-${to}`, kind: 'rest', restTo: to, weIds, saves, cost: 1, label: `Rest ${to} s instead of ${from}`, short: `rest ${to} s` })
  }

  const notStarted = (e) => !doneWork(e).length && openWork(e).length
  const setCost = (e, s) => setSecs(e, s) + restOf([e], ctx)

  // 2. the last set of each accessory that still has two or more sets in it
  const acc = list.filter((e) => isAccessory(e) && openWork(e).length && e.sets.filter(working).length >= 2)
  if (acc.length) {
    const setIds = acc.map((e) => openWork(e).at(-1).id)
    const saves = Math.round(acc.reduce((a, e) => a + setCost(e, openWork(e).at(-1)), 0))
    out.push({ id: `drop-${setIds.join(',')}`, kind: 'drop-sets', setIds, weIds: acc.map((e) => e.id), saves, cost: 2, label: `Drop the last set of ${names(acc.map((e) => e.name))}`, short: `drop the last set of ${names(acc.map((e) => e.name))}` })
  }

  // 3. superset the next two exercises nobody has started (not already in a superset)
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i]
    const b = list[i + 1]
    if (!notStarted(a) || !notStarted(b) || a.superset || b.superset) continue
    const rest = Math.max(restOf([a], ctx), restOf([b], ctx))
    if (!rest) continue
    const na = openWork(a).length
    const nb = openWork(b).length
    const saves = Math.round((na + nb - Math.max(na, nb)) * rest - Math.min(na, nb) * SS_SWITCH)
    const sameMuscle = (a.muscle && b.muscle && a.muscle === b.muscle) || (a.pattern && a.pattern === b.pattern && a.pattern !== 'other' && a.pattern !== 'core')
    if (saves >= 30 && !sameMuscle) out.push({ id: `ss-${a.id}-${b.id}`, kind: 'superset', weIds: [a.id, b.id], saves, cost: isAccessory(a) || isAccessory(b) ? 2.5 : 3, label: `Superset ${a.name} with ${b.name}`, short: `superset ${a.name} + ${b.name}` })
    break
  }

  // 4. skip an accessory nobody has started, the last one first
  const skippable = [...list].reverse().find((e) => notStarted(e) && isAccessory(e))
  if (skippable) {
    const saves = Math.round(openWork(skippable).reduce((a, s) => a + setCost(skippable, s), 0) + TRANSITION)
    out.push({ id: `skip-${skippable.id}`, kind: 'skip', weIds: [skippable.id], saves, cost: 3, label: `Skip ${skippable.name}`, short: `skip ${skippable.name}` })
  }

  // 5. compounds give way only once no accessory work is left to cut
  if (!list.some((e) => isAccessory(e) && openWork(e).length)) {
    const comp = list.filter((e) => openWork(e).length && e.sets.filter(working).length >= 3)
    if (comp.length) {
      const last = comp[comp.length - 1]
      const s = openWork(last).at(-1)
      out.push({ id: `drop-${s.id}`, kind: 'drop-sets', setIds: [s.id], weIds: [last.id], saves: Math.round(setCost(last, s)), cost: 4, label: `Drop the last set of ${last.name}`, short: `drop the last set of ${last.name}` })
    }
    const sk = [...list].reverse().find((e) => notStarted(e))
    if (sk && list.filter((e) => openWork(e).length).length > 1) {
      const saves = Math.round(openWork(sk).reduce((a, s) => a + setCost(sk, s), 0) + TRANSITION)
      out.push({ id: `skip-${sk.id}`, kind: 'skip', weIds: [sk.id], saves, cost: 5, label: `Skip ${sk.name}`, short: `skip ${sk.name}` })
    }
  }

  // the cheapest that covers the overshoot, then the rest by how much they save
  const covers = out.filter((a) => a.saves >= need).sort((a, b) => a.cost - b.cost || b.saves - a.saves)
  const rest = out.filter((a) => a.saves < need).sort((a, b) => b.saves - a.saves || a.cost - b.cost)
  return [...covers, ...rest]
}

// ---------------------------------------------------------------- heart rate

/**
 * Heart rate now and during the rest: { bpm, pct, zone, high, restAge, atRestStart, drop60 }.
 * high = at or above 85% of max, or zone 4+.
 */
export function hrState(ctx) {
  const h = ctx.hr
  if (!h || !isNum(h.now)) return null
  const zones = h.zones || [119, 145, 160, 175]
  let zone = 5
  for (let i = 0; i < 4; i++)
    if (h.now <= zones[i]) {
      zone = i + 1
      break
    }
  const max = h.max || zones[3] + 10
  const pct = h.now / max
  const high = pct >= 0.85 || zone >= 4
  let restAge = null
  let atRestStart = null
  let drop60 = null
  if (ctx.restRun && ctx.now < ctx.restRun.end + 5000) {
    restAge = Math.round((ctx.now - ctx.restRun.start) / 1000)
    atRestStart = hrAt(ctx, ctx.restRun.start) ?? hrAround(ctx, ctx.restRun.start, 15, 5)
    const at60 = restAge >= 60 ? hrAt(ctx, ctx.restRun.start + 60000) : null
    if (isNum(atRestStart) && isNum(at60)) drop60 = atRestStart - at60
  }
  return { bpm: h.now, pct: r2(pct), zone, max, high, restAge, atRestStart, drop60 }
}

/**
 * Advice when heart rate is still up during a rest (from 60 s in): null, or
 * { text, extend (s to add to the rest), reps (lower reps target for the next set when time is short) }.
 */
export function hrAdvice(ctx, status = timeStatus(ctx), plan = null) {
  const hr = hrState(ctx)
  if (!hr || !hr.high || hr.restAge == null || hr.restAge < 60) return null
  const behind = status.state === 'over' || status.state === 'out'
  const reps = plan && isNum(plan.reps) ? Math.max(1, plan.reps - 2) : null
  const lead = `HR still ${hr.bpm} after ${hr.restAge >= 90 ? `${Math.round(hr.restAge / 15) * 15} s` : '60 s'}`
  if (behind && reps) return { text: `${lead}: no time for more rest, go ${reps} reps`, extend: 0, reps }
  return { text: `${lead}: rest 30 s more${reps ? ` or drop to ${reps} reps` : ''} (costs 0:30)`, extend: 30, reps, cost: 30 }
}

/**
 * Adaptive rest, from 20 s into a rest: recovered early (HR at or under the top of zone 2, or down 25+
 * since the rest began) while time is tight → go now, with what it saves. Null otherwise.
 * Returns { text, go: true, saves }. Never changes the timer itself: the app offers it as a tap.
 */
export function restCue(ctx, status = timeStatus(ctx)) {
  const hr = hrState(ctx)
  if (!hr || hr.restAge == null || hr.restAge < 20 || !ctx.restRun) return null
  const left = Math.round((ctx.restRun.end - ctx.now) / 1000)
  if (left < 15) return null
  const z2top = (ctx.hr.zones || [119, 145])[1]
  const dropped = isNum(hr.atRestStart) ? hr.atRestStart - hr.bpm : null
  const recovered = hr.bpm <= z2top || (isNum(dropped) && dropped >= 25)
  const tight = status.state === 'over' || status.state === 'out' || status.over > -60
  if (!recovered || !tight) return null
  return { text: `Recovered (HR ${hr.bpm}${isNum(dropped) && dropped > 0 ? `, down ${dropped}` : ''}): go now, saves ${clock(left)}`, go: true, saves: left }
}

/**
 * A cue while a set is under way (no rest running, 10+ s since the set's start anchor): heart rate
 * very high (≥ 92% of max or above zone 4) → rack it after this rep; still easy (< 65% of max, 20+ s
 * in) → a couple more reps if they're there. `timed`: a timed set's timer is running (no "more reps").
 * Returns { key, text } (key = which cue, so the app says each once per set) or null.
 */
export function setCue(ctx, o = {}) {
  const hr = hrState(ctx)
  if (!hr || (ctx.restRun && ctx.now < ctx.restRun.end)) return null
  const since = isNum(o.since) ? (ctx.now - o.since) / 1000 : null
  if (since == null || since < 10 || since > 240) return null
  const zones = ctx.hr.zones || [119, 145, 160, 175]
  if (hr.pct >= 0.92 || hr.bpm > zones[3]) return { key: 'high', text: o.timed ? `HR ${hr.bpm}: stop if your form slips` : `HR ${hr.bpm}: finish this rep and rack it` }
  if (!o.timed && since >= 20 && hr.pct < 0.65) return { key: 'easy', text: `Still easy at ${hr.bpm}: add 2 reps if you can` }
  return null
}

// ---------------------------------------------------------------- everything at once

/** Plans for every exercise: the next set for ones in progress, the first set for the rest. */
export function plansFor(ctx) {
  const form = formToday(ctx)
  const out = []
  for (const ex of ctx.exercises) {
    const p = doneWork(ex).length ? nextSetPlan(ex, ctx) : firstSetPlan(ex, ctx, form)
    if (p) out.push(p)
  }
  return out
}

/** One pass of the engine: plans, the clock, ranked time actions and heart rate. */
export function liveCoach(ctx) {
  const plans = plansFor(ctx)
  const time = timeStatus(ctx)
  const actions = timeActions(ctx, time)
  return { plans, time, actions, best: actions[0] || null, hr: hrState(ctx), form: formToday(ctx) }
}

/** "12:40" */
export function clock(secs) {
  const t = Math.max(0, Math.round(Math.abs(secs)))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** "12:40 left · on pace", "3 min over", "Lifting time is up". */
export function timeText(t) {
  if (t.left <= 0) return `${mins(-t.left)} min past the budget`
  if (t.state === 'out') return `${clock(t.left)} left · cool-down time`
  if (t.state === 'over') return `${clock(t.left)} left · ${mins(t.over)} min over`
  if (t.state === 'ahead') return `${clock(t.left)} left · ${mins(-t.over)} min spare`
  return `${clock(t.left)} left · on pace`
}

/** The opening line: the time plan and today's focus. */
export function startBrief(ctx) {
  const r = liveCoach(ctx)
  const b = { ...DEFAULT_BUDGET, ...(ctx.budget || {}) }
  const lifts = ctx.exercises.filter((e) => e.sets.some(working))
  const sets = lifts.reduce((a, e) => a + e.sets.filter(working).length, 0)
  const ups = r.plans.filter((p) => p.kind === 'up' && p.weight != null)
  const ex = (p) => ctx.exercises.find((e) => e.id === p.weId)
  const focus = ups.length ? `go ${fmtW(ctx, ups[0].weight, ex(ups[0]))} on ${ex(ups[0]).name}` : r.plans[0] ? `${ex(r.plans[0]).name} first: ${r.plans[0].weight != null ? fmtW(ctx, r.plans[0].weight, ex(r.plans[0])) + ' × ' : ''}${r.plans[0].reps}` : ''
  const warm = ctx.warmup?.open ? `warm-up ${b.warmup} min max, ` : ''
  const over = r.time.state === 'over'
  // the app can fit the whole session to the budget in one go (src/timeplan.ts fitWorkout): offer that first
  const fitAll = over && ctx.canFit ? { id: 'fit', kind: 'fit', label: `Fit it to ${b.total} min`, short: `fit it to ${b.total} min`, saves: r.time.over, cost: 0, weIds: [] } : null
  const best = fitAll || r.best
  const fit = over ? `Plan runs ~${mins(r.time.projected)} of ${b.total} min${best ? `: ${best.short}?` : '.'}` : `${b.total} min: ${warm}${lifts.length} exercises, ${sets} sets, ${b.cooldown} min cool-down.`
  return { text: [fit, focus ? cap(focus) + '.' : ''].filter(Boolean).join(' '), action: over ? best : null, result: r }
}

/** The one-line verdict once lifting is done. `prevTop` = exerciseId → last session's top weight. */
export function finishVerdict(ctx) {
  const t = timeStatus(ctx)
  const b = { ...DEFAULT_BUDGET, ...(ctx.budget || {}) }
  const used = mins(t.elapsed)
  const ups = []
  for (const ex of ctx.exercises) {
    const prev = (ex.history?.[0]?.sets || []).filter((s) => working(s) && isNum(s.weight))
    const today = doneWork(ex).filter((s) => isNum(s.weight))
    if (!prev.length || !today.length) continue
    const pTop = Math.max(...prev.map((s) => s.weight))
    const tTop = Math.max(...today.map((s) => s.weight))
    const pReps = Math.max(...prev.filter((s) => s.weight === pTop).map((s) => s.reps || 0))
    const tReps = Math.max(...today.filter((s) => s.weight === tTop).map((s) => s.reps || 0))
    if (tTop > pTop || (tTop === pTop && tReps > pReps)) ups.push(ex.name)
  }
  const skipped = ctx.exercises.filter((e) => openWork(e).length).length
  const time = used <= b.total - b.cooldown ? `${used} min, cool-down still fits in ${b.total}` : used <= b.total ? `${used} min, inside ${b.total}` : `${used} min, ${used - b.total} over ${b.total}`
  const prog = ups.length ? `Up on ${names(ups.slice(0, 3))}${ups.length > 3 ? ` +${ups.length - 3}` : ''}.` : 'Held your numbers.'
  const next = used > b.total ? ' Next time: shorter rests or a superset.' : skipped ? ` ${skipped} exercise${skipped > 1 ? 's' : ''} not done.` : ''
  return `${time}. ${prog}${next}`
}

/** For Train: the coach's plan for the next session in one line, no network. */
export function sessionLine(ctx) {
  const r = liveCoach(ctx)
  const b = { ...DEFAULT_BUDGET, ...(ctx.budget || {}) }
  const lifts = ctx.exercises.filter((e) => e.sets.some(working))
  const ss = new Set(lifts.map((e) => e.superset).filter(Boolean)).size
  const shape = ss ? `${ss} superset${ss > 1 ? 's' : ''}${lifts.length - ss * 2 > 0 ? ` + ${lifts.length - ss * 2}` : ''}` : `${lifts.length} exercises`
  const ups = r.plans.filter((p) => p.kind === 'up' && p.weight != null)
  const ex = (p) => ctx.exercises.find((e) => e.id === p.weId)
  const up = ups.length ? `, go ${fmtW(ctx, ups[0].weight, ex(ups[0]))} on ${ex(ups[0]).name.toLowerCase()} today` : ''
  const fa = fatigueAdvice(ctx)
  const tired = fa ? `${cap(fa.short)}. ` : ''
  if (r.time.state === 'over') return `${tired}${b.total} min: plan runs ~${mins(r.time.projected)}, so ${ctx.canFit ? 'tap Fit it when you start' : r.best ? r.best.short : 'trim as we go'}${fa ? '' : up}`
  return `${tired}${b.total} min: ${shape}${fa ? '' : up}`
}

// ---------------------------------------------------------------- fatigue (shared/fatigue.mjs feeds it)

/**
 * Planned exercises whose main muscles are still fatigued (≥ 50%) at the start: go 10% lighter.
 * Needs ex.regions ({ p, s } region ids) and ctx.fatigue (region id → { fatigue, name }).
 * Returns { weIds, names, regions: [{ id, name, fatigue }], text, short } or null.
 */
export function fatigueAdvice(ctx, from = 0.5) {
  const f = ctx.fatigue
  if (!f) return null
  const hits = []
  const regions = new Map()
  for (const ex of ctx.exercises) {
    if (doneWork(ex).length || !openWork(ex).length || ex.type === 'duration') continue
    const tired = (ex.regions?.p || []).filter((id) => f[id] && f[id].fatigue >= from)
    if (!tired.length) continue
    hits.push(ex)
    for (const id of tired) regions.set(id, { id, name: f[id].name || id, fatigue: f[id].fatigue })
  }
  if (!hits.length) return null
  const rs = [...regions.values()].sort((a, b) => b.fatigue - a.fatigue)
  const what = rs.slice(0, 2).map((r) => r.name)
  const who = names(hits.slice(0, 2).map((e) => e.name)) + (hits.length > 2 ? ` +${hits.length - 2}` : '')
  return {
    weIds: hits.map((e) => e.id),
    names: hits.map((e) => e.name),
    regions: rs,
    text: `${cap(names(what))} still recovering (${Math.round(rs[0].fatigue * 100)}%): go 10% lighter on ${who}?`,
    short: `${names(what)} still recovering: go lighter on ${who}`,
  }
}

/** A plan 10% lighter (at least one step down), for a fatigued muscle. */
export function lighter(plan, ex, ctx) {
  if (!plan || !isNum(plan.weight) || plan.weight <= 0) return plan
  const eq = equipmentFor(ex, ctx.equipment)
  let w = roundTo(plan.weight * 0.9, eq.step)
  if (w >= plan.weight) w = r2(plan.weight - eq.step)
  w = Math.max(eq.step, w)
  return { ...plan, weight: w, kind: 'down', reason: `Still recovering: ${fmtW(ctx, w, ex)} × ${plan.reps ?? ''}`.replace(/ × $/, '') }
}

// ---------------------------------------------------------------- swapping an exercise

// Words that mean the same kit: lacking one rules out the others.
const KIT = [
  ['roll', 'wheel', 'roller'],
  ['bench', 'incline', 'decline'],
  ['pull-up', 'pullup', 'chin', 'bar'],
  ['band'],
  ['kettlebell'],
  ['box', 'step'],
  ['cable'],
  ['machine'],
  ['barbell', 'ez-bar', 'ez bar'],
  ['ball', 'stability'],
  ['rope', 'jump rope'],
]
const STOP = new Set(['dumbbell', 'dumbbells', 'weights', 'weight', 'any', 'a', 'an', 'the', 'my', 'that', 'can', 'roll', 'rollable', 'kit', 'equipment'])

/**
 * What they say they don't have, as word stems: "no bench, no pull-up bar; no rollable dumbbells".
 * Reads "no X", "don't have X", "without X", "lack X", "can't X".
 */
export function lackedTerms(text) {
  const out = new Set()
  const re = /(?:\bno|don'?t have|do not have|without|lacks?|can'?t use|cannot use|haven'?t got)\s+([a-z][a-z \-]*?)(?=[,.;:!?)]|\band\b|$)/gi
  for (const m of String(text || '').toLowerCase().matchAll(re)) {
    const phrase = m[1].trim()
    if (!phrase) continue
    const words = phrase.split(/[\s]+/).filter(Boolean)
    for (const w of words) {
      const stem = w.length >= 6 ? w.slice(0, 4) : w
      // "rollable dumbbells" → anything rolled; "dumbbells" alone isn't a lack we can act on
      if (/^roll/.test(w)) KIT[0].forEach((k) => out.add(k))
      if (STOP.has(w)) continue
      out.add(stem)
      for (const g of KIT) if (g.some((k) => k === w || k.startsWith(stem) || w.startsWith(k))) g.forEach((k) => out.add(k))
    }
  }
  return [...out]
}

// How a move loads the body, finer than push / pull / legs / core: a roll-out swaps best for another
// anti-extension move (plank, dead bug), not a crunch.
const FAMILIES = [
  ['anti-extension', /roll-?out|ab wheel|plank|dead ?bug|hollow|body ?saw|bear crawl|stir the pot|walkout|inchworm/i],
  ['flexion', /crunch|sit-?up|v-?up|toe touch|jackknife|leg raise|knee raise|hip raise|heel touch/i],
  ['rotation', /twist|wiper|wood ?chop|russian|pallof|rotation|windmill/i],
  ['lateral', /side bend|side plank|suitcase|copenhagen/i],
  ['hinge', /deadlift|rdl|good morning|swing|hip hinge/i],
  ['squat', /squat|lunge|split|step.?up/i],
  ['horizontal-push', /bench press|floor press|push-?up|chest press|fly/i],
  ['vertical-push', /shoulder press|overhead press|military|arnold|push press|pike/i],
  ['horizontal-pull', /row/i],
  ['vertical-pull', /pull-?up|chin-?up|pulldown|pullover/i],
]
export const familyOf = (name) => FAMILIES.find(([, re]) => re.test(name || ''))?.[0] || null

const lacks = (c, terms) => {
  const hay = `${c.name} ${c.equipment || ''}`.toLowerCase()
  return terms.some((t) => (t.length <= 4 ? new RegExp(`\\b${t.replace(/[-]/g, '.?')}`).test(hay) : hay.includes(t)))
}

/**
 * Alternatives for an exercise, best first (up to `limit`): { id, name, equipment, score, why }.
 * target / candidates: { id, name, equipment, type, regions: { p, s }, pattern, muscle }.
 * o: { have: equipment names they can use (default Dumbbell, Bodyweight, Band), lack: word stems
 *     (lackedTerms), fatigue: region id → 0–1, logged: Set of exercise ids they've done, limit }.
 * Scores muscle overlap (a shared main muscle is required), the same movement pattern and type,
 * moves they know; skips kit they lack or don't have; marks down moves whose main muscle is fatigued.
 */
export function alternatives(target, candidates, o = {}) {
  const have = new Set((o.have || ['Dumbbell', 'Bodyweight', 'Band']).map((x) => x.toLowerCase()))
  // can't do it usually means the kit it needs isn't there: rule out moves that need the same kit
  const own = String(target.name || '').toLowerCase()
  const sameKit = KIT.filter((g) => g.some((k) => (k.length <= 4 ? new RegExp(`\\b${k}`).test(own) : own.includes(k)))).flat()
  const lack = [...(o.lack || []), ...sameKit]
  const tp = new Set(target.regions?.p || [])
  const ts = new Set(target.regions?.s || [])
  const out = []
  const seen = new Set()
  for (const c of candidates) {
    if (c.id === target.id || seen.has(c.id) || !c.regions?.p?.length) continue
    seen.add(c.id)
    if (/stretch|mobility|foam roll/i.test(`${c.name} ${c.muscle || ''}`)) continue
    if (!have.has(String(c.equipment || '').toLowerCase())) continue
    if (lacks(c, lack)) continue
    const pShared = c.regions.p.filter((r) => tp.has(r))
    if (!pShared.length) continue
    let score = pShared.length * 3 + c.regions.p.filter((r) => ts.has(r)).length + (c.regions.s || []).filter((r) => tp.has(r)).length
    // what it trains that the original didn't: a small cost (stay on target)
    score -= c.regions.p.filter((r) => !tp.has(r) && !ts.has(r)).length
    if (target.pattern && c.pattern === target.pattern) score += 2
    const fam = familyOf(target.name)
    if (fam && familyOf(c.name) === fam) score += 3
    if (/dumbbell/i.test(target.equipment || '') && /dumbbell/i.test(`${c.equipment} ${c.name}`)) score += 0.5
    if (c.type === target.type) score += 1
    if (o.logged?.has(c.id)) score += 1.5
    const tired = c.regions.p.filter((r) => (o.fatigue?.[r] ?? 0) >= 0.5)
    score -= tired.length * 2
    score -= Math.max(0, c.name.length - 24) / 40 // plain names over long variants
    const why = [c.equipment, ...(o.logged?.has(c.id) ? ['you’ve done it'] : []), ...(tired.length ? ['muscle still recovering'] : [])].filter(Boolean).join(' · ')
    out.push({ id: c.id, name: c.name, equipment: c.equipment, score: Math.round(score * 100) / 100, why })
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, o.limit || 5)
}
