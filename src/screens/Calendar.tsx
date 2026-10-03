// Month calendar of everything (workouts, fasts, weigh-ins, notes, morning checks) and the page for one day.
import { useEffect, useState } from 'preact/hooks'
import { computed } from '@preact/signals'
import { bodyWeights, dayNotes, fasts, readings, saveBodyWeight, saveDayNote, settings, unit, workouts, remove } from '../store'
import { back, navigate } from '../router'
import { DAY, HOUR, dayKey, fastsByDay, hShort, hm, parseDayKey } from '../fasting'
import { FastEditor, FastRow, draftPastFast, useNow } from '../ui/Fasting'
import { activityOf } from '../activity'
import { Icon } from '../ui/icons'
import { AutoText, toast } from '../ui/overlay'
import type { BodyWeight, Fast, Workout } from '../types'
import { LB, doneSets, fmtDuration, fmtNum, fmtTime, fmtVolume, startOfDay, startOfWeek, uid, workoutVolume } from '../util'
import { TargetSheet, WeightGoalBar } from './Body'

const WEEK = 7 * DAY

/** Everything indexed by local day start. */
const index = computed(() => {
  const w = new Map<number, Workout[]>()
  for (const x of workouts.value) {
    const d = startOfDay(new Date(x.start))
    w.set(d, [...(w.get(d) || []), x])
  }
  const b = new Map<number, BodyWeight>()
  for (const x of bodyWeights.value) {
    const d = startOfDay(new Date(x.date))
    if (!b.has(d)) b.set(d, x) // newest first, so the day's last weigh-in wins
  }
  const r = new Map<number, (typeof readings.value)[number]>()
  for (const x of readings.value) {
    const d = startOfDay(new Date(x.date))
    if (!r.has(d)) r.set(d, x)
  }
  return { w, b, r }
})

const addDays = (d: number, n: number) => startOfDay(new Date(d + n * DAY + DAY / 2))
const monthStart = (t: number) => new Date(new Date(t).getFullYear(), new Date(t).getMonth(), 1).getTime()
const monthLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const shortName = (s: string) => s.replace(/^Phase \d+\s*·\s*/i, '')

// ---- calendar ------------------------------------------------------------------

