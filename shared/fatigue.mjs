// Muscle fatigue, recovery and weekly volume per body region. Pure: no app imports, so the app,
// the tests and scripts/muscles.mjs share it. Written for Gloop (the idea of a recovery body map
// comes from openGym, github.com/DuarteSantos8/openGym, AGPL; no code or artwork was copied).
//
// The model in one paragraph: every working set adds "effective sets" to the regions its exercise
// trains (primary muscles 1, secondary 0.5), scaled by effort (reps in reserve: logged on the set,
// carried back from the effort tap on the exercise's last set, or inferred from reps vs the target).
// Those effective sets decay exponentially with a half-life per region size, and fatigue is the
// saturating 1 - exp(-v / 4): 3 hard sets of a muscle read about 53 %, 6 read 78 %. Fresh below
// 25 %, fatigued from 50 %. Weekly volume is plain working sets over the last 7 days (primary 1,
// secondary 0.5) against a minimalist target range per region.

/** Half-lives in hours. Strength and soreness come back within ~24–48 h for small, mostly upper-body
 * muscles and take ~48–72 h for big lower-body muscles worked through long eccentric ranges (squats,
 * hinges, lunges), whose damage and soreness last longer. With 1 - exp(-v/4) and these half-lives,
 * 3 hard sets of biceps read fresh after ~1.5 days, 3 of chest after ~2 days and 6 hard sets of quads
 * after ~3.5 days: in line with "train a muscle again after 48–72 h". */
export const HALF_LIFE_H = { small: 24, medium: 30, large: 36 }
/** Fatigue at or above this reads "fatigued"; below FRESH_BELOW reads "fresh"; between is "recovering". */
export const FATIGUED_FROM = 0.5
export const FRESH_BELOW = 0.25
/** Effective sets per e-fold of fatigue (fatigue = 1 - exp(-v / SCALE)). */
export const SCALE = 4
/** One session can't add more than this many effective sets to a region (junk volume past ~10 sets). */
export const SESSION_CAP = 10
/** Secondary muscles count this much of a set. */
export const SECONDARY = 0.5
/** Effective sets at which fatigue = FRESH_BELOW. */
export const V_FRESH = -SCALE * Math.log(1 - FRESH_BELOW)

const H = 3600000
const DAY = 24 * H

/** Body regions, head to toe. `target` = minimalist hard sets per 7 days [low, high] for someone
 * training 3–4 × 30 min (the research range is ~10–20; ~6–12 keeps most of the gains for a big
 * muscle, less for muscles that get plenty of indirect work). `views` = where the map draws it. */
export const REGIONS = [
  { id: 'traps', name: 'Traps', size: 'medium', target: [3, 8], views: ['front', 'back'] },
  { id: 'front_delts', name: 'Front delts', size: 'small', target: [3, 8], views: ['front'] },
  { id: 'side_delts', name: 'Side delts', size: 'small', target: [4, 10], views: ['front', 'back'] },
  { id: 'rear_delts', name: 'Rear delts', size: 'small', target: [4, 10], views: ['back'] },
  { id: 'chest', name: 'Chest', size: 'medium', target: [6, 12], views: ['front'] },
  { id: 'lats', name: 'Upper back and lats', short: 'Back', size: 'medium', target: [6, 12], views: ['back'] },
  { id: 'biceps', name: 'Biceps', size: 'small', target: [4, 10], views: ['front'] },
  { id: 'triceps', name: 'Triceps', size: 'small', target: [4, 10], views: ['back'] },
  { id: 'forearms', name: 'Forearms', size: 'small', target: [2, 8], views: ['front', 'back'] },
  { id: 'abs', name: 'Abs and obliques', short: 'Abs', size: 'small', target: [4, 10], views: ['front'] },
  { id: 'lower_back', name: 'Lower back', size: 'large', target: [3, 8], views: ['back'] },
  { id: 'glutes', name: 'Glutes', size: 'large', target: [6, 12], views: ['back'] },
  { id: 'quads', name: 'Quads', size: 'large', target: [6, 12], views: ['front'] },
  { id: 'hamstrings', name: 'Hamstrings', size: 'large', target: [6, 12], views: ['back'] },
  { id: 'adductors', name: 'Adductors and hip flexors', short: 'Adductors', size: 'large', target: [2, 8], views: ['front', 'back'] },
  { id: 'calves', name: 'Calves', size: 'small', target: [3, 8], views: ['front', 'back'] },
]
export const REGION_IDS = REGIONS.map((r) => r.id)
const REGION_SET = new Set(REGION_IDS)
export const regionById = Object.fromEntries(REGIONS.map((r) => [r.id, r]))
export const halfLifeOf = (id) => HALF_LIFE_H[regionById[id]?.size || 'medium']

