// Where the time in a workout goes, measured from the taps you make while training.
// Pure functions (no app state) shared by the app (src/timing.ts), the coach context and the server (MCP).
//
// A set's time runs from its start anchor to the tick:
// - the anchor is when the rest before it ended (ran out, Skip, −15 to zero, a set timer started),
//   or, with no rest in between (mid-superset, rest off), the previous tick in the workout
//   (a set or a warm-up / cool-down line); the first set starts at the last warm-up tick or the start.
// - idle time after the rest ends counts toward the set (starting late is part of the set).
// - ticked while the rest was still running: the rest ends at the tick, and the set's work is unknown (null).
//
// Bookkeeping lives on the active workout so a reload keeps it:
//   mark    = the last anchor: { at, kind: 'tick' | 'rest-end', rested?, plan? } (rest-end carries the rest it closed)
//   restRun = the rest that's running: { start, plan, end } (end = scheduled end, so a frozen page still ends it on time)

const secs = (ms) => Math.max(0, Math.round(ms / 1000))

/** The last tick in the workout when there's no mark (an older workout in progress). */
function fallbackAnchor(w) {
  let at = w.start
  for (const t of Object.values(w.checkAt || {})) if (typeof t === 'number' && t > at) at = t
  for (const e of w.exercises || []) for (const s of e.sets || []) if (s.done && typeof s.at === 'number' && s.at > at) at = s.at
  return at
}

/** The mark for a rest that ended at `at` (never later than its scheduled end). */
export function restEndMark(restRun, at) {
  const end = Math.max(restRun.start, Math.min(at, restRun.end))
  return { at: end, kind: 'rest-end', rested: secs(end - restRun.start), plan: restRun.plan }
}

/**
 * Where the workout's anchor stands at `now`: a rest whose scheduled end has passed counts as ended then
 * (the app was closed or frozen when it ran out).
 * Returns { mark, restRun } with restRun still set only if the rest is running at `now`.
 */
export function settle(w, now) {
  if (w.restRun && now >= w.restRun.end) return { mark: restEndMark(w.restRun, w.restRun.end), restRun: null }
  return { mark: w.mark || null, restRun: w.restRun || null }
}

/**
 * Timing for a set ticked at `now`, plus the workout's new bookkeeping.
 * `timedFrom`: when a set timer for this set started (a timed set), so a rest still marked as running
 * still gives a measured time.
 */
export function tickTiming(w, now, timedFrom = null) {
  const { mark, restRun } = settle(w, now)
  let work = null
  let rested = null
  let restPlan = null
  if (restRun) {
    // started before the rest ran out: the rest ends here
    const restEnd = timedFrom != null ? Math.max(restRun.start, Math.min(timedFrom, now)) : now
    rested = secs(restEnd - restRun.start)
    restPlan = restRun.plan
    work = timedFrom != null ? secs(now - restEnd) : null
  } else {
    const anchor = mark ? mark.at : fallbackAnchor(w)
    work = secs(now - anchor)
    // the rest that ended before this set (carried past any warm-up line ticked after it)
    if (mark && mark.rested != null) {
      rested = mark.rested
      restPlan = mark.plan ?? null
    }
  }
  return { set: { at: now, work, rested, restPlan }, mark: { at: now, kind: 'tick' }, restRun: null }
}

/**
 * A warm-up / cool-down line ticked at `now`: it becomes the anchor; a running rest keeps running.
 * A rest that already ended stays with the anchor, so the next set still gets its `rested`.
 */
export function lineTick(w, now) {
  const { mark, restRun } = settle(w, now)
  const carry = mark && mark.rested != null ? { rested: mark.rested, plan: mark.plan } : {}
  return { mark: { at: now, kind: 'tick', ...carry }, restRun }
}

