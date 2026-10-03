// Goals the app tracks and the coach coaches to. For each open goal: where you are now, the
// trend over recent weeks, when you'd get there at that pace, whether that's ahead of or behind
// the date you set, and milestones on the way. The same numbers feed the screens and the coach.
import { weightModel } from './weightModel'
import { computed } from '@preact/signals'
import { bodyWeights, coachItems, exMap, fasts, workouts } from './store'
import { sessionsByExercise } from './stats'
import { summarizeHR } from './hr'
import { counts, startOfWeek } from './util'
import type { CoachItem, Exercise, GoalSpec, WSet } from './types'

const DAY = 86400000
const WEEK = 7 * DAY

export interface Pt {
  t: number
  v: number
}
export interface GoalMilestone {
  value: number
  label: string
  due: number | null // set by the coach, if any
  reachedAt: number | null
  eta: number | null // projected at the current pace
  cap?: boolean // the heaviest dumbbell they own
}
export interface GoalStatus {
  item: CoachItem
  spec: GoalSpec
  title: string // short name of what's measured, e.g. "Any two-dumbbell lift · 3 reps"
  unit: string
  current: number | null
  target: number | null
  baseline: number | null
  pct: number // 0–1 from baseline to target
  slope: number | null // units per week (direction-aware sign kept)
  eta: number | null
  due: number | null
  state: 'reached' | 'ahead' | 'on-track' | 'behind' | 'too-early' | 'no-data' | 'open'
  needPerWeek: number | null // pace needed to make the due date
  series: Pt[]
  milestones: GoalMilestone[]
  lifts?: LiftLine[] // lift goals on "any": every lift, closest first
  liftName?: string // the lift the numbers above come from
  perHand?: boolean // lift values are two dumbbells: show "2 × n"
  lastSet?: WSet
}
export interface LiftLine {
  exerciseId: string
  name: string
  current: number // total kg
  pct: number
  slope: number | null
  sessions: number
}

// ---------- shared maths ----------

/** Least-squares slope per week over the last 8 weeks (needs 3+ points spanning 10+ days). */
export function trendPerWeek(pts: Pt[], now = Date.now(), weeks = 8): number | null {
  const p = pts.filter((x) => x.t >= now - weeks * WEEK)
  if (p.length < 3 || p[p.length - 1].t - p[0].t < 10 * DAY) return null
  const xs = p.map((x) => (x.t - p[0].t) / WEEK)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = p.reduce((a, x) => a + x.v, 0) / p.length
  let num = 0
  let den = 0
  xs.forEach((x, i) => ((num += (x - mx) * (p[i].v - my)), (den += (x - mx) ** 2)))
  return den ? num / den : null
}

/** Weight you could lift for `reps`, from a set of w × r (Epley; sets over 12 reps count as 12). */
export function estimate(w: number, r: number, reps: number): number {
  if (!w || !r) return 0
  const one = r === 1 ? w : w * (1 + Math.min(r, 12) / 30)
  return reps === 1 ? one : one / (1 + reps / 30)
}

/** Lifts with a dumbbell in each hand, where "total" means both dumbbells together. */
export function twoDumbbells(ex: Exercise | undefined): boolean {
  if (!ex || ex.type !== 'weight_reps' || !/dumbbell/i.test(ex.equipment)) return false
  return !/goblet|one.?arm|single|half.?kneeling|glute bridge|hip thrust|pullover/i.test(ex.name)
}
const isolation = (ex: Exercise) => /fly|raise|curl|kickback|extension|shrug/i.test(ex.name)

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
function findExercise(name: string): Exercise | undefined {
  const want = norm(name)
  const all = [...exMap.value.values()]
  return all.find((e) => norm(e.name) === want) || all.find((e) => norm(e.name).includes(want) || want.includes(norm(e.name)))
}

/** Best set per session for one exercise, as total kg you could lift for `reps`. */
function liftSeries(ex: Exercise, reps: number): { pts: Pt[]; sets: WSet[] } {
  const factor = twoDumbbells(ex) ? 2 : 1
  const sessions = [...(sessionsByExercise.value.get(ex.id) || [])].reverse()
  const pts: Pt[] = []
  const sets: WSet[] = []
  for (const s of sessions) {
    let best: WSet | null = null
    let bv = 0
    for (const set of s.sets) {
      if (!counts(set) || !set.weight || !set.reps) continue
      // Reps left in the tank count: 12 reps with 3 left is about a 15-rep effort.
      const v = estimate(set.weight, set.reps + Math.min(5, set.rir ?? 0), reps) * factor
      if (v > bv) (bv = v), (best = set)
    }
    if (best) pts.push({ t: s.workout.start, v: bv }), sets.push(best)
  }
  return { pts, sets }
}

