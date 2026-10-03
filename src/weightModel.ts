// Body-weight model: what your weight is really doing under the daily noise, and where it's heading.
//
// The scale mixes two things: your actual (tissue) weight, which moves slowly, and water, gut
// contents and glycogen, which swing ±1 kg day to day. A local linear trend Kalman filter separates
// them. The hidden state is [trend weight, rate of change]; each weigh-in is the trend plus noise.
// It copes with missed days (the uncertainty grows with the gap), gives a rate with an honest
// error bar, and a forecast whose band widens the further out it looks. A Rauch–Tung–Striebel pass
// then smooths the trend line backwards for the chart.
//
// On top of the residuals (scale minus trend) it looks for patterns worth telling you about:
// a weekday that reads heavy, the morning-after effect of a long fast, and plateaus.

import type { BodyWeight, Fast } from './types'
import { startOfDay } from './util'

const DAY = 86400000

export interface WeighIn {
  /** local start of day */
  day: number
  /** mean of that day's readings */
  kg: number
  /** time of the first reading (for the fasting effect) */
  t: number
}

export interface TrendPoint {
  t: number
  /** smoothed trend weight */
  kg: number
  /** ± one standard deviation of the trend */
  sd: number
}

export interface ForecastPoint {
  t: number
  kg: number
  lo: number
  hi: number
}

export interface Pattern {
  kind: 'weekday' | 'fast' | 'water' | 'plateau' | 'pace'
  text: string
}

export interface WeightModel {
  n: number
  spanDays: number
  /** enough data for a rate and a forecast */
  ready: boolean
  /** latest scale reading and the trend under it */
  latest: WeighIn
  trend: number
  trendSd: number
  /** kg per week, and its standard error */
  rate: number
  rateSd: number
  /** the rate is distinguishable from zero (|rate| > 1.64 sd) */
  moving: boolean
  /** % of body weight per week (negative = losing) */
  pctPerWeek: number
  /** day-to-day scale noise (sd, kg) learned from your data */
  noise: number
  /** one scale reading per day (the day's mean), oldest first */
  raw: WeighIn[]
  series: TrendPoint[]
  forecast: ForecastPoint[]
  /** in 4 and 12 weeks */
  at4: ForecastPoint | null
  at12: ForecastPoint | null
  /** target from settings, with when you'd get there at this rate (and a likely range) */
  target: number | null
  eta: number | null
  etaLo: number | null
  etaHi: number | null
  /** kg per week needed to hit the target by `targetBy` */
  needPerWeek: number | null
  patterns: Pattern[]
}