/** A set unticked: its timing goes. */
export function untickSet(s) {
  const { at: _a, work: _w, rested: _r, restPlan: _p, ...rest } = s
  return { ...rest, done: false }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * Unticking the set that is the current anchor (and no rest has started since): put back the anchor it
 * was timed from, so ticking it again gives the same time. Returns null when nothing changes.
 */
export function untickAnchor(w, s) {
  if (w.restRun || !w.mark || !isNum(s.at) || w.mark.at !== s.at) return null
  if (isNum(s.work)) {
    const at = s.at - s.work * 1000
    return { mark: isNum(s.rested) ? { at, kind: 'rest-end', rested: s.rested, plan: s.restPlan ?? undefined } : { at, kind: 'tick' }, restRun: null }
  }
  // ticked during a rest: that rest is running again
  if (isNum(s.rested) && isNum(s.restPlan)) {
    const start = s.at - s.rested * 1000
    return { mark: { at: start, kind: 'tick' }, restRun: { start, plan: s.restPlan, end: start + s.restPlan * 1000 } }
  }
  return null
}

/** Done sets that were ticked live, in tick order, with their exercise. */
function tickedSets(w) {
  const out = []
  for (const e of w.exercises || []) for (const s of e.sets || []) if (s.done && isNum(s.at)) out.push({ e, s })
  return out.sort((a, b) => a.s.at - b.s.at)
}

/**
 * Where the time went, in seconds: warm-up (start → last warm-up tick), work (sets), rest,
 * cool-down (last set → last cool-down tick), transition (everything else, e.g. the last tick → finish)
 * and the total. Null when nothing was ticked live (older workouts).
 */
export function workoutTiming(w) {
  const sets = tickedSets(w)
  if (!sets.length || !isNum(w.start)) return null
  const end = isNum(w.end) ? w.end : Math.max(...sets.map((x) => x.s.at))
  const total = secs(end - w.start)
  const at = w.checkAt || {}
  const warm = Object.entries(at).filter(([k, t]) => /^w\d/.test(k) && isNum(t)).map(([, t]) => t)
  const cool = Object.entries(at).filter(([k, t]) => /^c\d/.test(k) && isNum(t)).map(([, t]) => t)
  const firstSet = sets[0].s.at
  const lastSet = sets[sets.length - 1].s.at
  const warmBefore = warm.filter((t) => t <= firstSet)
  const warmup = warmBefore.length ? secs(Math.max(...warmBefore) - w.start) : 0
  const coolAfter = cool.filter((t) => t > lastSet)
  const cooldown = coolAfter.length ? secs(Math.max(...coolAfter) - lastSet) : 0
  let work = 0
  let rest = 0
  for (const { s } of sets) {
    if (isNum(s.work)) work += s.work
    if (isNum(s.rested)) rest += s.rested
  }
  const transition = Math.max(0, total - warmup - work - rest - cooldown)
  return { warmup, work, rest, transition, cooldown, total }
}

/**
 * Per exercise: its sets' times and the rests taken after them (the rest that followed each set,
 * which the next ticked set carries). total = work + those rests.
 */
export function exerciseTimes(w) {
  const sets = tickedSets(w)
  const restAfter = new Map()
  for (let i = 0; i < sets.length - 1; i++) {
    const nxt = sets[i + 1].s
    if (isNum(nxt.rested)) restAfter.set(sets[i].s.id, { rested: nxt.rested, plan: isNum(nxt.restPlan) ? nxt.restPlan : null })
  }
  const out = []
  for (const e of w.exercises || []) {
    const mine = sets.filter((x) => x.e === e).map((x) => x.s)
    if (!mine.length) continue
    const works = mine.map((s) => (isNum(s.work) ? s.work : null))
    const rests = mine.map((s) => restAfter.get(s.id)).filter(Boolean)
    const known = works.filter(isNum)
    const work = known.reduce((a, b) => a + b, 0)
    const rest = rests.reduce((a, r) => a + r.rested, 0)
    out.push({
      weId: e.id,
      exerciseId: e.exerciseId,
      sets: mine.length,
      works,
      rests: rests.map((r) => r.rested),
      plans: rests.map((r) => r.plan),
      work,
      rest,
      total: work + rest,
      avg: known.length ? Math.round(work / known.length) : null,
    })
  }
  return out
}

/** "0:48", "4:10", "1:02:05" */
export function fmtSecs(s) {
  if (!isNum(s)) return '?'
  const t = Math.max(0, Math.round(s))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const r = t % 60
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(r).padStart(2, '0')
}

/** Longer than this isn't a set (they walked away); it's left out of averages. */
export const MAX_SET_SECS = 600

/**
 * Pace over recent workouts: average seconds per working set by exercise, rest taken vs planned,
 * transition per workout and total vs budget. `list` = finished workouts (any order).
 */
export function paceStats(list, since = 0) {
  const byEx = new Map()
  let restN = 0
  let restOver = 0
  let restTaken = 0
  let restPlan = 0
  const sessions = []
  for (const w of list) {
    if (!w || !isNum(w.start) || w.start < since || !isNum(w.end)) continue
    const t = w.timing || workoutTiming(w)
    if (!t) continue
    sessions.push({ id: w.id, start: w.start, name: w.name, timing: t, budget: w.timePlan?.budget ?? null })
    for (const e of w.exercises || []) {
      for (const s of e.sets || []) {
        if (!s.done || !isNum(s.at)) continue
        if (isNum(s.rested) && isNum(s.restPlan) && s.restPlan > 0 && s.rested <= MAX_SET_SECS) {
          restN++
          restOver += s.rested - s.restPlan
          restTaken += s.rested
          restPlan += s.restPlan
        }
        if (s.kind === 'warmup' || !isNum(s.work) || s.work > MAX_SET_SECS) continue
        const cur = byEx.get(e.exerciseId) || { exerciseId: e.exerciseId, sets: 0, secs: 0, sessions: new Set() }
        cur.sets++
        cur.secs += s.work
        cur.sessions.add(w.id)
        byEx.set(e.exerciseId, cur)
      }
    }
  }
  const exercises = [...byEx.values()].map((x) => ({ exerciseId: x.exerciseId, sets: x.sets, sessions: x.sessions.size, avg: Math.round(x.secs / x.sets) }))
  sessions.sort((a, b) => b.start - a.start)
  const n = sessions.length
  return {
    exercises,
    rest: restN ? { n: restN, overrun: Math.round(restOver / restN), taken: Math.round(restTaken / restN), plan: Math.round(restPlan / restN) } : null,
    transition: n ? Math.round(sessions.reduce((a, s) => a + s.timing.transition, 0) / n) : null,
    sessions,
  }
}