/** Where you are now: the best of the last three weeks, or the latest point if older. */
const recentBest = (pts: Pt[], now: number) => {
  const r = pts.filter((p) => p.t >= now - 21 * DAY)
  return Math.max(...(r.length ? r : pts.slice(-1)).map((p) => p.v))
}

/** Minutes of zone 2 and workout count per Monday-week, oldest first, last `n` weeks incl. this one. */
function weekly(n: number, now: number) {
  const ws = startOfWeek(now)
  const out: { t: number; z2: number; count: number }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const s = ws - i * WEEK
    const inWeek = workouts.value.filter((w) => w.start >= s && w.start < s + WEEK)
    let z2 = 0
    for (const w of inWeek) {
      const hr = summarizeHR(w.hr)
      if (hr) z2 += hr.zoneSeconds[1] / 60
    }
    out.push({ t: s, z2, count: inWeek.length })
  }
  return out
}

// ---------- one goal ----------

export function goalStatus(item: CoachItem, now = Date.now()): GoalStatus {
  const spec: GoalSpec = item.goal || { metric: 'custom' }
  const target = spec.target ?? null
  let series: Pt[] = []
  let current: number | null = null
  let slope: number | null = null
  let unit = ''
  let title = ''
  const extra: Partial<GoalStatus> = {}
  let up = true // higher is better

  if (spec.metric === 'lift') {
    const reps = spec.reps || 1
    unit = 'kg'
    if (!spec.exercise || /^any/i.test(spec.exercise)) {
      title = `Any two-dumbbell lift · ${reps} rep${reps === 1 ? '' : 's'}`
      const lines: (LiftLine & { pts: Pt[]; sets: WSet[] })[] = []
      for (const id of sessionsByExercise.value.keys()) {
        const ex = exMap.value.get(id)
        if (!ex || !twoDumbbells(ex) || isolation(ex)) continue
        const { pts, sets } = liftSeries(ex, reps)
        if (!pts.length || pts[pts.length - 1].t < now - 70 * DAY) continue
        const cur = recentBest(pts, now)
        lines.push({ exerciseId: id, name: ex.name, current: cur, pct: target ? Math.min(1, cur / target) : 0, slope: trendPerWeek(pts, now), sessions: pts.length, pts, sets })
      }
      lines.sort((a, b) => b.current - a.current)
      const top = lines[0]
      if (top) {
        series = top.pts
        current = top.current
        slope = top.slope
        extra.liftName = top.name
        extra.lastSet = top.sets[top.sets.length - 1]
      }
      extra.perHand = true
      extra.lifts = lines.map(({ pts: _p, sets: _s, ...l }) => l)
    } else {
      const ex = findExercise(spec.exercise)
      title = `${ex?.name || spec.exercise} · ${reps} rep${reps === 1 ? '' : 's'}`
      if (ex) {
        const { pts, sets } = liftSeries(ex, reps)
        series = pts
        if (pts.length) (current = recentBest(pts, now)), (slope = trendPerWeek(pts, now)), (extra.lastSet = sets[sets.length - 1])
        extra.liftName = ex.name
        extra.perHand = twoDumbbells(ex)
      }
    }
  } else if (spec.metric === 'bodyweight') {
    unit = 'kg'
    title = 'Body weight'
    const pts = [...bodyWeights.value].reverse().map((b) => ({ t: b.date, v: b.kg }))
    series = pts
    // the weight model's trend (not one heavy morning) is "now"; its rate is the pace, but only
    // once it's distinguishable from holding steady
    const m = weightModel({ list: bodyWeights.value, fasts: fasts.value, now })
    if (m) {
      current = m.trend
      slope = m.ready && m.moving ? m.rate : m.ready ? 0 : trendPerWeek(pts, now)
    }
    up = target != null && series.length ? target > series[0].v : false
  } else if (spec.metric === 'zone2' || spec.metric === 'workouts') {
    const z = spec.metric === 'zone2'
    unit = z ? 'min a week' : 'a week'
    title = z ? 'Zone 2 minutes a week' : 'Workouts a week'
    const w = weekly(9, now)
    const full = w.slice(0, -1) // finished weeks
    series = full.map((x) => ({ t: x.t, v: z ? Math.round(x.z2) : x.count }))
    const last4 = series.slice(-4)
    current = last4.length ? last4.reduce((a, p) => a + p.v, 0) / last4.length : null
    slope = trendPerWeek(series, now)
    if (target != null) extra.lastSet = undefined
  } else if (spec.metric === 'fast') {
    unit = 'h'
    title = 'Longest fast'
    series = fasts.value
      .filter((f) => f.end)
      .reverse()
      .map((f) => ({ t: f.end!, v: (f.end! - f.start) / 3600000 }))
    if (series.length) (current = recentBest(series, now)), (slope = trendPerWeek(series, now))
  } else {
    title = 'Goal'
  }

  const baseline = spec.baseline ?? (series.length ? series[0].v : null)
  let pct = 0
  let state: GoalStatus['state'] = 'open'
  let eta: number | null = null
  const due = item.due ?? null
  let needPerWeek: number | null = null
  if (spec.metric !== 'custom' && target != null) {
    if (current == null) state = 'no-data'
    else {
      const reached = up ? current >= target : current <= target
      const span = target - (baseline ?? current)
      pct = reached ? 1 : span ? Math.max(0, Math.min(1, (current - (baseline ?? current)) / span)) : 0
      if (spec.metric === 'lift' && target) pct = Math.min(1, current / target) // lifts read better as a share of the target
      const toward = slope != null && (up ? slope > 0.01 : slope < -0.01)
      if (reached) (state = 'reached'), (eta = now)
      else if (toward) eta = now + ((target - current) / slope!) * WEEK
      if (!reached && due) needPerWeek = (target - current) / Math.max(0.5, (due - now) / WEEK)
      if (!reached) {
        if (slope == null) state = 'too-early'
        else if (!toward) state = 'behind'
        else if (!due) state = 'on-track'
        else state = eta! <= due - 14 * DAY ? 'ahead' : eta! <= due + 7 * DAY ? 'on-track' : 'behind'
      }
    }
  }
  if (eta && eta > now + 10 * 365 * DAY) eta = null

  // Milestones: the coach's, or even steps toward the target (5 kg per hand for lifts).
  let ms: { value: number; due: number | null; label?: string; cap?: boolean }[] = (spec.milestones || []).map((m) => ({ value: m.value, due: m.due ?? null, label: m.label }))
  if (!ms.length && target != null && spec.metric !== 'custom') {
    const from = Math.min(baseline ?? current ?? 0, current ?? 0)
    const step = spec.metric === 'lift' ? (extra.perHand ? 10 : 5) : spec.metric === 'bodyweight' ? 2 : 0
    if (step) {
      if (up) for (let v = Math.floor(from / step) * step + step; v < target; v += step) ms.push({ value: v, due: null })
      else for (let v = Math.ceil(from / step) * step - step; v > target; v -= step) ms.push({ value: v, due: null })
    }
    ms.push({ value: target, due: due })
  }
  if (spec.metric === 'lift' && spec.equipmentMax && target) {
    const capTotal = spec.equipmentMax * (extra.perHand ? 2 : 1)
    if (capTotal < target && !ms.some((m) => m.value === capTotal)) ms.push({ value: capTotal, due: null, cap: true })
    else ms = ms.map((m) => (m.value === capTotal ? { ...m, cap: true } : m))
  }
  ms.sort((a, b) => (up ? a.value - b.value : b.value - a.value))
  const milestones: GoalMilestone[] = ms.map((m) => {
    const hit = series.find((p) => (up ? p.v >= m.value - 0.05 : p.v <= m.value + 0.05))
    const toward = slope != null && current != null && (up ? slope > 0.01 : slope < -0.01)
    const e = !hit && toward ? now + ((m.value - current!) / slope!) * WEEK : null
    return { value: m.value, due: m.due, cap: m.cap, label: m.label || fmtValue(m.value, spec, extra.perHand), reachedAt: hit ? hit.t : null, eta: e && e > now ? e : null }
  })

  return { item, spec, title, unit, current, target, baseline, pct, slope, eta, due, state, needPerWeek, series, milestones, ...extra }
}