// ---- exercise → regions ---------------------------------------------------------------------

/** "quads,glutes|adductors,lower_back" → { p: ['quads', 'glutes'], s: ['adductors', 'lower_back'] } */
export function parseMap(str) {
  if (!str) return { p: [], s: [] }
  const [p = '', s = ''] = String(str).split('|')
  const list = (x) => x.split(',').map((y) => y.trim()).filter((y) => REGION_SET.has(y))
  return { p: list(p), s: list(s) }
}
export function formatMap(m) {
  const p = [...new Set(m.p)].filter((x) => REGION_SET.has(x))
  const s = [...new Set(m.s)].filter((x) => REGION_SET.has(x) && !p.includes(x))
  return s.length ? `${p.join(',')}|${s.join(',')}` : p.join(',')
}

const has = (re, s) => re.test(s)

/** Which delt a shoulder exercise hits, from its name. */
export function deltOf(name) {
  const n = name.toLowerCase()
  if (has(/rear|reverse fl|reverse pec|face pull|y-t|prone y|\bt raise|bent.?over (lateral|raise|fly|shoulder)|external rotation|pull.?apart|band pull/, n)) return 'rear_delts'
  if (has(/lateral|side raise|side lateral|upright|lu raise|\by raise|iron cross|side.lying.*abduction/, n)) return 'side_delts'
  return 'front_delts'
}

/** Regions from a free-exercise-db muscle name (and the exercise name, for delts). */
export function regionsOfFedb(muscle, name, role) {
  switch (muscle) {
    case 'abdominals':
      return ['abs']
    case 'hamstrings':
      return ['hamstrings']
    case 'adductors':
      return ['adductors']
    case 'abductors':
      return ['glutes']
    case 'quadriceps':
      return ['quads']
    case 'biceps':
      return ['biceps']
    case 'triceps':
      return ['triceps']
    case 'forearms':
      return ['forearms']
    case 'chest':
      return ['chest']
    case 'middle back':
    case 'lats':
      return ['lats']
    case 'lower back':
      return ['lower_back']
    case 'traps':
    case 'neck':
      return ['traps']
    case 'calves':
      return ['calves']
    case 'glutes':
      return ['glutes']
    case 'shoulders': {
      if (role === 'p') return [deltOf(name)]
      const n = name.toLowerCase()
      // as a helper: presses use the front delts, pulls and rows the rear delts
      if (has(/row|pull|chin|fly|flye|deadlift|shrug|face/, n) && !has(/press|push/, n)) return ['rear_delts']
      return ['front_delts']
    }
  }
  return []
}

/** A best guess from the name and the app's single muscle field, for exercises the data file
 * doesn't know (custom exercises, ones the coach created). Keyword rules first, then the field. */
