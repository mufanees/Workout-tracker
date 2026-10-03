import { useState } from 'preact/hooks'
import type { WeightModel } from '../weightModel'
import { fmtNum } from '../util'

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const DAY = 86400000

/**
 * Scale readings as faint dots, the model's trend as a solid line, and the forecast as a dashed
 * line inside a cone (the 80% range), with the target as a dashed rule. Tap anywhere to read the
 * trend (or forecast) on that day.
 */
export function WeightChart({ m, conv, unit, weeks = 12, history = 90 }: { m: WeightModel; conv: (kg: number) => number; unit: string; weeks?: number; history?: number }) {
  const [sel, setSel] = useState<number | null>(null)
  const today = m.forecast.length ? m.forecast[0].t - 7 * DAY : m.series[m.series.length - 1].t
  const from = Math.max(m.series[0].t, today - history * DAY)
  const series = m.series.filter((p) => p.t >= from)
  const fc = m.forecast.filter((p) => p.t <= today + weeks * 7 * DAY)
  const last = m.series[m.series.length - 1]
  const to = fc.length ? fc[fc.length - 1].t : last.t
  if (series.length < 2) return null

  const W = 320
  const H = 170
  const pad = { l: 8, r: 8, t: 22, b: 22 }
  const vals = [...series.map((p) => p.kg), ...m.raw.filter((p) => p.day >= from).map((p) => p.kg), ...fc.flatMap((p) => [p.lo, p.hi])]
  if (m.target != null) vals.push(m.target)
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  const span = Math.max(1, hi - lo)
  lo -= span * 0.1
  hi += span * 0.1
  const x = (t: number) => pad.l + ((t - from) / Math.max(1, to - from)) * (W - pad.l - pad.r)
  const y = (kg: number) => pad.t + (1 - (kg - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const line = (pts: { t: number; kg: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ')

  // forecast starts from the trend today
  const start = { t: today, kg: m.trend, lo: m.trend, hi: m.trend }
  const cone = fc.length ? [start, ...fc] : []
  const coneD = cone.length ? `${cone.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.hi).toFixed(1)}`).join(' ')} ${[...cone].reverse().map((p) => `L${x(p.t).toFixed(1)},${y(p.lo).toFixed(1)}`).join(' ')} Z` : ''

  // readout: trend at the tapped time (history), or the forecast
  const all = [...series.map((p) => ({ t: p.t, kg: p.kg, lo: null as number | null, hi: null as number | null })), ...fc.map((p) => ({ t: p.t, kg: p.kg, lo: p.lo as number | null, hi: p.hi as number | null }))]
  const pick = sel == null ? null : all.reduce((b, p) => (Math.abs(p.t - sel) < Math.abs(b.t - sel) ? p : b), all[0])
  const shown = pick || { t: last.t, kg: m.trend, lo: null, hi: null }
  const f = (kg: number) => fmtNum(Math.round(conv(kg) * 10) / 10, 1)
  const onPoint = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setSel(from + ((px - pad.l) / (W - pad.l - pad.r)) * (to - from))
  }

  return (
    <div class="chart weight-chart">
      <div class="chart-readout">
        <b>
          {f(shown.kg)} {unit}
        </b>
        <span>
          {shown.lo != null && shown.hi != null ? `forecast ${dateFmt.format(new Date(shown.t))} · ${f(shown.lo)}–${f(shown.hi)}` : `trend · ${dateFmt.format(new Date(shown.t))}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trend ${f(m.trend)} ${unit}${fc.length ? `, forecast ${f(fc[fc.length - 1].kg)} ${unit} in ${weeks} weeks` : ''}`} onPointerDown={onPoint} onPointerMove={(e) => e.buttons && onPoint(e)}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} class="chart-axis" />
        {m.target != null && <line x1={pad.l} x2={W - pad.r} y1={y(m.target)} y2={y(m.target)} class="wc-target" />}
        {coneD && <path d={coneD} class="wc-cone" />}
        <line x1={x(today)} x2={x(today)} y1={pad.t - 8} y2={H - pad.b} class="wc-today" />
        {m.raw
          .filter((p) => p.day >= from)
          .map((p) => (
            <circle cx={x(p.day)} cy={y(p.kg)} r={2.2} class="wc-dot" />
          ))}
        <path d={line(series)} class="chart-line wc-trend" />
        {cone.length > 0 && <path d={line(cone)} class="wc-fc" />}
        {pick && <line x1={x(pick.t)} x2={x(pick.t)} y1={pad.t - 6} y2={H - pad.b} class="chart-guide" />}
        {pick && <circle cx={x(pick.t)} cy={y(pick.kg)} r={4.5} class="chart-dot on" />}
        <text x={pad.l} y={H - 6} class="chart-label">
          {dateFmt.format(new Date(from))}
        </text>
        {fc.length > 0 && (
          <text x={x(today)} y={H - 6} class="chart-label" text-anchor="middle">
            Today
          </text>
        )}
        <text x={W - pad.r} y={H - 6} class="chart-label" text-anchor="end">
          {dateFmt.format(new Date(to))}
        </text>
        {m.target != null && (
          <text x={W - pad.r} y={y(m.target) - 4} class="chart-label wc-target-label" text-anchor="end">
            Target {f(m.target)}
          </text>
        )}
      </svg>
    </div>
  )
}
