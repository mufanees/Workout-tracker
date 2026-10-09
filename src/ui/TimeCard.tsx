import { exMap, workouts } from '../store'
import { overrun } from '../timeplan'
import { exerciseTimes, fmtSecs, workoutTiming } from '../timing'
import type { Workout } from '../types'
import { phaseMinutes } from '../util'

type Part = 'warmup' | 'work' | 'rest' | 'transition' | 'cooldown'
/** Bar order: the neutral "other" sits between rest and cool-down so neighbours stay easy to tell apart. */
const PARTS: [Part, string][] = [
  ['warmup', 'Warm-up'],
  ['work', 'Working sets'],
  ['rest', 'Rest'],
  ['transition', 'Other'],
  ['cooldown', 'Cool-down'],
]

/** Where the time went (measured from your ticks), and planned vs actual when the workout had a plan. */
export function TimeCard({ w }: { w: Workout }) {
  const o = overrun(w)
  const t = w.timing || workoutTiming(w)
  if (!o && !t) return null
  const tp = w.timePlan
  return (
    <section class="card time-card" aria-label="Time">
      <div class="tc-head">
        <span class="eyebrow">{o ? 'Time vs plan' : 'Time'}</span>
        {o ? (
          <b class={'tc-diff ' + tone(o.diff)}>{tone(o.diff) === 'on' ? 'On time' : o.diff > 0 ? `${o.diff} min over` : `${-o.diff} min under`}</b>
        ) : (
          t && <b class="tc-diff on">{fmtSecs(t.total)}</b>
        )}
      </div>
      {o && <PlanBars planned={o.planned} actual={o.actual} diff={o.diff} />}
      {t ? <TimeSplit t={t} /> : tp && o && <PlanParts w={w} />}
      {t && <ExerciseTimes w={w} />}
      {tp?.paced && <p class="tc-note">Plan from your pace: your measured set times and rests.</p>}
    </section>
  )
}

const tone = (diff: number) => (diff > 2 ? 'over' : diff < -2 ? 'under' : 'on')

function PlanBars({ planned, actual, diff }: { planned: number; actual: number; diff: number }) {
  const max = Math.max(planned, actual)
  return (
    <div class="tc-bars">
      <div class="tc-bar">
        <span>Planned</span>
        <i style={{ width: `${(planned / max) * 100}%` }} />
        <b>{planned} min</b>
      </div>
      <div class={'tc-bar actual ' + tone(diff)}>
        <span>Took</span>
        <i style={{ width: `${(actual / max) * 100}%` }} />
        <b>{actual} min</b>
      </div>
    </div>
  )
}

/** Older workouts (no ticks timed): warm-up and cool-down minutes from the checklist ticks. */
function PlanParts({ w }: { w: Workout }) {
  const ph = phaseMinutes(w)
  const tp = w.timePlan!
  const rows: [string, number, number | null][] = [
    ['Warm-up', tp.warmup, ph.warmup],
    ['Cool-down', tp.cooldown, ph.cooldown],
  ]
  const shown = rows.filter(([, p, a]) => a != null && p > 0)
  if (!shown.length) return null
  return <p class="tc-parts">{shown.map(([label, p, a]) => `${label} ${a} min (plan ${p})`).join(' · ')}</p>
}

/** One stacked bar plus a row per part: the rows carry the labels and numbers, the bar the proportions. */
function TimeSplit({ t }: { t: NonNullable<Workout['timing']> }) {
  const total = Math.max(1, t.total)
  const parts = PARTS.filter(([k]) => t[k] > 0)
  return (
    <div class="tc-split">
      <div class="tc-stack" role="img" aria-label={parts.map(([k, l]) => `${l} ${fmtSecs(t[k])}`).join(', ')}>
        {parts.map(([k, l]) => (
          <i class={'seg-' + k} style={{ flexGrow: t[k] }} title={`${l}: ${fmtSecs(t[k])} (${Math.round((t[k] / total) * 100)}%)`} />
        ))}
      </div>
      <ul class="tc-legend">
        {parts.map(([k, l]) => (
          <li>
            <i class={'seg-' + k} aria-hidden="true" />
            <span>{l}</span>
            <b>{fmtSecs(t[k])}</b>
            <small>{Math.round((t[k] / total) * 100)}%</small>
          </li>
        ))}
        <li class="tc-total">
          <i aria-hidden="true" />
          <span>Total</span>
          <b>{fmtSecs(t.total)}</b>
          <small />
        </li>
      </ul>
    </div>
  )
}

/** Per exercise: time spent (its sets plus the rests after them), sets and seconds per set. */
function ExerciseTimes({ w }: { w: Workout }) {
  const list = exerciseTimes(w)
  if (!list.length) return null
  return (
    <div class="tc-ex">
      <span class="tc-sub">By exercise</span>
      <ul>
        {list.map((e) => {
          const name = exMap.value.get(e.exerciseId)?.name || 'Exercise'
          const rest = e.rests.length ? ` · rest ${fmtSecs(Math.round(e.rest / e.rests.length))}` : ''
          return (
            <li>
              <span class="tc-ex-name">
                {name}
                <small>
                  {e.sets} {e.sets === 1 ? 'set' : 'sets'}
                  {e.avg != null ? ` · ${fmtSecs(e.avg)} a set` : ''}
                  {rest}
                </small>
              </span>
              <b>{fmtSecs(e.total)}</b>
            </li>
          )
        })}
      </ul>
    </div>
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
