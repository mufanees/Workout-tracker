import type { Exercise, ExType, Workout, WSet, WExercise } from './types'

export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export const LB = 2.2046226218

export function toDisplay(kg: number, unit: 'kg' | 'lb'): number {
  // lb values usually come from converted kg; round to the nearest half pound (26.46 → 26.5, 37.48 → 37.5).
  if (unit === 'lb') return Math.round(kg * LB * 2) / 2
  return Math.round(kg * 100) / 100
}

export function fromDisplay(v: number, unit: 'kg' | 'lb'): number {
  return unit === 'lb' ? v / LB : v
}

export function fmtNum(n: number, max = 2): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: max }).format(n)
}

// ---- Exercise weights: stored per dumbbell for a pair, shown as totals (or each) ----
// The ONE place a logged weight is turned into what you see and back. Storage never changes:
// a pair ('each') keeps one dumbbell's kg, a single weight or a total keeps the whole weight.
// Settings.weightView 'total' (default) shows and takes both dumbbells together for pairs.

export type Load = 'each' | 'one' | 'total'
export type WeightView = 'total' | 'each'

/** A dumbbell lift done with one in each hand (guess from the name; Exercise.load wins in loadOf). */
export function twoDumbbells(ex: Exercise | undefined): boolean {
  if (!ex || ex.type !== 'weight_reps' || !/dumbbell/i.test(ex.equipment)) return false
  return !/goblet|one.?arm|single|half.?kneeling|glute bridge|hip thrust|pullover/i.test(ex.name)
}

/** How an exercise's weight is stored: set by hand, else guessed for dumbbell lifts (a pair → per hand). */
export function loadOf(ex: Exercise | undefined): Load | null {
  if (!ex || ex.type !== 'weight_reps' || ex.equipment === 'Bodyweight') return null
  if (ex.load) return ex.load
  if (!/dumbbell/i.test(ex.equipment)) return null
  return twoDumbbells(ex) ? 'each' : 'one'
}

interface WeightCtx {
  ex: (id: string) => Exercise | undefined
  view: () => WeightView
  unit: () => 'kg' | 'lb'
}
let wctx: WeightCtx = { ex: () => undefined, view: () => 'total', unit: () => 'kg' }
/** Wired to the store once (stats.ts), so defaults follow Settings without every caller passing them. */
export function bindWeights(c: WeightCtx) {
  wctx = c
}
export const weightView = (): WeightView => wctx.view()
export const exById = (id: string) => wctx.ex(id)

/** 2 when a stored weight is one dumbbell of a pair but the view shows both, else 1. */
export function viewFactor(ex: Exercise | undefined, view: WeightView = wctx.view()): 1 | 2 {
  return view === 'total' && loadOf(ex) === 'each' ? 2 : 1
}
/** Both dumbbells for a pair, whatever the view: what volume (weight × reps) counts. */
export function loadFactor(ex: Exercise | undefined): 1 | 2 {
  return loadOf(ex) === 'each' ? 2 : 1
}
/** A stored exercise weight (kg) as shown: doubled for a pair in the total view, then in your unit. */
export function shownWeight(ex: Exercise | undefined, kg: number, unit: 'kg' | 'lb' = wctx.unit(), view: WeightView = wctx.view()): number {
  return toDisplay(kg * viewFactor(ex, view), unit)
}
/** What you typed (in your unit and view) as the stored kg: 13 total for a pair → 6.5 per dumbbell. */
export function storedWeight(ex: Exercise | undefined, shown: number, unit: 'kg' | 'lb' = wctx.unit(), view: WeightView = wctx.view()): number {
  return Math.round((fromDisplay(shown, unit) / viewFactor(ex, view)) * 10000) / 10000
}
/** "12 kg" for a stored 6 kg pair in the total view. */
export function fmtExWeight(ex: Exercise | undefined, kg: number, unit: 'kg' | 'lb' = wctx.unit(), withUnit = true, view: WeightView = wctx.view()): string {
  const s = fmtNum(shownWeight(ex, kg, unit, view), 2)
  return withUnit ? `${s} ${unit}` : s
}
/** Does this exercise's weight column read "each" (one of a pair) rather than a total? */
export function showsEach(ex: Exercise | undefined, view: WeightView = wctx.view()): boolean {
  return view === 'each' && loadOf(ex) === 'each'
}

