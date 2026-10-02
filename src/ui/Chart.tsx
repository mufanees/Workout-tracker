import { useState } from 'preact/hooks'
import { fmtNum } from '../util'

export interface Point {
  t: number
  v: number
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

/** Minimal line chart: one series, tap a point to read it. */
/** `best` says which direction is good ('low' for stiffness or resting HR); null hides the label. */
export function LineChart({ points, format, best = 'high' }: { points: Point[]; format: (v: number) => string; best?: 'high' | 'low' | null }) {
  const [sel, setSel] = useState<number | null>(null)
  if (points.length < 2) {
    return <div class="chart-empty">{points.length ? 'Log this exercise once more to see a trend.' : 'No data yet.'}</div>
  }
  const W = 320
  const H = 150
  const pad = { l: 8, r: 8, t: 18, b: 22 }
  const vs = points.map((p) => p.v)
  let lo = Math.min(...vs)
  let hi = Math.max(...vs)
  if (lo === hi) {
    lo -= 1
    hi += 1
  }
  const span = hi - lo
  lo -= span * 0.12
  hi += span * 0.12
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = `${d} L${x(points.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`
  const active = sel ?? points.length - 1
  const ap = points[active]
  const bestV = best === 'low' ? Math.min(...vs) : Math.max(...vs)
  return (
    <div class="chart">
      <div class="chart-readout">
        <b>{format(ap.v)}</b>
        <span>
          {dateFmt.format(new Date(ap.t))}
          {best && ap.v === bestV ? (best === 'low' ? ' · lowest' : ' · best') : ''}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trend from ${format(points[0].v)} to ${format(points[points.length - 1].v)}`}>
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="var(--accent)" stop-opacity=".22" />
            <stop offset="1" stop-color="var(--accent)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} class="chart-axis" />
        <path d={area} fill="url(#chart-fill)" />
        <path d={d} class="chart-line" />
        <line x1={x(active)} x2={x(active)} y1={pad.t - 6} y2={H - pad.b} class="chart-guide" />
        {points.map((p, i) => (
          <circle cx={x(i)} cy={y(p.v)} r={i === active ? 5 : 3} class={'chart-dot' + (i === active ? ' on' : '')} />
        ))}
        <text x={pad.l} y={H - 6} class="chart-label">
          {dateFmt.format(new Date(points[0].t))}
        </text>
        <text x={W - pad.r} y={H - 6} class="chart-label" text-anchor="end">
          {dateFmt.format(new Date(points[points.length - 1].t))}
        </text>
        {points.map((_, i) => {
          const w = (W - pad.l - pad.r) / (points.length - 1)
          return <rect x={x(i) - w / 2} y={0} width={w} height={H} fill="transparent" onPointerDown={() => setSel(i)} onPointerEnter={() => setSel(i)} />
        })}
      </svg>
    </div>
  )
}

export const fmtPlain = (v: number) => fmtNum(v, 1)
