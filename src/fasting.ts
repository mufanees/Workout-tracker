// Intermittent fasting: protocols, metabolic stages, stats and the per-day totals used by the calendar.
import { fasts, saveFast, settings } from './store'
import { cancelPush, schedulePush } from './push'
import type { Fast } from './types'
import { fmtDay, fmtTime, startOfDay, uid } from './util'

export const HOUR = 3600000
export const DAY = 86400000

export const PROTOCOLS = [
  { goal: 13, label: '13:11', name: 'Circadian' },
  { goal: 14, label: '14:10', name: 'Gentle start' },
  { goal: 16, label: '16:8', name: 'The classic' },
  { goal: 18, label: '18:6', name: 'Steady' },
  { goal: 20, label: '20:4', name: 'Warrior' },
  { goal: 23, label: 'OMAD', name: 'One meal a day' },
  { goal: 36, label: '36 h', name: 'Skip a day' },
]

export const protocolLabel = (goal: number) => PROTOCOLS.find((p) => p.goal === goal)?.label ?? (goal < 24 ? `${goal}:${24 - goal}` : `${goal} h`)

/** Rough timeline of a fast. It varies a lot between people, so the copy stays modest. */
export const STAGES = [
  {
    at: 0,
    icon: 'utensils',
    name: 'Digesting',
    text: 'Blood sugar rises while your last meal is absorbed.',
  },
  {
    at: 4,
    icon: 'trendDown',
    name: 'Blood sugar falling',
    text: 'Insulin heads back toward baseline.',
  },
  {
    at: 8,
    icon: 'droplet',
    name: 'Blood sugar steady',
    text: 'Your body draws on stored glycogen for fuel.',
  },
  {
    at: 12,
    icon: 'flame',
    name: 'Fat burning',
    text: 'Glycogen runs low and fat becomes a bigger share of your fuel.',
  },
  {
    at: 18,
    icon: 'zap',
    name: 'Ketosis',
    text: 'Ketones climb. Many people feel clear-headed here. Drink water.',
  },
  {
    at: 24,
    icon: 'recycle',
    name: 'Deep fast',
    text: 'Past a day, cell clean-up (autophagy) is thought to ramp up. Keep electrolytes up.',
  },
] as const

export type Stage = (typeof STAGES)[number]
export const stageAt = (hours: number): Stage => [...STAGES].reverse().find((s) => hours >= s.at) || STAGES[0]
export const nextStage = (hours: number): Stage | null => STAGES.find((s) => s.at > hours) || null