export const openGoals = computed(() => {
  const now = Date.now()
  return coachItems.value
    .filter((x) => x.kind === 'goal' && (x.status || 'open') === 'open')
    .sort((a, b) => (a.created || 0) - (b.created || 0))
    .map((g) => goalStatus(g, now))
})

// ---------- words ----------

export const r1 = (n: number) => (Math.round(n * 2) / 2).toString()

/** A goal value for people: "2 × 50 kg", "82 kg", "150 min a week". */
export function fmtValue(v: number, spec: GoalSpec, perHand?: boolean): string {
  if (spec.metric === 'lift') return perHand ? `2 × ${r1(v / 2)} kg` : `${r1(v)} kg`
  if (spec.metric === 'bodyweight') return `${Math.round(v * 10) / 10} kg`
  if (spec.metric === 'zone2') return `${Math.round(v)} min`
  if (spec.metric === 'workouts') return `${Math.round(v * 10) / 10}`
  if (spec.metric === 'fast') return `${Math.round(v * 10) / 10} h`
  return String(v)
}

export function fmtPace(g: GoalStatus): string {
  if (g.slope == null) return g.series.length ? 'Not enough data for a trend yet' : 'Nothing logged yet'
  const v = g.spec.metric === 'lift' && g.perHand ? g.slope / 2 : g.slope
  const per = g.spec.metric === 'lift' && g.perHand ? ' per hand' : ''
  if (Math.abs(v) < 0.02) return 'Flat lately'
  const n = Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10
  return `${v > 0 ? '+' : '−'}${Math.abs(n)} ${g.unit === 'a week' ? '' : g.unit === 'min a week' ? 'min' : g.unit}${per} a week`.replace(/\s+/g, ' ')
}