export function guessRegions(name = '', muscle = '') {
  const n = name.toLowerCase()
  const m = { p: [], s: [] }
  const P = (...r) => m.p.push(...r)
  const S = (...r) => m.s.push(...r)
  if (muscle === 'Mobility' || has(/stretch|mobility|foam roll|nerve glide|tendon glide/, n)) return m
  if (has(/calf|calves|heel raise|heel drop/, n)) P('calves')
  else if (has(/romanian|rdl|stiff.?leg|good morning|hinge/, n)) (P('hamstrings', 'glutes'), S('lower_back', 'forearms'))
  else if (has(/deadlift/, n)) (P('glutes', 'hamstrings', 'lower_back'), S('quads', 'traps', 'forearms', 'lats'))
  else if (has(/hip thrust|glute bridge|bridge|kickback.*(glute|cable)|abduction|clam/, n)) (P('glutes'), S('hamstrings'))
  else if (has(/swing/, n)) (P('glutes', 'hamstrings'), S('lower_back', 'abs', 'forearms'))
  else if (has(/leg curl|hamstring curl|nordic/, n)) P('hamstrings')
  else if (has(/leg extension|sissy/, n)) P('quads')
  else if (has(/squat|lunge|step.?up|leg press|split|pistol|thruster/, n)) (P('quads', 'glutes'), S('adductors', 'hamstrings'))
  else if (has(/adduct|copenhagen|groin/, n)) P('adductors')
  else if (has(/shrug/, n)) (P('traps'), S('forearms'))
  else if (has(/face pull|rear delt|reverse fl|pull.?apart/, n)) (P('rear_delts'), S('traps', 'lats'))
  else if (has(/lateral raise|side raise|upright row/, n)) (P('side_delts'), S('traps'))
  else if (has(/front raise/, n)) (P('front_delts'), S('side_delts'))
  else if (has(/curl/, n) && !has(/leg|hamstring/, n)) (P('biceps'), S('forearms'))
  else if (has(/tricep|skull|pushdown|kickback|dip|close.?grip/, n)) (P('triceps'), S('chest', 'front_delts'))
  else if (has(/pull.?up|chin.?up|pulldown|pullover/, n)) (P('lats'), S('biceps', 'rear_delts', 'forearms'))
  else if (has(/row/, n)) (P('lats'), S('rear_delts', 'biceps', 'traps', 'forearms'))
  else if (has(/fly|flye|bench|push.?up|floor press|chest press|incline press/, n)) (P('chest'), S('front_delts', 'triceps'))
  else if (has(/press|arnold|push press|jerk/, n)) (P('front_delts'), S('side_delts', 'triceps', 'traps'))
  else if (has(/wrist|grip|farmer|carry/, n)) (P('forearms'), S('traps', 'abs'))
  else if (has(/plank|crunch|sit.?up|twist|leg raise|knee raise|dead bug|bird dog|hollow|rollout|roll.?out|ab wheel|wiper|v.?up|mountain|pallof|woodchop/, n)) (P('abs'), S('lower_back'))
  else if (has(/back extension|hyperextension|superman/, n)) (P('lower_back'), S('glutes', 'hamstrings'))
  if (m.p.length) return m
  switch (muscle) {
    case 'Chest':
      return { p: ['chest'], s: ['front_delts', 'triceps'] }
    case 'Back':
      return { p: ['lats'], s: ['rear_delts', 'biceps'] }
    case 'Shoulders':
      return { p: [deltOf(name)], s: [] }
    case 'Arms':
      return { p: ['biceps', 'triceps'], s: ['forearms'] }
    case 'Legs':
      return { p: ['quads'], s: ['glutes', 'hamstrings'] }
    case 'Glutes':
      return { p: ['glutes'], s: ['hamstrings'] }
    case 'Core':
      return { p: ['abs'], s: [] }
    case 'Full Body':
      return { p: ['quads', 'glutes'], s: ['front_delts', 'lats', 'abs'] }
  }
  return m
}

// ---- effort ---------------------------------------------------------------------------------

/** How much of a hard set a set is worth at a given RIR: full at 0–1 in reserve, 0.15 less per
 * extra rep, never below 0.4 (easy work still loads the muscle a little). Unknown = 2 RIR. */
export function effortWeight(rir) {
  if (rir == null || !Number.isFinite(rir)) rir = 2
  return Math.max(0.4, Math.min(1, 1 - 0.15 * (rir - 1)))
}