/** "15h 04m" */
export const hm = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
/** "15h" / "15.5h" for compact pills */
export const hShort = (ms: number) => {
  const h = ms / HOUR
  return h >= 10 || Math.abs(h - Math.round(h)) < 0.05 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`
}

/** "2026-10-02T07:30" for datetime-local inputs, in local time. */
export const toLocalInput = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16)

/** Local calendar date, "YYYY-MM-DD". */
export function dayKey(t: number) {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function parseDayKey(k: string) {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

// ---- actions ----------------------------------------------------------------------

function pushDone(f: Fast) {
  schedulePush('fast', f.start + f.goal * HOUR, 'Fast complete', `You reached ${protocolLabel(f.goal)}. End it in Gloop whenever you eat.`)
}

/** Reminder 30 minutes before the eating window closes (daily protocols only). */
function pushWindow(end: number, goal: number) {
  cancelPush('eat')
  if (goal >= 24 || settings.value.fastRemind === false) return
  const at = end + (24 - goal) * HOUR - 30 * 60000
  if (at > Date.now()) schedulePush('eat', at, 'Eating window closes in 30 minutes', `Finish up, then start your next ${protocolLabel(goal)} fast.`)
}

export async function startFast(start = Date.now(), goal = settings.value.fastGoal) {
  // never overlap the previous fast
  const lastEnd = fasts.value.find((x) => x.end != null)?.end ?? 0
  const f = await saveFast({ id: uid('f'), start: Math.max(lastEnd, Math.min(start, Date.now())), end: null, goal, updatedAt: 0 })
  cancelPush('eat')
  pushDone(f)
  return f
}

export async function endFast(f: Fast, end = Date.now()) {
  const saved = await saveFast({
    ...f,
    end: Math.max(f.start + 60000, Math.min(end, Date.now())),
  })
  cancelPush('fast')
  pushWindow(saved.end!, saved.goal)
  return saved
}

/** Saves an edited or new past fast and keeps notifications in step with the current one. */
export async function saveFastEdit(f: Fast) {
  const saved = await saveFast(f)
  if (saved.end == null) pushDone(saved)
  else if (!fasts.value.some((x) => x.end == null) && latestDone()?.id === saved.id) pushWindow(saved.end, saved.goal) // its end moved
  return saved
}

const latestDone = () => fasts.value.reduce<Fast | null>((a, x) => (x.end != null && (!a || x.end > a.end!) ? x : a), null)

/**
 * Why a fast can't have these times, or null when they're fine: a real start, the end after
 * the start, nothing in the future, and no overlap with another fast.
 */
export function fastTimesError(f: Fast, start: number, end: number | null, list: Fast[] = fasts.value, now = Date.now()): string | null {
  if (!Number.isFinite(start) || (end != null && (!Number.isFinite(end) || end <= start))) return 'The end has to be after the start'
  if (start > now || (end != null && end > now + 60000)) return 'That’s in the future'
  const e = end ?? now
  const clash = list.find((x) => x.id !== f.id && x.start < e && (x.end ?? now) > start)
  if (clash) {
    const t = clash.end ?? clash.start
    return `That overlaps your fast ${clash.end ? 'ending' : 'from'} ${fmtDay(t).replace(/^(Today|Yesterday)$/, (m) => m.toLowerCase())}, ${fmtTime(t)}`
  }
  return null
}

/** The nearest other fasts before and after `f`, which its times can't cross. */
export function fastNeighbours(f: Fast, list: Fast[] = fasts.value) {
  const others = list.filter((x) => x.id !== f.id)
  const prev = others.filter((x) => x.end != null && x.end <= f.start).reduce<Fast | null>((a, x) => (!a || x.end! > a.end! ? x : a), null)
  const next = others.filter((x) => f.end != null && x.start >= f.end).reduce<Fast | null>((a, x) => (!a || x.start < a.start ? x : a), null)
  return { prev, next }
}

// ---- stats ------------------------------------------------------------------------

const lengthOf = (f: Fast, now = Date.now()) => (f.end ?? now) - f.start
export const hitGoal = (f: Fast, now = Date.now()) => lengthOf(f, now) >= f.goal * HOUR

/** The day a fast counts toward: the day it ended (or today while it's running). */
export const fastDay = (f: Fast, now = Date.now()) => startOfDay(new Date(f.end ?? now))

export interface DayFasts {
  ms: number
  hit: boolean
  live: boolean
  list: Fast[]
}

/** Fasted time per local day (start of day → totals), for the calendar and day pages. */
export function fastsByDay(list: Fast[] = fasts.value, now = Date.now()) {
  const out = new Map<number, DayFasts>()
  for (const f of list) {
    const d = fastDay(f, now)
    const cur = out.get(d) || { ms: 0, hit: false, live: false, list: [] }
    cur.ms += lengthOf(f, now)
    cur.hit ||= hitGoal(f, now)
    cur.live ||= f.end == null
    cur.list.push(f)
    out.set(d, cur)
  }
  return out
}

export function fastStats(list: Fast[] = fasts.value, now = Date.now()) {
  const done = list.filter((f) => f.end != null)
  const hitDays = [...new Set(done.filter((f) => hitGoal(f)).map((f) => fastDay(f)))].sort((a, b) => a - b)
  // current streak: consecutive goal days ending today or yesterday
  const set = new Set(hitDays)
  let streak = 0
  let day = startOfDay(new Date(now))
  if (!set.has(day)) day -= DAY
  while (set.has(day)) {
    streak++
    day = startOfDay(new Date(day - DAY / 2))
  }
  let best = 0
  let run = 0
  let prev = -Infinity
  for (const d of hitDays) {
    run = d - prev <= DAY * 1.5 ? run + 1 : 1 // tolerant of DST days
    best = Math.max(best, run)
    prev = d
  }
  const last7 = done.filter((f) => f.end! > now - 7 * DAY)
  const last30 = done.filter((f) => f.end! > now - 30 * DAY)
  const avg7 = last7.length ? last7.reduce((a, f) => a + lengthOf(f), 0) / last7.length : 0
  const longest = done.reduce<Fast | null>((a, f) => (!a || lengthOf(f) > lengthOf(a) ? f : a), null)
  const totalMs = done.reduce((a, f) => a + lengthOf(f), 0)
  const hitRate = last30.length ? last30.filter((f) => hitGoal(f)).length / last30.length : null
  return {
    streak,
    best,
    avg7,
    count7: last7.length,
    longest,
    total: done.length,
    totalMs,
    hitRate,
  }
}