export function fmtWhen(t: number | null, now = Date.now()): string {
  if (t == null) return '–'
  const months = (new Date(t).getFullYear() - new Date(now).getFullYear()) * 12 + new Date(t).getMonth() - new Date(now).getMonth()
  if (months <= 0) return 'this month'
  if (months === 1) return 'next month'
  return new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export const STATE_LABEL: Record<GoalStatus['state'], string> = {
  reached: 'Reached',
  ahead: 'Ahead',
  'on-track': 'On track',
  behind: 'Behind',
  'too-early': 'Too early to tell',
  'no-data': 'No data yet',
  open: 'Open',
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10)

/** All open goals as plain text for the coach. */
export function goalsText(): string {
  const list = openGoals.value
  if (!list.length) return 'No open goals. If they mention something they want to achieve, help them turn it into one (propose_goal).'
  return list
    .map((g) => {
      const s = g.spec
      const L: string[] = [`[${g.item.id}] ${g.item.text || g.title}`]
      L.push(`  Measures: ${s.metric}${s.metric === 'lift' ? ` (${g.title}; values are total kg${g.perHand ? ', both dumbbells together' : ''}; estimated from logged sets with Epley)` : ''}${s.equipmentMax ? `; heaviest dumbbell they own ${s.equipmentMax} kg` : ''}`)
      if (g.target != null) L.push(`  Target: ${fmtValue(g.target, s, g.perHand)}${g.due ? ` by ${ymd(g.due)}` : ' (no date)'}; started at ${g.baseline != null ? fmtValue(g.baseline, s, g.perHand) : '?'}`)
      if (g.current != null) L.push(`  Now: ${fmtValue(g.current, s, g.perHand)}${g.liftName ? ` on ${g.liftName}` : ''}${g.lastSet ? ` (last top set ${g.lastSet.weight} kg × ${g.lastSet.reps})` : ''}; ${Math.round(g.pct * 100)}% of the way`)
      L.push(`  Trend: ${fmtPace(g)}; status: ${STATE_LABEL[g.state]}${g.eta && g.state !== 'reached' ? `; at this pace reached around ${ymd(g.eta)}` : ''}${g.needPerWeek != null ? `; needs ${Math.round(g.needPerWeek * 100) / 100} ${g.unit} a week to make the date` : ''}`)
      if (g.series.length) L.push(`  Recent values (oldest → newest): ${g.series.slice(-10).map((p) => `${ymd(p.t).slice(5)} ${fmtValue(p.v, s, g.perHand)}`).join(', ')}`)
      if (g.lifts && g.lifts.length > 1) L.push(`  All lifts: ${g.lifts.map((l) => `${l.name} ${fmtValue(l.current, s, true)} (${Math.round(l.pct * 100)}%, ${l.slope == null ? `${l.sessions} sessions, no trend yet` : `${l.slope >= 0 ? '+' : ''}${r1(l.slope / 2)} kg/hand/week`})`).join('; ')}`)
      if (g.milestones.length) L.push(`  Milestones: ${g.milestones.map((m) => `${m.label}${m.cap ? ' (their heaviest dumbbells)' : ''}${m.reachedAt ? ` reached ${ymd(m.reachedAt)}` : m.due ? ` due ${ymd(m.due)}` : ''}${!m.reachedAt && m.eta ? ` (projected ${ymd(m.eta)})` : ''}`).join('; ')}`)
      return L.join('\n')
    })
    .join('\n')
}