export function fmtWeight(kg: number | null, unit: 'kg' | 'lb', withUnit = true): string {
  if (kg == null) return 'BW'
  const s = fmtNum(toDisplay(kg, unit), 2)
  return withUnit ? `${s} ${unit}` : s
}

export function fmtVolume(kg: number, unit: 'kg' | 'lb'): string {
  return `${fmtNum(Math.round(unit === 'lb' ? kg * LB : kg))} ${unit}`
}

export function parseNum(s: string): number | null {
  const t = s.replace(',', '.').trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0')
}

export function fmtDuration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function fmtSeconds(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r ? `${m}m ${r}s` : `${m}m`
}

export function fmtRest(s: number): string {
  if (!s) return 'Off'
  return fmtClock(s)
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const dayYearFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

export function fmtDay(t: number): string {
  const d = new Date(t)
  const now = new Date()
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.getFullYear() === now.getFullYear() ? dayFmt.format(d) : dayYearFmt.format(d)
}
export const fmtTime = (t: number) => timeFmt.format(new Date(t))
export const fmtMonth = (t: number) => monthFmt.format(new Date(t))

export function relDays(t: number): string {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(t))) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

export function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Monday-based start of week. */
export function startOfWeek(t: number): number {
  const d = new Date(t)
  const day = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime()
}

export const counts = (s: WSet) => s.done && s.kind !== 'warmup'

/** Estimated one-rep max (Epley). Only meaningful up to ~15 reps. */
export function e1rm(weight: number, reps: number): number {
  if (!weight || !reps) return 0
  if (reps === 1) return weight
  return weight * (1 + Math.min(reps, 15) / 30)
}

export function setVolume(s: WSet): number {
  return s.weight && s.reps ? s.weight * s.reps : 0
}

/** Total weight moved: weight × reps over counted sets, both dumbbells for a pair (whatever the view). */
export function workoutVolume(w: Pick<Workout, 'exercises'>): number {
  let v = 0
  for (const e of w.exercises) {
    const f = loadFactor(wctx.ex(e.exerciseId))
    for (const s of e.sets) if (counts(s)) v += setVolume(s) * f
  }
  return v
}

export function doneSets(w: Pick<Workout, 'exercises'>): number {
  let n = 0
  for (const e of w.exercises) for (const s of e.sets) if (s.done) n++
  return n
}

export function totalSets(w: Pick<Workout, 'exercises'>): number {
  let n = 0
  for (const e of w.exercises) n += e.sets.length
  return n
}

/** One set as text; pass the exercise so a pair's weight shows as you view it (total or each). */
export function fmtSet(s: WSet, type: ExType, unit: 'kg' | 'lb', ex?: Exercise): string {
  if (type === 'duration') return s.seconds != null ? fmtSeconds(s.seconds) : '–'
  if (type === 'reps') return s.reps != null ? `${s.reps} reps` : '–'
  const reps = s.reps ?? '–'
  if (s.weight == null) return `${reps} reps`
  return `${ex ? fmtExWeight(ex, s.weight, unit) : fmtWeight(s.weight, unit)} × ${reps}`
}

export function newSet(kind: WSet['kind'] = 'normal'): WSet {
  return { id: uid('s'), kind, weight: null, reps: null, seconds: null, done: false }
}

export function newWExercise(exerciseId: string, rest: number): WExercise {
  return { id: uid('e'), exerciseId, notes: '', target: '', rest, superset: null, sets: [newSet()] }
}

/** Parse the top of a rep range from text like "10–12 / side" → 12. */
export function targetTop(target: string): number | null {
  const m = target.match(/(\d+)\s*[–-]\s*(\d+)/)
  if (m) return Number(m[2])
  return null
}