export function CalendarView() {
  const now = useNow(60000)
  const today = startOfDay(new Date(now))
  const { w, b } = index.value
  const fd = fastsByDay(fasts.value, now)
  const notes = dayNotes.value
  const [count, setCount] = useState(3)

  // earliest month with any data
  const firsts = [workouts.value.at(-1)?.start, bodyWeights.value.at(-1)?.date, fasts.value.at(-1)?.start, readings.value.at(-1)?.date].filter((x): x is number => x != null)
  const earliest = monthStart(Math.min(now, ...firsts))
  const months: number[] = []
  for (let m = monthStart(now); m >= earliest && months.length < count; m = monthStart(m - DAY)) months.push(m)
  const more = monthStart(months[months.length - 1] - DAY) >= earliest

  // header stats: week streak and rest days since the first workout
  const weeks = new Set(workouts.value.map((x) => startOfWeek(x.start)))
  let streak = 0
  let cur = weeks.has(startOfWeek(now)) ? startOfWeek(now) : startOfWeek(now) - WEEK
  while (weeks.has(cur)) {
    streak++
    cur = startOfWeek(cur - WEEK / 2)
  }
  const first = workouts.value.at(-1)
  const rest = first ? Math.round((today - startOfDay(new Date(first.start))) / DAY) + 1 - w.size : 0

  return (
    <div class="cal">
      <div class="cal-stats">
        <span>
          <Icon name="flame" size={16} class="flame" /> <b>{streak}</b> week streak
        </span>
        <span>
          <Icon name="fast" size={16} /> <b>{[...fd.values()].filter((x) => x.hit).length}</b> fast goals
        </span>
        <span>
          <b>{rest}</b> rest days
        </span>
      </div>
      <div class="cal-legend" aria-hidden="true">
        <span>
          <i class="lg-workout" /> Workout
        </span>
        <span>
          <i class="lg-fast" /> Fast
        </span>
        <span>
          <i class="lg-weight" /> Weigh-in
        </span>
        <span>
          <i class="lg-note" /> Note
        </span>
      </div>
      <div class="cal-dow" aria-hidden="true">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span>{d}</span>
        ))}
      </div>
      {months.map((m) => {
        const first = new Date(m)
        const pad = (first.getDay() + 6) % 7
        const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
        const days = Array.from({ length: daysIn }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1).getTime())
        const mw = days.reduce((a, d) => a + (w.get(d)?.length || 0), 0)
        const mf = days.map((d) => fd.get(d)).filter(Boolean)
        const avg = mf.length ? mf.reduce((a, x) => a + x!.ms, 0) / mf.length : 0
        return (
          <section class="cal-month" aria-label={monthLabel(m)}>
            <div class="cal-mhead">
              <h2>{monthLabel(m)}</h2>
              <span>
                {mw} workout{mw === 1 ? '' : 's'}
                {mf.length ? ` · ${mf.length} fasts, avg ${hShort(avg)}` : ''}
              </span>
            </div>
            <div class="cal-grid">
              {Array.from({ length: pad }, () => (
                <span />
              ))}
              {days.map((d) => {
                const ws = w.get(d)
                const f = fd.get(d)
                const future = d > today
                const label = [
                  new Date(d).toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  }),
                  ws ? ws.map((x) => x.name).join(', ') : '',
                  f ? `fasted ${hm(f.ms)}` : '',
                  b.has(d) ? 'weigh-in' : '',
                  notes.get(dayKey(d))?.text.trim() ? 'note' : '',
                ]
                  .filter(Boolean)
                  .join(', ')
                return (
                  <button class={'cal-day' + (d === today ? ' today' : '') + (future ? ' future' : '')} disabled={future} onClick={() => navigate(`/day/${dayKey(d)}`)} aria-label={label}>
                    <span class={'cal-num' + (ws ? ' trained' : '')}>{new Date(d).getDate()}</span>
                    <span class="cal-name">{ws ? shortName(ws[0].name) + (ws.length > 1 ? ` +${ws.length - 1}` : '') : ''}</span>
                    {f ? <span class={'cal-fast' + (f.hit ? ' hit' : '') + (f.live ? ' live' : '')}>{hShort(f.ms)}</span> : <span class="cal-fast none" />}
                    <span class="cal-dots">
                      {b.has(d) && <i class="lg-weight" />}
                      {!!notes.get(dayKey(d))?.text.trim() && <i class="lg-note" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      {more && (
        <button class="btn btn-secondary btn-block" onClick={() => setCount(count + 6)}>
          Show earlier months
        </button>
      )}
    </div>
  )
}

// ---- one day -------------------------------------------------------------------

export function DayView({ id }: { id: string }) {
  const day = parseDayKey(id)
  const now = useNow(1000)
  const today = startOfDay(new Date(now))
  const { w, b, r } = index.value
  const fd = fastsByDay(fasts.value, now)
  const ws = w.get(day) || []
  const f = fd.get(day)
  const weight = b.get(day)
  const reading = r.get(day)
  const u = unit.value
  const [editing, setEditing] = useState<{
    fast: Fast
    isNew?: boolean
  } | null>(null)
  const [target, setTarget] = useState(false)
  const [note, setNote] = useState(dayNotes.value.get(id)?.text || '')
  const [wv, setWv] = useState('')
  useEffect(() => setNote(dayNotes.value.get(id)?.text || ''), [id])
  useEffect(() => setWv(weight ? String(Math.round((u === 'lb' ? weight.kg * LB : weight.kg) * 10) / 10) : ''), [id, weight?.id, u])
  // save the note shortly after typing stops, and when leaving
  useEffect(() => {
    if (note === (dayNotes.value.get(id)?.text || '')) return
    const t = setTimeout(() => void saveDayNote(id, note), 600)
    return () => clearTimeout(t)
  }, [note])
  useEffect(() => () => void saveDayNote(id, noteRef.v), [id])
  const noteRef = useRefValue(note)

  const go = (n: number) => navigate(`/day/${dayKey(addDays(day, n))}`, { replace: true })
  const weekStart = startOfWeek(day)
  const strip = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const goal = settings.value.fastGoal
  const title =
    day === today
      ? 'Today'
      : day === addDays(today, -1)
        ? 'Yesterday'
        : new Date(day).toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })

  const logWeight = async () => {
    const n = Number(wv.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || n > 700) return toast('Enter your weight')
    const kg = u === 'lb' ? n / LB : n
    const at = day === today ? now : day + 8 * HOUR
    await saveBodyWeight(weight ? { ...weight, kg } : { id: uid('b'), date: at, kg, updatedAt: 0 })
    toast(weight ? 'Weight updated' : 'Weight logged')
  }

  return (
    <div class="screen day-screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => back('/history?view=calendar')} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="page-title">{title}</span>
        <span class="icon-btn" aria-hidden="true" />
      </header>

      <div class="day-strip">
        <button class="icon-btn sm" onClick={() => go(-7)} aria-label="Previous week">
          <Icon name="left" size={18} />
        </button>
        {strip.map((d) => {
          const sf = fd.get(d)
          return (
            <button
              class={'ds-day' + (d === day ? ' on' : '') + (d === today ? ' today' : '')}
              disabled={d > today}
              onClick={() => navigate(`/day/${dayKey(d)}`, { replace: true })}
              aria-label={new Date(d).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
              })}
              aria-current={d === day ? 'date' : undefined}
            >
              <small>
                {new Date(d).toLocaleDateString(undefined, {
                  weekday: 'narrow',
                })}
              </small>
              <span class={'ds-num' + (w.has(d) ? ' trained' : '')}>{new Date(d).getDate()}</span>
              <span class={'ds-fast' + (sf?.hit ? ' hit' : '')}>{sf ? hShort(sf.ms) : ''}</span>
            </button>
          )
        })}
        <button class="icon-btn sm" onClick={() => go(7)} disabled={addDays(weekStart, 7) > today} aria-label="Next week">
          <Icon name="right" size={18} />
        </button>
      </div>

      <section class="card day-card">
        <div class="dc-head">
          <span class="eyebrow">
            <Icon name="dumbbell" size={14} /> Training
          </span>
        </div>
        {ws.length ? (
          ws.map((x) => (
            <button class="day-workout" onClick={() => navigate('/history/' + x.id)}>
              <span class={'wc-icon ' + activityOf(x).kind} aria-hidden="true">
                <Icon name={activityOf(x).icon} size={20} />
              </span>
              <span class="dw-text">
                <b>{x.name}</b>
                <small>
                  {fmtTime(x.start)}
                  {x.end ? ` · ${fmtDuration(x.end - x.start)}` : ''}
                  {doneSets(x) ? ` · ${doneSets(x)} set${doneSets(x) === 1 ? '' : 's'} · ${fmtVolume(workoutVolume(x), u)}` : ''}
                  {x.shoulder != null ? ` · shoulder ${x.shoulder}/10` : ''}
                </small>
              </span>
              <Icon name="right" size={16} />
            </button>
          ))
        ) : (
          <p class="muted small">{day === today ? 'Nothing logged yet today.' : 'Rest day.'}</p>
        )}
      </section>

      <section class="card day-card">
        <div class="dc-head">
          <span class="eyebrow">
            <Icon name="fast" size={14} /> Fasts
          </span>
          <button
            class="icon-btn sm"
            aria-label="Add a fast for this day"
            onClick={() =>
              setEditing({
                fast: draftPastFast(day === today ? now : day + 12 * HOUR),
                isNew: true,
              })
            }
          >
            <Icon name="plus" size={18} />
          </button>
        </div>
        {f ? (
          <>
            <div class="dc-total">
              <span>
                Day total <b>{hm(f.ms)}</b>
              </span>
              <div class="fc-bar">
                <span
                  style={{
                    width: `${Math.min(100, (f.ms / (Math.max(...f.list.map((x) => x.goal), goal) * HOUR)) * 100)}%`,
                  }}
                />
              </div>
            </div>
            {f.list.map((x) => (
              <FastRow f={x} now={now} onEdit={() => setEditing({ fast: x })} />
            ))}
          </>
        ) : (
          <p class="muted small">No fast ended this day.</p>
        )}
      </section>

      <section class="card day-card">
        <div class="dc-head">
          <span class="eyebrow">
            <Icon name="scale" size={14} /> Weight
          </span>
          {weight && (
            <button
              class="icon-btn sm"
              aria-label="Delete weigh-in"
              onClick={async () => {
                await remove('body', weight.id)
                toast('Weigh-in deleted', {
                  label: 'Undo',
                  run: () => void saveBodyWeight(weight),
                })
              }}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
        <div class="weight-log">
          <input
            id="day-weight"
            class="weight-input"
            type="text"
            inputMode="decimal"
            value={wv}
            placeholder={u === 'kg' ? '80.0' : '176.0'}
            aria-label={`Weight in ${u}`}
            onInput={(e) => setWv(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && logWeight()}
          />
          <span class="muted">{u}</span>
          <button class="btn btn-primary" onClick={logWeight}>
            {weight ? 'Update' : 'Log'}
          </button>
        </div>
        {weight && <DeltaLine w={weight} />}
        <WeightGoalBar onEdit={() => setTarget(true)} />
        <TargetSheet open={target} onClose={() => setTarget(false)} />
      </section>

      {reading && (
        <section class="card day-card">
          <div class="dc-head">
            <span class="eyebrow">
              <Icon name="heart" size={14} /> Morning check
            </span>
          </div>
          <p class="dc-big">
            <b>{reading.rhr}</b> bpm resting
            {reading.hrv != null ? (
              <>
                {' '}
                · <b>{Math.round(reading.hrv)}</b> ms HRV
              </>
            ) : null}
          </p>
        </section>
      )}

      <section class="card day-card">
        <div class="dc-head">
          <span class="eyebrow">
            <Icon name="sticky" size={14} /> Note
          </span>
        </div>
        <AutoText value={note} onInput={setNote} placeholder="Sleep, energy, what you ate, how the shoulder felt…" class="input-like" label="Note for this day" />
      </section>

      <FastEditor fast={editing?.fast || null} isNew={editing?.isNew} onClose={() => setEditing(null)} />
    </div>
  )
}

function DeltaLine({ w }: { w: BodyWeight }) {
  const u = unit.value
  const prev = bodyWeights.value.find((x) => x.date < startOfDay(new Date(w.date)))
  if (!prev) return null
  const d = (w.kg - prev.kg) * (u === 'lb' ? LB : 1)
  const r = Math.round(d * 10) / 10
  return (
    <p class={'dc-delta' + (r > 0 ? ' up' : r < 0 ? ' down' : '')}>
      {r > 0 ? '+' : r < 0 ? '−' : '±'}
      {fmtNum(Math.abs(r), 1)} {u} since{' '}
      {new Date(prev.date).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })}
    </p>
  )
}

/** Latest value in a mutable box, for unmount handlers. */
function useRefValue<T>(v: T) {
  const [box] = useState(() => ({ v }))
  box.v = v
  return box
}