/** One reading per day: the day's mean. Oldest first. */
export function dailyWeighIns(list: BodyWeight[]): WeighIn[] {
  const by = new Map<number, { sum: number; n: number; t: number }>()
  for (const b of list) {
    if (!(b.kg > 0)) continue
    const d = startOfDay(new Date(b.date))
    const x = by.get(d)
    if (x) (x.sum += b.kg), x.n++, (x.t = Math.min(x.t, b.date))
    else by.set(d, { sum: b.kg, n: 1, t: b.date })
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([day, x]) => ({ day, kg: x.sum / x.n, t: x.t }))
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Day-to-day scale noise (sd), from consecutive-day differences, robust to the odd outlier. */
export function scaleNoise(w: WeighIn[]): number {
  const d: number[] = []
  for (let i = 1; i < w.length; i++) if (Math.round((w[i].day - w[i - 1].day) / DAY) === 1) d.push(w[i].kg - w[i - 1].kg)
  if (d.length < 5) return 0.5
  const m = median(d)
  const mad = median(d.map((x) => Math.abs(x - m)))
  // a difference of two noisy readings has twice the variance of one
  return Math.min(1.2, Math.max(0.15, (1.4826 * mad) / Math.SQRT2))
}

// Process noise. Trend weight wanders a little on its own (glycogen, a big weekend), and the
// rate itself drifts slowly: ~0.15 kg/week over a month.
const Q_LEVEL = 0.03 ** 2 // kg² per day
const Q_RATE = 0.004 ** 2 // (kg/day)² per day

type V2 = [number, number]
type M2 = [[number, number], [number, number]]

const predict = (x: V2, P: M2, dt: number): [V2, M2] => {
  const xp: V2 = [x[0] + x[1] * dt, x[1]]
  // F P Fᵀ with F = [[1, dt], [0, 1]]
  const a = P[0][0] + dt * (P[1][0] + P[0][1]) + dt * dt * P[1][1]
  const b = P[0][1] + dt * P[1][1]
  const c = P[1][1]
  // integrated random walk on the rate, plus a little level noise
  const q00 = Q_RATE * (dt ** 3 / 3) + Q_LEVEL * dt
  const q01 = Q_RATE * (dt ** 2 / 2)
  const q11 = Q_RATE * dt
  return [xp, [[a + q00, b + q01], [b + q01, c + q11]]]
}

interface Step {
  day: number
  xf: V2
  Pf: M2
  xp: V2
  Pp: M2
  dt: number
}

/** Forward Kalman pass. Rates are kg/day internally. */
function filter(w: WeighIn[], R: number): Step[] {
  const steps: Step[] = []
  let x: V2 = [w[0].kg, 0]
  // start unsure of the rate (sd 0.1 kg/day ≈ 0.7 kg/week)
  let P: M2 = [[R, 0], [0, 0.1 ** 2]]
  steps.push({ day: w[0].day, xf: x, Pf: P, xp: x, Pp: P, dt: 0 })
  for (let i = 1; i < w.length; i++) {
    const dt = (w[i].day - w[i - 1].day) / DAY
    const [xp, Pp] = predict(x, P, dt)
    // observe the level: H = [1, 0]
    const S = Pp[0][0] + R
    const k0 = Pp[0][0] / S
    const k1 = Pp[1][0] / S
    const y = w[i].kg - xp[0]
    x = [xp[0] + k0 * y, xp[1] + k1 * y]
    P = [
      [(1 - k0) * Pp[0][0], (1 - k0) * Pp[0][1]],
      [Pp[1][0] - k1 * Pp[0][0], Pp[1][1] - k1 * Pp[0][1]],
    ]
    steps.push({ day: w[i].day, xf: x, Pf: P, xp, Pp, dt })
  }
  return steps
}

/** Rauch–Tung–Striebel smoother: the best trend estimate at each day, using the days after it too. */
function smooth(steps: Step[]): { x: V2; P: M2 }[] {
  const n = steps.length
  const out: { x: V2; P: M2 }[] = new Array(n)
  out[n - 1] = { x: steps[n - 1].xf, P: steps[n - 1].Pf }
  for (let i = n - 2; i >= 0; i--) {
    const { xf, Pf } = steps[i]
    const { xp, Pp, dt } = steps[i + 1]
    // C = Pf Fᵀ Pp⁻¹
    const PfFt: M2 = [
      [Pf[0][0] + dt * Pf[0][1], Pf[0][1]],
      [Pf[1][0] + dt * Pf[1][1], Pf[1][1]],
    ]
    const det = Pp[0][0] * Pp[1][1] - Pp[0][1] * Pp[1][0]
    const inv: M2 = [
      [Pp[1][1] / det, -Pp[0][1] / det],
      [-Pp[1][0] / det, Pp[0][0] / det],
    ]
    const C: M2 = [
      [PfFt[0][0] * inv[0][0] + PfFt[0][1] * inv[1][0], PfFt[0][0] * inv[0][1] + PfFt[0][1] * inv[1][1]],
      [PfFt[1][0] * inv[0][0] + PfFt[1][1] * inv[1][0], PfFt[1][0] * inv[0][1] + PfFt[1][1] * inv[1][1]],
    ]
    const nx = out[i + 1].x
    const nP = out[i + 1].P
    const dx: V2 = [nx[0] - xp[0], nx[1] - xp[1]]
    const x: V2 = [xf[0] + C[0][0] * dx[0] + C[0][1] * dx[1], xf[1] + C[1][0] * dx[0] + C[1][1] * dx[1]]
    const dP: M2 = [
      [nP[0][0] - Pp[0][0], nP[0][1] - Pp[0][1]],
      [nP[1][0] - Pp[1][0], nP[1][1] - Pp[1][1]],
    ]
    // P = Pf + C dP Cᵀ
    const CdP: M2 = [
      [C[0][0] * dP[0][0] + C[0][1] * dP[1][0], C[0][0] * dP[0][1] + C[0][1] * dP[1][1]],
      [C[1][0] * dP[0][0] + C[1][1] * dP[1][0], C[1][0] * dP[0][1] + C[1][1] * dP[1][1]],
    ]
    const P: M2 = [
      [Pf[0][0] + CdP[0][0] * C[0][0] + CdP[0][1] * C[0][1], Pf[0][1] + CdP[0][0] * C[1][0] + CdP[0][1] * C[1][1]],
      [Pf[1][0] + CdP[1][0] * C[0][0] + CdP[1][1] * C[0][1], Pf[1][1] + CdP[1][0] * C[1][0] + CdP[1][1] * C[1][1]],
    ]
    out[i] = { x, P }
  }
  return out
}

/** Hours of fasting in the `hours` before `t`. */
function fastedBefore(list: Fast[], t: number, hours = 24): number {
  const from = t - hours * 3600000
  let ms = 0
  for (const f of list) {
    const a = Math.max(f.start, from)
    const b = Math.min(f.end ?? t, t)
    if (b > a) ms += b - a
  }
  return ms / 3600000
}

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
const r1 = (x: number) => Math.round(x * 10) / 10
const fmtKg = (x: number) => `${r1(Math.abs(x))} kg`

/** z for an 80% interval */
const Z80 = 1.2816

export interface ModelInput {
  list: BodyWeight[]
  fasts?: Fast[]
  target?: number | null
  /** optional deadline for the target */
  targetBy?: number | null
  now?: number
}

export function weightModel({ list, fasts: fl = [], target = null, targetBy = null, now = Date.now() }: ModelInput): WeightModel | null {
  const w = dailyWeighIns(list)
  if (!w.length) return null
  const noise = scaleNoise(w)
  const R = noise ** 2
  const steps = filter(w, R)
  const sm = smooth(steps)
  const last = steps[steps.length - 1]
  const spanDays = (w[w.length - 1].day - w[0].day) / DAY
  // a rate needs a couple of weeks of weigh-ins
  const ready = w.length >= 6 && spanDays >= 10

  // Bring the latest estimate forward to today (a gap since the last weigh-in widens the band).
  const today = startOfDay(new Date(now))
  const gap = Math.max(0, (today - last.day) / DAY)
  const [xNow, PNow] = gap ? predict(last.xf, last.Pf, gap) : [last.xf, last.Pf]
  const trend = xNow[0]
  const trendSd = Math.sqrt(PNow[0][0])
  const rate = xNow[1] * 7
  const rateSd = Math.sqrt(PNow[1][1]) * 7
  const moving = Math.abs(rate) > 1.64 * rateSd
  const pctPerWeek = (rate / trend) * 100

  const series: TrendPoint[] = sm.map((s, i) => ({ t: w[i].day, kg: s.x[0], sd: Math.sqrt(Math.max(0, s.P[0][0])) }))

  // Forecast the trend 12 weeks out, with an 80% band. The rate is damped a little each week:
  // weight change slows as you get lighter and adapt, so a straight line overpromises.
  const forecast: ForecastPoint[] = []
  if (ready) {
    const DAMP = 0.985 // per week
    let x: V2 = xNow
    let P: M2 = PNow
    for (let d = 7; d <= 84; d += 7) {
      ;[x, P] = predict(x, P, 7)
      x = [x[0], x[1] * DAMP]
      const sd = Math.sqrt(P[0][0])
      forecast.push({ t: today + d * DAY, kg: x[0], lo: x[0] - Z80 * sd, hi: x[0] + Z80 * sd })
    }
  }
  const at4 = forecast[3] || null
  const at12 = forecast[11] || null

  // When you'd reach the target at this rate, and a range using the rate's own error bar.
  let eta: number | null = null
  let etaLo: number | null = null
  let etaHi: number | null = null
  let needPerWeek: number | null = null
  if (target != null && ready) {
    const toGo = target - trend
    const when = (r: number) => (r !== 0 && Math.sign(r) === Math.sign(toGo) ? today + (toGo / r) * 7 * DAY : null)
    const cap = (t: number | null) => (t != null && t - today < 3 * 365 * DAY ? t : null)
    if (Math.abs(toGo) < 0.2) eta = today
    else if (moving) {
      eta = cap(when(rate))
      const fast = when(rate + Math.sign(toGo) * Z80 * rateSd)
      const slow = when(rate - Math.sign(toGo) * Z80 * rateSd)
      etaLo = cap(fast)
      etaHi = cap(slow)
    }
    if (targetBy && targetBy > today) needPerWeek = toGo / ((targetBy - today) / (7 * DAY))
  }

  // ---- patterns in the residuals ----
  const patterns: Pattern[] = []
  const resid = w.map((x, i) => ({ ...x, r: x.kg - series[i].kg }))
  const latest = w[w.length - 1]
  const latestResid = resid[resid.length - 1].r

  // Latest reading vs trend: a big gap is almost always water, salt or food in transit.
  if (ready && Math.abs(latestResid) > Math.max(0.5, 1.5 * noise) && today - latest.day < 2 * DAY) {
    patterns.push({
      kind: 'water',
      text: latestResid > 0 ? `Your latest reading is ${fmtKg(latestResid)} above your trend. That’s water, salt or food in transit, not fat; the trend barely moves.` : `Your latest reading is ${fmtKg(latestResid)} below your trend, likely water. Don’t bank it yet; the trend is the number to watch.`,
    })
  }

  // Weekday effect: needs 3+ weeks and 2+ readings on that weekday. Seven weekdays are seven
  // chances to find something by luck, so the bar is z > 2.7 (about 5% across all seven).
  if (spanDays >= 21) {
    const byDay = Array.from({ length: 7 }, () => [] as number[])
    for (const x of resid) byDay[new Date(x.day).getDay()].push(x.r)
    let best: { d: number; mean: number; se: number } | null = null
    byDay.forEach((xs, d) => {
      if (xs.length < 2) return
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length
      const se = noise / Math.sqrt(xs.length)
      if (Math.abs(mean) >= 0.35 && Math.abs(mean) > 2.7 * se && (!best || Math.abs(mean) > Math.abs(best.mean))) best = { d, mean, se }
    })
    if (best) {
      const b = best as { d: number; mean: number }
      patterns.push({ kind: 'weekday', text: `${WEEKDAYS[b.d]} usually read ${fmtKg(b.mean)} ${b.mean > 0 ? 'above' : 'below'} your trend${b.mean > 0 && (b.d === 1 || b.d === 0) ? ' (the weekend shows up on the scale)' : ''}. Don’t read much into them.` })
    }
  }

  // Morning after a long fast: compare residuals after 14+ h fasted vs not.
  if (fl.length) {
    const fasted: number[] = []
    const fed: number[] = []
    for (const x of resid) (fastedBefore(fl, x.t) >= 14 ? fasted : fed).push(x.r)
    if (fasted.length >= 4 && fed.length >= 4) {
      const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
      const diff = m(fasted) - m(fed)
      const se = noise * Math.sqrt(1 / fasted.length + 1 / fed.length)
      if (Math.abs(diff) >= 0.25 && Math.abs(diff) > 2 * se)
        patterns.push({ kind: 'fast', text: diff < 0 ? `After a 14 h+ fast the scale reads about ${fmtKg(diff)} lower than your trend. Most of that is water and glycogen and comes back when you eat; the trend already accounts for it.` : `Oddly, mornings after a long fast read ${fmtKg(diff)} higher than your trend; worth checking what the refeed meal looks like.` })
    }
  }

  // Plateau: the rate three weeks ago was clearly toward the target (or clearly moving), now it isn't.
  if (ready && spanDays >= 35) {
    // what the filter believed then (the smoothed value already knows about the plateau)
    const idx = steps.findIndex((s) => s.day >= last.day - 21 * DAY)
    const then = idx > 0 ? { x: steps[idx].xf, P: steps[idx].Pf } : null
    if (then) {
      const rThen = then.x[1] * 7
      const sdThen = Math.sqrt(then.P[1][1]) * 7
      const wasMoving = Math.abs(rThen) > 1.64 * sdThen
      const toward = target == null || Math.sign(rThen) === Math.sign(target - then.x[0])
      if (wasMoving && toward && !moving) patterns.push({ kind: 'plateau', text: `Your trend has flattened over the last three weeks after ${rThen < 0 ? 'losing' : 'gaining'} ${fmtKg(rThen)} a week. Plateaus are normal; if it holds another two weeks, it’s time to adjust food or activity.` })
    }
  }

  // Pace sanity.
  if (ready && moving) {
    if (pctPerWeek < -1) patterns.push({ kind: 'pace', text: `You’re losing about ${r1(-pctPerWeek)}% of your body weight a week, on the fast side. Keep protein high and keep lifting so most of it comes off as fat.` })
    else if (pctPerWeek <= -0.25) patterns.push({ kind: 'pace', text: `Losing about ${r1(-pctPerWeek)}% of your body weight a week: a sustainable pace that keeps muscle.` })
  }

  return { n: w.length, spanDays, ready, latest, trend, trendSd, rate, rateSd, moving, pctPerWeek, noise, raw: w, series, forecast, at4, at12, target, eta, etaLo, etaHi, needPerWeek, patterns }
}

/** For the coach. */
export function weightModelText(m: WeightModel | null): string {
  if (!m) return 'No weigh-ins yet.'
  const d = (t: number) => new Date(t).toISOString().slice(0, 10)
  const L = [`${m.n} weigh-in days over ${Math.round(m.spanDays)} days; scale noise ±${r1(m.noise)} kg day to day.`]
  L.push(`Trend weight now ${r1(m.trend)} kg (latest scale ${r1(m.latest.kg)} kg on ${d(m.latest.day)}).`)
  if (!m.ready) L.push('Not enough data yet for a reliable rate (needs ~6 weigh-ins over 10+ days).')
  else {
    L.push(`Rate ${m.rate >= 0 ? '+' : ''}${r1(m.rate)} ± ${r1(m.rateSd)} kg/week (${m.moving ? (m.rate < 0 ? 'clearly losing' : 'clearly gaining') : 'not distinguishable from holding steady'}; ${r1(m.pctPerWeek)}% of body weight a week).`)
    if (m.at4) L.push(`Forecast (80% range): in 4 weeks ${r1(m.at4.kg)} kg (${r1(m.at4.lo)}–${r1(m.at4.hi)}), in 12 weeks ${m.at12 ? `${r1(m.at12.kg)} kg (${r1(m.at12.lo)}–${r1(m.at12.hi)})` : '?'}.`)
    if (m.target != null) L.push(m.eta ? `Target ${r1(m.target)} kg: around ${d(m.eta)}${m.etaLo && m.etaHi ? ` (likely ${d(m.etaLo)} to ${d(m.etaHi)})` : m.etaLo ? ` (from ${d(m.etaLo)}, could stall)` : ''}.` : `Target ${r1(m.target)} kg: no date yet, ${m.moving ? 'moving away from it' : 'holding steady'} at the moment.`)
  }
  for (const p of m.patterns) L.push(`Pattern: ${p.text}`)
  return L.join('\n')
}
