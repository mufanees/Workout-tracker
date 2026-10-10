// The time budget: how long a routine takes, and how to make it fit (pure; app, tests and the program
// catalogue share it). The owner's rule: every workout fits a hard budget (default 25 min: 5 warm-up,
// ~15 lifting, 5 cool-down). Fitting is the minimalist way: heavier weights for fewer reps (about the same
// weight × reps), non-competing exercises paired into supersets with 60–75 s after each round, 2 hard sets
// on accessories, and only then dropping exercises, isolation and core before any compound.
//
// Routines are the app's shape: { warmup: string[], cooldown: string[], exercises: [{ exerciseId, target,
// rest, superset, sets: [{ kind, weight, reps, seconds, tw?, tr?, ts? }] }] }. A context tells the core
// about exercises and your measured pace:
//   ctx.info(exerciseId) → { name, muscle, equipment, type } | undefined
//   ctx.setSecs(exerciseId) → measured seconds per set (start delay included) or null
//   ctx.restOverrun → seconds you usually rest past the plan (0 without data)
//   ctx.fmtWeight(exerciseId, kg) → "28 kg" (optional, for the change list)

export const DEFAULT_BUDGET = { total: 25, warmup: 5, cooldown: 5 }

const TRANSITION = 10 // seconds between checklist moves
const SET_REST_FALLBACK = 60
const SUPERSET_REST = 75
const SUPERSET_REST_TIGHT = 60