/** "10–12", "8 / side", "12-15 reps", "AMRAP" → [lo, hi] reps, or null for timed or unknown targets. */
export function parseTarget(t) {
  if (!t) return null
  const s = String(t).toLowerCase()
  if (/\d\s*(s|sec|secs|seconds|min)\b/.test(s)) return null
  const m = /(\d+)\s*(?:[–-]|to)\s*(\d+)/.exec(s) || /(\d+)/.exec(s)
  if (!m) return null
  const lo = Number(m[1])
  const hi = Number(m[2] ?? m[1])
  return lo > 0 && hi >= lo && hi <= 100 ? [lo, hi] : null
}

/** Reps in reserve inferred from reps against the target: short of the range = ran out (0.5),
 * inside it = about 2 left, past the top = the weight was light (3, or 4 when 3+ past). */
export function inferRir(reps, range) {
  if (reps == null || !range) return null
  const [lo, hi] = range
  if (reps < lo) return 0.5
  if (reps <= hi) return 2
  return reps >= hi + 3 ? 4 : 3
}

const counts = (s) => s && s.done && s.kind !== 'warmup'

/** Every working set of one exercise in a workout with its RIR and where that came from.
 * The effort tap saves RIR on the exercise's last working set; earlier sets get one more in reserve. */
export function exerciseEfforts(we) {
  const work = (we.sets || []).filter(counts)
  const out = []
  let later = null // RIR logged on a later set of this exercise
  for (let i = work.length - 1; i >= 0; i--) {
    const s = work[i]
    let rir = null
    let source = 'default'
    if (s.rir != null && Number.isFinite(s.rir)) ((rir = s.rir), (source = 'logged'), (later = s.rir))
    else if (s.kind === 'failure' || s.kind === 'drop') ((rir = 0), (source = 'kind'))
    else if (later != null) ((rir = Math.min(5, later + 1)), (source = 'logged'))
    else {
      const range = parseTarget(we.target) || (s.tr ? [s.tr, s.tr + 2] : null)
      const r = s.seconds != null && s.reps == null ? null : inferRir(s.reps, range)
      if (r != null) ((rir = r), (source = 'inferred'))
    }
    out[i] = { set: s, rir, source, weight: effortWeight(rir) * (s.kind === 'drop' ? 0.5 : 1) }
  }
  return out
}

// ---- per workout ----------------------------------------------------------------------------

/** When a workout's load lands (its end, else start). */
export const workoutTime = (w) => w.end || w.start

/**
 * Per region for one workout: `eff` = effort-weighted sets × role (capped per session), `sets` = plain
 * working sets × role, `byEx` = exerciseId → effective sets. `musclesOf(exerciseId)` → {p, s}.
 */
export function workoutLoad(w, musclesOf) {
  const out = {}
  for (const we of w.exercises || []) {
    const m = musclesOf(we.exerciseId)
    if (!m || (!m.p.length && !m.s.length)) continue
    const efforts = exerciseEfforts(we)
    if (!efforts.length) continue
    const eff = efforts.reduce((a, e) => a + e.weight, 0)
    const n = efforts.filter((e) => e.set.kind !== 'drop').length
    const add = (id, role) => {
      const r = (out[id] ||= { eff: 0, sets: 0, byEx: {} })
      r.eff += eff * role
      r.sets += n * role
      r.byEx[we.exerciseId] = (r.byEx[we.exerciseId] || 0) + eff * role
    }
    for (const id of m.p) add(id, 1)
    for (const id of m.s) if (!m.p.includes(id)) add(id, SECONDARY)
  }
  for (const r of Object.values(out)) r.eff = Math.min(SESSION_CAP, r.eff)
  return out
}

// ---- fatigue and volume ---------------------------------------------------------------------

export const fatigueFrom = (v) => 1 - Math.exp(-Math.max(0, v) / SCALE)
export const stateOf = (f) => (f >= FATIGUED_FROM ? 'fatigued' : f >= FRESH_BELOW ? 'recovering' : 'fresh')

/**
 * Status of every region at `now`.
 * workouts: finished workouts (any order). musclesOf: exerciseId → {p, s}.
 * Returns Record<regionId, { id, fatigue, state, v, freshAt, weekSets, weekEff, target, last, top }>:
 *  - fatigue 0–1, state fresh | recovering | fatigued, freshAt = epoch ms when it drops under
 *    FRESH_BELOW (null when already fresh),
 *  - weekSets = working sets in the last `days` (default 7) days (primary 1, secondary 0.5),
 *  - last = when it last got at least half a set, top = [{exerciseId, sets}] over those days, most first.
 */