/** "8 / side", "30 s each side", "10 per leg", "8 each": done once for each side. */
export function perSide(text: string): boolean {
  return /\/\s*(side|leg|arm)|\b(each|per)\s+(side|leg|arm|way)\b|\beach\b/i.test(text)
}

const TIME = String.raw`(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*(s|secs?|seconds?|m|mins?|minutes?)\b`

/**
 * A time written in a dose: "30 s / side" → 30 s per side, "5 min" → 300 s, "10–15 min" → 900 s
 * (ranges use the top). Null when there's no time unit ("× 8").
 */
export function timeDose(text: string): { secs: number; sides: 1 | 2 } | null {
  const m = text.match(new RegExp(TIME, 'i'))
  if (!m) return null
  const unit = m[3].toLowerCase()
  // a bare "m" is metres unless it's clearly minutes ("5m" walk is ambiguous; treat as minutes only with "min")
  if (unit === 'm') return null
  const n = Number(m[2] ?? m[1])
  const secs = Math.round(unit.startsWith('m') ? n * 60 : n)
  if (!secs) return null
  return { secs, sides: perSide(text) ? 2 : 1 }
}

/** Seconds a duration set aims for, from its target: "20–30 s / side" → 30, "45 s" → 45, "1 min" → 60. */
export function targetSeconds(target: string): number | null {
  const t = timeDose(target)
  if (t) return t.secs
  const m = target.match(/(\d+)(?:\s*[–-]\s*(\d+))?/)
  return m ? Number(m[2] ?? m[1]) : null
}

/**
 * The target tag, spelled out: "8 / side" → "8 reps each side", "20–30 s / side" → "20–30 s each side",
 * "10–12" → "10–12 reps". Anything it doesn't understand is returned as written.
 */
export function fmtTarget(target: string, type: ExType = 'weight_reps'): string {
  const m = target
    .trim()
    .match(/^(\d+(?:\s*[–-]\s*\d+)?)\s*(reps?|s|secs?|seconds?|mins?|minutes?)?\s*(?:(\/\s*|per\s+|each\s+)(side|leg|arm)s?|(each))?$/i)
  if (!m) return target
  const num = m[1].replace(/\s*[–-]\s*/, '–')
  const u = (m[2] || '').toLowerCase()
  const unit = u.startsWith('r') ? 'reps' : u.startsWith('mi') ? 'min' : u ? 's' : type === 'duration' ? 's' : 'reps'
  const side = m[4] ? 'each ' + m[4].toLowerCase() : m[5] ? 'each side' : ''
  return [num, unit === 'reps' && num === '1' ? 'rep' : unit, side].filter(Boolean).join(' ')
}

export const SUPERSET_COLORS = ['#7c5cff', '#ff8a3d', '#1fb8a6', '#e8467c', '#3d9bff', '#c9a227']

export function supersetColor(group: string | null, all: WExercise[]): string | null {
  if (!group) return null
  const groups: string[] = []
  for (const e of all) if (e.superset && !groups.includes(e.superset)) groups.push(e.superset)
  return SUPERSET_COLORS[groups.indexOf(group) % SUPERSET_COLORS.length]
}

export function clone<T>(v: T): T {
  return structuredClone(v)
}

export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* not supported */
  }
}

/** Minutes spent on the warm-up and cool-down checklists, from when items were ticked. */
export function phaseMinutes(w: Pick<Workout, 'start' | 'end' | 'checkAt'>): { warmup: number | null; cooldown: number | null } {
  const at = w.checkAt || {}
  const warm = Object.entries(at).filter(([k]) => /^w\d/.test(k)).map(([, t]) => t)
  const cool = Object.entries(at).filter(([k]) => /^c\d/.test(k)).map(([, t]) => t)
  const end = w.end ?? Date.now()
  return {
    warmup: warm.length ? Math.max(1, Math.round((Math.max(...warm) - w.start) / 60000)) : null,
    cooldown: cool.length > 1 ? Math.max(1, Math.round((Math.max(end, ...cool) - Math.min(...cool)) / 60000)) : null,
  }
}
