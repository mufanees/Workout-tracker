import { workouts } from '../store'
import { overrun } from '../timeplan'
import type { Workout } from '../types'
import { phaseMinutes } from '../util'

/** Planned vs actual for one workout: total and each part. */
export function TimeCard({ w }: { w: Workout }) {
  const o = overrun(w)
  if (!o || !w.timePlan) return null
  const ph = phaseMinutes(w)
  const tp = w.timePlan
  const max = Math.max(o.planned, o.actual)
  const tone = o.diff > 2 ? 'over' : o.diff < -2 ? 'under' : 'on'
  const rows: [string, number, number | null][] = [
    ['Warm-up', tp.warmup, ph.warmup],
    ['Cool-down', tp.cooldown, ph.cooldown],
  ]
  return (
    <section class="card time-card">
      <div class="tc-head">
        <span class="eyebrow">Time vs plan</span>
        <b class={'tc-diff ' + tone}>{tone === 'on' ? 'On time' : o.diff > 0 ? `${o.diff} min over` : `${-o.diff} min under`}</b>
      </div>
      <div class="tc-bars">
        <div class="tc-bar">
          <span>Planned</span>
          <i style={{ width: `${(o.planned / max) * 100}%` }} />
          <b>{o.planned} min</b>
        </div>
        <div class={'tc-bar actual ' + tone}>
          <span>Took</span>
          <i style={{ width: `${(o.actual / max) * 100}%` }} />
          <b>{o.actual} min</b>
        </div>
      </div>
      {rows.some(([, , a]) => a != null) && (
        <p class="tc-parts">
          {rows
            .filter(([, p, a]) => a != null && p > 0)
            .map(([label, p, a]) => `${label} ${a} min (plan ${p})`)
            .join(' · ')}
        </p>
      )}
    </section>
  )
}

/** History: how your recent sessions compare with their plan. */
export function TimeTrend() {
  const list = workouts.value.map((w) => ({ w, o: overrun(w) })).filter((x) => x.o).slice(0, 8)
  if (list.length < 2) return null
  const avg = Math.round(list.reduce((a, x) => a + x.o!.diff, 0) / list.length)
  const max = Math.max(...list.map((x) => Math.max(x.o!.actual, x.o!.planned)))
  return (
    <section class="card time-trend">
      <div class="tc-head">
        <span class="eyebrow">Time vs plan · last {list.length}</span>
        <b class={'tc-diff ' + (avg > 2 ? 'over' : avg < -2 ? 'under' : 'on')}>{Math.abs(avg) <= 2 ? 'On time on average' : avg > 0 ? `${avg} min over on average` : `${-avg} min under on average`}</b>
      </div>
      <div class="tt-bars" role="img" aria-label={list.map((x) => `${x.o!.actual} of ${x.o!.planned} min`).join(', ')}>
        {[...list].reverse().map(({ o }) => (
          <div class="tt-col">
            <i class="tt-plan" style={{ height: `${(o!.planned / max) * 100}%` }} />
            <i class={'tt-actual ' + (o!.diff > 2 ? 'over' : 'on')} style={{ height: `${(o!.actual / max) * 100}%` }} />
          </div>
        ))}
      </div>
    </section>
  )
}