export function muscleStatus(workouts, now, musclesOf, { days = 7, scanDays = 21 } = {}) {
  const res = {}
  for (const r of REGIONS) res[r.id] = { id: r.id, fatigue: 0, state: 'fresh', v: 0, freshAt: null, weekSets: 0, weekEff: 0, target: r.target, last: null, top: [] }
  const tops = {}
  for (const w of workouts || []) {
    if (!w || w.deleted || !w.exercises?.length) continue
    const t = workoutTime(w)
    if (!(t <= now)) continue
    const age = now - t
    const load = workoutLoad(w, musclesOf)
    for (const [id, l] of Object.entries(load)) {
      const r = res[id]
      if (!r) continue
      if (l.sets >= 0.5 && (r.last == null || t > r.last)) r.last = t
      if (age <= scanDays * DAY) r.v += l.eff * 0.5 ** (age / (halfLifeOf(id) * H))
      if (age <= days * DAY) {
        r.weekSets += l.sets
        r.weekEff += l.eff
        const tp = (tops[id] ||= {})
        for (const [ex, n] of Object.entries(l.byEx)) tp[ex] = (tp[ex] || 0) + n
      }
    }
  }
  for (const r of Object.values(res)) {
    r.fatigue = fatigueFrom(r.v)
    r.state = stateOf(r.fatigue)
    r.freshAt = r.v > V_FRESH ? now + halfLifeOf(r.id) * H * Math.log2(r.v / V_FRESH) : null
    r.weekSets = Math.round(r.weekSets * 10) / 10
    r.weekEff = Math.round(r.weekEff * 10) / 10
    r.top = Object.entries(tops[r.id] || {})
      .map(([exerciseId, sets]) => ({ exerciseId, sets: Math.round(sets * 10) / 10 }))
      .sort((a, b) => b.sets - a.sets)
  }
  return res
}

/** Volume level 0–4 against the target: 0 none, 1 under a third, 2 under two thirds, 3 under the
 * low end, 4 in range or above. */
export function volumeLevel(sets, target) {
  if (!(sets > 0)) return 0
  const r = sets / target[0]
  return r >= 1 ? 4 : r >= 2 / 3 ? 3 : r >= 1 / 3 ? 2 : 1
}
/** Fatigue level 0–4: 0 fresh (under 10 %), 1 fading (under 25 %), 2 recovering, 3 fatigued, 4 very (75 %+). */
export function fatigueLevel(f) {
  return f >= 0.75 ? 4 : f >= FATIGUED_FROM ? 3 : f >= FRESH_BELOW ? 2 : f >= 0.1 ? 1 : 0
}

/** Plain-text block for the coach. `nameOf(exerciseId)` gives exercise names. */
export function musclesText(status, now, nameOf = (id) => id) {
  const date = (t) => new Date(t).toISOString().slice(0, 10)
  const hrs = (t) => Math.max(1, Math.round((t - now) / H))
  const lines = []
  const idle = []
  for (const r of REGIONS) {
    const s = status[r.id]
    if (!s || (s.weekSets === 0 && s.fatigue < 0.1)) {
      idle.push(`${r.name}${s?.last ? ` (last ${date(s.last)})` : ''}`)
      continue
    }
    const top = s.top.slice(0, 2).map((x) => nameOf(x.exerciseId)).join(', ')
    lines.push(
      `${r.name}: ${Math.round(s.fatigue * 100)}% ${s.state}${s.freshAt ? ` (fresh in ~${hrs(s.freshAt)} h)` : ''}; ${s.weekSets} sets in 7 days (target ${r.target[0]}–${r.target[1]})${s.last ? `; last ${date(s.last)}` : ''}${top ? `; mostly ${top}` : ''}`,
    )
  }
  if (idle.length) lines.push(`Not trained in 7 days: ${idle.join(', ')}`)
  return lines.join('\n')
}
