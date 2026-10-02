import { useState } from 'preact/hooks'
import { active, settings, updateActive } from '../store'
import { bpm, connectHR, hrName, hrStatus, hrSupported, summarizeHR, zone, zoneAlert, ZONE_COLORS, ZONE_NAMES, zoneOf, zoneRange } from '../hr'
import type { Workout } from '../types'
import { Icon } from './icons'
import { actionSheet, toast } from './overlay'

const mins = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`)

/** Live heart rate during a workout: number, zone, where you sit across the zones, time in target. */
export function HRPanel() {
  const w = active.value
  if (!hrSupported || !w) return null
  const status = hrStatus.value
  const target = w.targetZone ?? settings.value.targetZone

  if (status === 'off' || status === 'connecting') {
    return (
      <button
        class="hr-connect"
        disabled={status === 'connecting'}
        onClick={async () => {
          if (await connectHR()) toast(`Connected to ${hrName.value}`)
        }}
      >
        <Icon name="heart" size={18} />
        <span>{status === 'connecting' ? 'Looking for your strap…' : 'Connect heart rate'}</span>
        <Icon name="bluetooth" size={16} class="muted" />
      </button>
    )
  }

  const hr = bpm.value
  const z = zone.value
  const bounds = settings.value.hrZones
  // Place the marker across a scale from 20 bpm below zone 2 to 15 above zone 5's start.
  const lo = bounds[0] - 20
  const hi = bounds[3] + 15
  const pos = hr ? Math.min(100, Math.max(0, ((hr - lo) / (hi - lo)) * 100)) : null
  const edges = [lo, ...bounds, hi].map((b) => ((b - lo) / (hi - lo)) * 100)
  const summary = summarizeHR(w.hr)
  const alert = zoneAlert.value

  const pickTarget = () =>
    actionSheet({
      title: 'Hold a zone',
      message: 'Your phone buzzes when you drift out of it for 15 seconds.',
      actions: [
        { label: 'No target', selected: !target, onSelect: () => updateActive((x) => void (x.targetZone = null)) },
        ...[1, 2, 3, 4, 5].map((n) => ({
          label: `Zone ${n} · ${ZONE_NAMES[n - 1]}`,
          hint: zoneRange(n),
          selected: target === n,
          onSelect: () => updateActive((x) => void (x.targetZone = n)),
        })),
      ],
    })

  return (
    <section class={'hr-panel' + (alert ? ' alert' : '')} style={z ? { '--zc': ZONE_COLORS[z - 1] } : undefined} aria-live="polite">
      <div class="hr-top">
        <div class="hr-reading">
          <Icon name="heart" size={20} class={'hr-heart' + (hr ? ' beat' : '')} />
          <b>{hr ?? '--'}</b>
          <span>bpm</span>
        </div>
        <div class="hr-zone">
          {z ? (
            <>
              <b>Zone {z}</b>
              <span>{ZONE_NAMES[z - 1]}</span>
            </>
          ) : (
            <span>{status === 'reconnecting' ? 'Reconnecting…' : 'Waiting for signal'}</span>
          )}
        </div>
        <button class="tag tag-btn" onClick={pickTarget} aria-label="Target zone">
          <Icon name="target" size={13} /> {target ? `Z${target}` : 'Target'}
        </button>
      </div>
      <div class="hr-scale" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            class={'hr-seg' + (target === i + 1 ? ' target' : '')}
            style={{ left: edges[i] + '%', width: edges[i + 1] - edges[i] + '%', background: ZONE_COLORS[i] }}
          />
        ))}
        {pos != null && <i class="hr-marker" style={{ left: pos + '%' }} />}
      </div>
      {alert && (
        <p class="hr-alert">
          <Icon name={alert === 'above' ? 'downArrow' : 'up'} size={16} />
          {alert === 'above' ? `Above zone ${target}. Ease off a little.` : `Below zone ${target}. Pick it up a little.`}
        </p>
      )}
      {summary && (
        <div class="hr-mini">
          <span>Avg {summary.avg}</span>
          <span>Max {summary.max}</span>
          {target ? (
            <span>
              Z{target} {mins(summary.zoneSeconds[target - 1])}
            </span>
          ) : null}
        </div>
      )}
    </section>
  )
}

/** Heart rate summary for a finished workout. */
export function HRSummaryCard({ w }: { w: Workout }) {
  const s = summarizeHR(w.hr)
  const [sel, setSel] = useState<number | null>(null)
  if (!s || !w.hr) return null
  const total = s.zoneSeconds.reduce((a, b) => a + b, 0) || 1
  const target = w.targetZone
  return (
    <section class="card hr-card">
      <div class="hr-card-head">
        <h2 class="section-title">Heart rate</h2>
        <div class="hr-card-stats">
          <span>
            <b>{s.avg}</b> avg
          </span>
          <span>
            <b>{s.max}</b> max
          </span>
        </div>
      </div>
      <HRChart samples={w.hr} />
      <div class="zone-stack" role="img" aria-label="Time in each zone">
        {s.zoneSeconds.map((sec, i) => (sec > 0 ? <span style={{ width: (sec / total) * 100 + '%', background: ZONE_COLORS[i] }} /> : null))}
      </div>
      <ul class="zone-list">
        {[5, 4, 3, 2, 1].map((z) => {
          const sec = s.zoneSeconds[z - 1]
          return (
            <li class={(target === z ? 'target ' : '') + (sel === z ? 'sel' : '')} onClick={() => setSel(sel === z ? null : z)}>
              <i style={{ background: ZONE_COLORS[z - 1] }} />
              <span class="zl-name">
                Zone {z} <small>{ZONE_NAMES[z - 1]}</small>
              </span>
              <span class="zl-range">{zoneRange(z)}</span>
              <b class="zl-time">{mins(sec)}</b>
              <span class="zl-pct">{Math.round((sec / total) * 100)}%</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Heart rate over time, with the zones drawn as bands behind the line. */
export function HRChart({ samples }: { samples: [number, number][] }) {
  const W = 320
  const H = 120
  const bounds = settings.value.hrZones
  const hrs = samples.map((p) => p[1])
  const lo = Math.min(...hrs, bounds[0]) - 8
  const hi = Math.max(...hrs, bounds[2]) + 8
  const tMax = samples[samples.length - 1][0] || 1
  const x = (t: number) => (t / tMax) * W
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H
  const band = (a: number, b: number, i: number) => {
    const top = y(Math.min(b, hi))
    const bottom = y(Math.max(a, lo))
    return bottom > top ? <rect x={0} y={top} width={W} height={bottom - top} fill={ZONE_COLORS[i]} opacity={0.12} /> : null
  }
  const edges = [lo, ...bounds, hi]
  const d = samples.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')
  return (
    <svg class="hr-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Heart rate over the workout">
      {[0, 1, 2, 3, 4].map((i) => band(edges[i], edges[i + 1], i))}
      <path d={d} fill="none" stroke="var(--text)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </svg>
  )
}

/** Small summary line for history cards. */
export function hrLine(w: Workout): string | null {
  const s = summarizeHR(w.hr)
  if (!s) return null
  const target = w.targetZone
  return target ? `${s.avg} bpm · Z${target} ${mins(s.zoneSeconds[target - 1])}` : `${s.avg} bpm avg`
}

export { zoneOf }

/** Minutes in each zone per week, last 12 weeks, stacked. */
export function ZoneTrends({ workouts }: { workouts: Workout[] }) {
  const WEEK = 7 * 86400000
  const d = new Date()
  const thisWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: thisWeek - (11 - i) * WEEK, z: [0, 0, 0, 0, 0] }))
  let any = false
  for (const w of workouts) {
    const s = summarizeHR(w.hr)
    if (!s) continue
    const wk = weeks.find((x) => w.start >= x.start && w.start < x.start + WEEK)
    if (!wk) continue
    any = true
    s.zoneSeconds.forEach((sec, i) => (wk.z[i] += sec / 60))
  }
  if (!any) return null
  const max = Math.max(30, ...weeks.map((w) => w.z.reduce((a, b) => a + b, 0)))
  const focus = settings.value.targetZone || 2
  const now = weeks[11].z
  return (
    <section class="card hr-card">
      <div class="zt-head">
        <div>
          <h2 class="section-title" style={{ margin: 0 }}>
            Heart rate zones
          </h2>
          <span>Minutes per week</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <b>{Math.round(now[focus - 1])}</b>
          <span> min Z{focus} this week</span>
        </div>
      </div>
      <div class="zt-bars" role="img" aria-label="Minutes in each heart rate zone per week">
        {weeks.map((w, i) => {
          const total = w.z.reduce((a, b) => a + b, 0)
          return (
            <div class={'zt-bar' + (total ? '' : ' empty')} key={w.start}>
              {w.z.map((m, zi) => (m > 0 ? <span style={{ height: `${(m / max) * 100}%`, background: ZONE_COLORS[zi] }} /> : null))}
              {(i === 0 || i === 6 || i === 11) && <small>{i === 11 ? 'Now' : `${11 - i}w`}</small>}
            </div>
          )
        })}
      </div>
      <div class="zt-legend">
        {ZONE_NAMES.map((n, i) => (
          <span>
            <i style={{ background: ZONE_COLORS[i] }} /> Z{i + 1} {n}
          </span>
        ))}
      </div>
    </section>
  )
}