/** A budget from Settings or a number of minutes (warm-up and cool-down keep their defaults, scaled down for short budgets). */
export function budgetOf(b) {
  if (b && typeof b === 'object') {
    const total = clamp(Math.round(b.total || DEFAULT_BUDGET.total), 10, 120)
    return { total, warmup: clamp(Math.round(b.warmup ?? DEFAULT_BUDGET.warmup), 0, 30), cooldown: clamp(Math.round(b.cooldown ?? DEFAULT_BUDGET.cooldown), 0, 30) }
  }
  const total = clamp(Math.round(Number(b) || DEFAULT_BUDGET.total), 10, 120)
  const side = total < 20 ? Math.max(2, Math.round(total / 5)) : DEFAULT_BUDGET.warmup
  return { total, warmup: side, cooldown: side }
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

/** Seconds one warm-up / cool-down line takes. */
export function lineSeconds(line) {
  const l = String(line).toLowerCase().replace(/https?:\/\/\S+/g, '') // a video link isn't a dose
  const sides = /\/\s*side|each side|per side/.test(l) ? 2 : 1
  if (/ramp-?up/.test(l)) return 75
  const secs = l.match(/(\d+(?:\.\d+)?)\s*(s|sec|seconds?)\b/)
  if (secs) return Math.round(Number(secs[1]) * sides) + TRANSITION
  const mins = l.match(/(\d+(?:\.\d+)?)\s*min/)
  if (mins) return Math.round(Number(mins[1]) * 60 * sides) + TRANSITION
  const reps = l.match(/[×x]\s*(\d+)/)
  const parts = l.includes('+') ? l.split('+').length : 1 // "Glute bridge + bodyweight squat × 10 each"
  if (reps) return Math.max(20, Number(reps[1]) * 3 * sides * parts) + TRANSITION
  return 45
}

const linesSeconds = (lines) => (lines || []).reduce((a, l) => a + lineSeconds(l), 0)

/** Planned reps per set: the top of the target ("6–8" → 8), doubled when done per side, else the set's own. */
export function plannedReps(we, i = 0) {
  const t = String(we.target || '')
  const m = t.match(/(\d+)(?:\s*[–-]\s*(\d+))?/)
  const timeOrDistance = /\d\s*(s|secs?|seconds?|mins?|minutes?|m)\b/i.test(t)
  const s = we.sets[i] || we.sets[0] || {}
  const top = m && !timeOrDistance ? Number(m[2] || m[1]) : s.reps ?? s.tr ?? null
  if (!top) return null
  return top * (/\/\s*(side|leg|arm)|\b(each|per)\s+(side|leg|arm)\b/i.test(t) ? 2 : 1)
}

/** Seconds of work for one set: your measured pace, else a guess from the reps. */
export function setWork(we, i, ctx) {
  const measured = ctx?.setSecs?.(we.exerciseId)
  if (measured != null) return measured
  const info = ctx?.info?.(we.exerciseId)
  const s = we.sets[i] || {}
  if (info?.type === 'duration') return (s.seconds || s.ts || 40) + 5
  const reps = plannedReps(we, i) || 10
  return Math.min(90, reps * 3.5 + 8)
}

/** Exercises grouped the way they're done: a superset is one group of rounds. */
export function groupsOf(exercises) {
  const seen = new Set()
  const groups = []
  for (const we of exercises) {
    if (we.superset && seen.has(we.superset)) continue
    if (we.superset) seen.add(we.superset)
    groups.push(we.superset ? exercises.filter((e) => e.superset === we.superset) : [we])
  }
  return groups
}

/** Seconds for the strength part: sets, rest between sets / rounds, moving between exercises. */
export function mainSeconds(exercises, ctx) {
  let total = 0
  let paced = false
  const over = ctx?.restOverrun || 0
  const groups = groupsOf(exercises)
  groups.forEach((group, gi) => {
    const rounds = Math.max(...group.map((e) => e.sets.length))
    const planned = Math.max(...group.map((e) => e.rest || 0))
    const rest = Math.max(0, (planned || SET_REST_FALLBACK) + (planned ? over : 0))
    // measured set times already hold the walk to the next exercise and the start delay
    const measured = group.every((e) => ctx?.setSecs?.(e.exerciseId) != null)
    if (measured) paced = true
    for (let r = 0; r < rounds; r++) {
      for (const e of group) if (r < e.sets.length) total += setWork(e, r, ctx) + (group.length > 1 && !measured ? 10 : 0)
      if (r < rounds - 1) total += rest
    }
    // the move to the next exercise: the rest that runs after the last round when measured, else a guess
    if (measured) total += gi < groups.length - 1 && planned ? rest : 0
    else total += 45
  })
  return { secs: total, paced }
}

/** Estimated minutes for each part. */
export function estimateParts(src, ctx) {
  const min = (s) => Math.round(s / 60)
  const main = mainSeconds(src.exercises || [], ctx)
  return {
    warmup: min(linesSeconds(src.warmup)),
    main: min(main.secs),
    cooldown: min(linesSeconds(src.cooldown)),
    ...(main.paced ? { paced: true } : {}),
  }
}

export const totalOf = (e) => e.warmup + e.main + e.cooldown

// ---- what kind of exercise is it ----

const CORE = /plank|crunch|roll-?out|twist|wiper|otis|superman|sit-?up|dead ?bug|bird ?dog|hollow|v-?up|leg raise|knee raise|mountain climber|pallof|wood ?chop|side bend|flutter|jackknife|toe touch|ab wheel/i
const FULL = /thruster|clean|snatch|man ?maker|burpee|swing|turkish|carry|walk/i
const LEGS = /squat|lunge|deadlift|\brdl|step.?up|split|thrust|bridge|good ?morning|calf|leg (curl|extension|press)|hamstring|glute|hip hinge/i
const PULL = /row|pull|chin|face pull|shrug|curl|reverse fl|rear delt|y-raise|shoulder extension/i
const PUSH = /press|push|fly|flye|dip|extension|kickback|raise|around the world|skull/i
const ISOLATION = /curl|raise|fl(y|ies|yes)\b|flye|kickback|extension|shrug|pullover|around the world|calf|wrist|skull|y-raise|rear delt/i

/** Role (what to cut first) and movement pattern (what pairs well) of an exercise, from its name and muscle. */
export function kindOf(info) {
  const name = info?.name || ''
  const muscle = (info?.muscle || '').toLowerCase()
  if (CORE.test(name) || /abdominal|^abs|core|oblique/.test(muscle)) return { role: 'core', pattern: 'core' }
  if (FULL.test(name)) return { role: 'compound', pattern: 'full' }
  const role = ISOLATION.test(name) ? 'isolation' : 'compound'
  let pattern = 'other'
  if (LEGS.test(name) || /quad|hamstring|glute|calves|calf|adductor|abductor/.test(muscle)) pattern = 'legs'
  else if (PULL.test(name) || /lats|back|biceps|traps/.test(muscle)) pattern = 'pull'
  else if (PUSH.test(name) || /chest|shoulder|triceps/.test(muscle)) pattern = 'push'
  return { role, pattern }
}

const PAIR_SCORE = {
  'push+pull': 3,
  'legs+core': 3,
  'legs+push': 2,
  'legs+pull': 2,
  'push+core': 2,
  'pull+core': 2,
  'full+core': 2,
  'full+pull': 1,
  'full+push': 1,
}
/** How well two patterns share a superset (0 = they compete for the same muscles or both tax the legs). */
export function pairScore(a, b) {
  if (a === b) return 0
  const k = PAIR_SCORE[`${a}+${b}`] ?? PAIR_SCORE[`${b}+${a}`]
  if (k != null) return k
  return a === 'other' || b === 'other' ? 1 : 0
}

// ---- heavier, fewer reps ----

/**
 * The minimalist swap for a set of `reps` (9 or more): fewer reps, heavier, about the same weight × reps.
 * New top = 80% of the reps (10 → 8, 12 → 10), a 2-rep range below it. The load goes up by reps / new reps
 * (what keeps weight × reps), capped at 20% and at what Epley says the old weight allows: sets of 10 done
 * with ~4 reps in reserve (a usual working set) mean a 1RM of w × (1 + 14/30), so 8 reps fit at
 * w × (1 + 14/30) / (1 + 8/30) ≈ +16%. Below 9 reps it's already heavy: null.
 */
export function heavierFor(reps) {
  if (!reps || reps < 9) return null
  const top = Math.max(6, Math.round(reps * 0.8))
  const low = Math.max(5, top - 2)
  const epley = (1 + (reps + 4) / 30) / (1 + top / 30)
  const factor = Math.min(1.2, reps / top, epley)
  return { top, low, factor }
}

const roundKg = (kg) => Math.round(kg * 2) / 2 // adjustable dumbbells: 0.5 kg steps per dumbbell

// ---- warm-up and cool-down lines ----

/** Scale a line's dose by `f` ("Jump Rope · 5 min" × 0.4 → "Jump Rope · 2 min"); null if it has no dose to scale. */
function scaleLine(line, f) {
  const fmtSecs = (s) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`)
  const time = line.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*(s|secs?|seconds?|mins?|minutes?)\b/i)
  if (time) {
    const n = Number(time[2] || time[1]) * (/^m/i.test(time[3]) ? 60 : 1)
    const s = Math.max(20, Math.round((n * f) / 10) * 10)
    return line.replace(time[0], fmtSecs(s))
  }
  const reps = line.match(/([×x]\s*)(\d+)/)
  if (reps) return line.replace(reps[0], `${reps[1]}${Math.max(4, Math.round(Number(reps[2]) * f))}`)
  return null
}

/** Fit a checklist into `budgetSecs`: scale doses, then drop lines from the end (keeping the first). */
export function fitLines(lines, budgetSecs) {
  let out = [...(lines || [])]
  const total = linesSeconds(out)
  if (total <= budgetSecs || !out.length) return out
  if (budgetSecs <= 0) return []
  // the transition between moves isn't scalable
  const fixed = out.length * TRANSITION
  const f = Math.max(0.1, (budgetSecs - fixed) / Math.max(1, total - fixed))
  out = out.map((l) => scaleLine(l, f) ?? l)
  while (out.length > 1 && linesSeconds(out) > budgetSecs + 30) out.pop()
  return out
}

// ---- fitting ----

/**
 * A time-boxed copy of a routine: same exercises where possible, adjusted until warm-up + lifting +
 * cool-down fits the budget. Steps, each only while it's still over:
 *   1. warm-up and cool-down to their minutes (doses scaled, extra lines dropped);
 *   2. heavier, fewer reps on sets of 9+ (about the same weight × reps, see heavierFor);
 *   3. supersets of non-competing exercises (push + pull, legs + core…), 75 s after each round;
 *   4. shorter rests (straight sets 90 s, then rounds 60 s and straight sets 75 s);
 *   5. 2 hard sets on isolation and core work, then 3 on compounds that had more;
 *   6. drop exercises: isolation first, then core, compounds last (to 2 sets before any goes).
 * `budget` is minutes or { total, warmup, cooldown }. Returns the routine, the changes in plain words,
 * minutes before/after and whether it fits.
 */
export function fitToBudget(routine, budget, ctx = {}) {
  const b = budgetOf(budget)
  const r = structuredClone(routine)
  r.exercises = r.exercises || []
  const changes = []
  const est = () => estimateParts(r, ctx)
  const before = totalOf(est())
  const over = () => totalOf(est()) > b.total
  const name = (we) => ctx.info?.(we.exerciseId)?.name || 'Exercise'
  const kind = (we) => kindOf(ctx.info?.(we.exerciseId))
  const fmtW = (we, kg) => (ctx.fmtWeight ? ctx.fmtWeight(we.exerciseId, kg) : `${kg} kg`)

  if (!over()) return { routine: r, changes, before, after: before, fits: true, budget: b }

  // 1. warm-up and cool-down
  for (const part of ['warmup', 'cooldown']) {
    const mins = part === 'warmup' ? b.warmup : b.cooldown
    const had = Math.round(linesSeconds(r[part]) / 60)
    if (had <= mins) continue
    r[part] = fitLines(r[part], mins * 60)
    const now = Math.round(linesSeconds(r[part]) / 60)
    changes.push(`${part === 'warmup' ? 'Warm-up' : 'Cool-down'}: ${had} → ${now} min${r[part].length ? ` (${r[part].map(shortLine).join(', ')})` : ''}`)
  }

  // 2. heavier, fewer reps
  if (over()) {
    for (const we of r.exercises) {
      const info = ctx.info?.(we.exerciseId)
      if (!info || info.type !== 'weight_reps' || info.equipment === 'Bodyweight' || kind(we).role === 'core') continue
      const t = String(we.target || '')
      if (/\d\s*(s|secs?|seconds?|mins?|minutes?|m)\b/i.test(t)) continue
      const m = t.match(/^(\s*)(\d+)(?:\s*[–-]\s*(\d+))?(.*)$/)
      const planned = we.sets.find((s) => s.kind !== 'warmup' && (s.reps ?? s.tr) != null)
      const top = m ? Number(m[3] || m[2]) : planned ? (planned.reps ?? planned.tr) : null
      const h = heavierFor(top)
      if (!h) continue
      we.target = `${h.low}–${h.top}${m ? m[4] : ''}`
      let from = null
      let to = null
      for (const s of we.sets) {
        if (s.kind === 'warmup') continue
        if (s.reps != null) s.reps = h.top
        if (s.tr != null) s.tr = h.top
        for (const f of ['weight', 'tw']) {
          if (s[f] == null || !s[f]) continue
          from ??= s[f]
          s[f] = roundKg(s[f] * h.factor)
          to ??= s[f]
        }
      }
      const pct = Math.round((h.factor - 1) * 100)
      const work = we.sets.filter((s) => s.kind !== 'warmup').length
      changes.push(`${name(we)}: ${work} × ${top} → ${work} × ${h.low}–${h.top}, about ${pct}% heavier${from != null ? ` (${fmtW(we, from)} → ${fmtW(we, to)})` : ''}`)
    }
  }

  // 3. supersets of non-competing exercises (also re-run after a drop leaves a partner on its own)
  const used = new Set(r.exercises.map((e) => e.superset).filter(Boolean))
  let ssN = 0
  const newGroup = () => {
    let id
    do id = `ss-fit-${++ssN}-${Math.random().toString(36).slice(2, 6)}`
    while (used.has(id))
    used.add(id)
    return id
  }
  const pairSingles = (restMax) => {
    const list = r.exercises
    for (let i = 0; i < list.length; i++) {
      const a = list[i]
      if (a.superset) continue
      const pa = kind(a).pattern
      let best = -1
      let bestScore = -Infinity
      for (let j = i + 1; j < list.length; j++) {
        if (list[j].superset) continue
        const score = pairScore(pa, kind(list[j]).pattern)
        const sc = score * 10 - (j - i) // the best pair first, then the nearest
        if (score > 0 && sc > bestScore) {
          best = j
          bestScore = sc
        }
      }
      if (best < 0) continue
      const [partner] = list.splice(best, 1)
      list.splice(i + 1, 0, partner)
      const g = newGroup()
      const rest = Math.min(restMax, Math.max(a.rest || 0, partner.rest || 0) || restMax)
      a.superset = partner.superset = g
      a.rest = partner.rest = rest
      changes.push(`Superset: ${name(a)} + ${name(partner)}, ${rest} s rest after each round`)
      i++
    }
  }
  if (over()) pairSingles(SUPERSET_REST)

  // 4. shorter rests
  const restStep = (straightMax, roundMax) => {
    let rounds = false
    let straight = false
    for (const g of groupsOf(r.exercises)) {
      const max = g.length > 1 ? roundMax : straightMax
      const cur = Math.max(...g.map((e) => e.rest || 0))
      if (cur > max) {
        for (const e of g) e.rest = max
        if (g.length > 1) rounds = true
        else straight = true
      }
    }
    const said = [rounds ? `${roundMax} s after each superset round` : '', straight ? `${straightMax} s between sets` : ''].filter(Boolean)
    if (said.length) changes.push(`Shorter rest: ${said.join(', ')}`)
  }
  if (over()) restStep(90, SUPERSET_REST)
  if (over()) restStep(75, SUPERSET_REST_TIGHT)

  // 5. fewer sets: accessories to 2 hard sets, then compounds to 3
  const trimSets = (we, to, why) => {
    const work = we.sets.filter((s) => s.kind !== 'warmup')
    if (work.length <= to) return false
    const had = work.length
    const drop = new Set(work.slice(to).map((s) => s.id ?? s))
    we.sets = we.sets.filter((s) => !drop.has(s.id ?? s))
    changes.push(`${name(we)}: ${had} → ${to} ${why}`)
    return true
  }
  const fromEnd = (pred) => [...r.exercises].reverse().filter(pred)
  for (const we of fromEnd((e) => kind(e).role !== 'compound')) if (over()) trimSets(we, 2, 'hard sets')
  for (const we of fromEnd((e) => kind(e).role === 'compound')) if (over()) trimSets(we, 3, 'sets')

  // 6. drop exercises: isolation, then core, then compounds (to 2 sets first)
  const dropped = []
  const dropEx = (we, why) => {
    const i = r.exercises.indexOf(we)
    if (i < 0 || r.exercises.length <= 1) return
    r.exercises.splice(i, 1)
    dropped.push(name(we))
    if (we.superset) {
      const left = r.exercises.filter((e) => e.superset === we.superset)
      if (left.length === 1) left[0].superset = null
    }
    changes.push(`Dropped ${name(we)} (${why})`)
    pairSingles(SUPERSET_REST_TIGHT) // its partner can pair with another single
  }
  for (const we of fromEnd((e) => kind(e).role === 'isolation')) if (over()) dropEx(we, 'isolation, lowest priority')
  for (const we of fromEnd((e) => kind(e).role === 'core')) if (over()) dropEx(we, 'core; do it on a day with time to spare')
  for (const we of fromEnd((e) => kind(e).role === 'compound')) if (over()) trimSets(we, 2, 'sets')
  for (const we of fromEnd((e) => kind(e).role === 'compound')) if (over()) dropEx(we, 'the plan’s last compound')

  // what happened to an exercise that was then dropped is noise: keep just the drop
  const gone = r.exercises.length ? dropped : []
  const said = changes.filter((c) => !gone.some((n) => c.startsWith(n + ':') || (c.startsWith('Superset:') && c.includes(n))))
  const after = totalOf(est())
  return { routine: r, changes: said, before, after, fits: after <= b.total, budget: b }
}

/** "Jump Rope · 2 min" → "Jump Rope 2 min" for the change list. */
function shortLine(l) {
  return String(l).replace(/\s*[·:—-]\s*/g, ' ').replace(/https?:\/\/\S+/g, '').trim()
}

/** Weight × reps × sets of a routine's planned sets (stored kg; warm-ups out), for checking a fit kept the volume. */
export function plannedVolume(routine) {
  let v = 0
  for (const we of routine.exercises || []) {
    for (let i = 0; i < we.sets.length; i++) {
      const s = we.sets[i]
      if (s.kind === 'warmup') continue
      const w = s.weight ?? s.tw ?? 0
      v += w * (plannedReps(we, i) || 0)
    }
  }
  return v
}
