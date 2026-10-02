import { useEffect, useState } from 'preact/hooks'
import { activeFast, bodyWeights, fasts, remove, saveBodyWeight, saveFast, settings, saveSettings, unit } from '../store'
import type { BodyWeight, Fast } from '../types'
import { fmtDay, fmtNum, fmtTime, LB, startOfDay, uid } from '../util'
import { LineChart } from '../ui/Chart'
import { MorningCheck, ShoulderCard, Zone2Week } from './BodyCards'
import { Icon } from '../ui/icons'
import { actionSheet, confirmDialog, Sheet, toast } from '../ui/overlay'
import { cancelPush, schedulePush } from '../push'

const HOUR = 3600000

function pushFast(f: Fast) {
  schedulePush('fast', f.start + f.goal * HOUR, 'Fast complete', `You reached ${f.goal} hours. End it in Reps whenever you eat.`)
}
const GOALS = [12, 14, 16, 18, 20, 24]

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const hm = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** "2026-10-02T07:30" for datetime-local inputs, in local time. */
const toLocalInput = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16)

export function Body() {
  return (
    <div class="screen">
      <header class="page-head">
        <h1>Body</h1>
      </header>
      <MorningCheck />
      <Zone2Week />
      <FastingCard />
      <WeightCard />
      <ShoulderCard />
    </div>
  )
}

// ---- Fasting -----------------------------------------------------------------

function FastingCard() {
  const f = activeFast.value
  const now = useNow(1000)
  const [editing, setEditing] = useState<Fast | null>(null)
  const goal = settings.value.fastGoal
  const done = fasts.value.filter((x) => x.end != null)
  const last = done[0]

  const start = async () => {
    const f = await saveFast({ id: uid('f'), start: Date.now(), end: null, goal, updatedAt: 0 })
    pushFast(f)
  }
  const end = async () => {
    if (!f) return
    const hours = (Date.now() - f.start) / HOUR
    await saveFast({ ...f, end: Date.now() })
    cancelPush('fast')
    toast(hours >= f.goal ? `${hm(Date.now() - f.start)} fast. Goal reached.` : `Fast ended at ${hm(Date.now() - f.start)}`)
  }

  // Streak: consecutive days (ending today or yesterday) with a fast that hit its goal.
  const hitDays = new Set(done.filter((x) => (x.end! - x.start) / HOUR >= x.goal).map((x) => startOfDay(new Date(x.end!))))
  let streak = 0
  let day = startOfDay(new Date())
  if (!hitDays.has(day)) day -= 86400000
  while (hitDays.has(day)) {
    streak++
    day -= 86400000
  }
  const recent = done.slice(0, 7)
  const avg = recent.length ? recent.reduce((a, x) => a + (x.end! - x.start), 0) / recent.length : 0

  return (
    <section class={'fast-card' + (f ? ' on' : '')}>
      <div class="fast-head">
        <span class="eyebrow">
          <Icon name="fast" size={14} /> {f ? 'Fasting' : 'Not fasting'}
        </span>
        {streak > 0 && (
          <span class="fast-streak">
            <Icon name="flame" size={14} /> {streak} day{streak > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {f ? (
        <>
          <FastRing elapsed={now - f.start} goal={f.goal} />
          <div class="fast-meta">
            <span>
              Started <b>{fmtTime(f.start)}</b>
              {startOfDay(new Date(f.start)) !== startOfDay(new Date()) ? ` ${fmtDay(f.start).toLowerCase()}` : ''}
            </span>
            <span>
              Goal <b>{f.goal} h</b> · {now - f.start >= f.goal * HOUR ? 'reached' : `at ${fmtTime(f.start + f.goal * HOUR)}`}
            </span>
          </div>
          <div class="row gap">
            <button class="btn btn-secondary grow" onClick={() => setEditing(f)}>
              Edit
            </button>
            <button class="btn btn-ink grow" onClick={end}>
              End fast
            </button>
          </div>
        </>
      ) : (
        <>
          <p class="fast-idle">{last ? `Eating window open for ${hm(now - last.end!)}` : 'Start a fast when you finish eating.'}</p>
          <div class="goal-chips" role="radiogroup" aria-label="Fasting goal">
            {GOALS.map((g) => (
              <button role="radio" aria-checked={g === goal} class={'chip' + (g === goal ? ' on' : '')} onClick={() => saveSettings({ fastGoal: g })}>
                {g}:{24 - g || '0'}
              </button>
            ))}
          </div>
          <button class="btn btn-ink btn-block btn-lg" onClick={start}>
            Start {goal} h fast
          </button>
        </>
      )}

      {recent.length > 0 && (
        <div class="fast-history">
          <div class="fast-stats">
            <span>
              Last {recent.length} avg <b>{hm(avg)}</b>
            </span>
          </div>
          <div class="fast-bars" role="img" aria-label="Recent fasts">
            {[...recent].reverse().map((x) => {
              const h = (x.end! - x.start) / HOUR
              return (
                <button class="fast-bar" onClick={() => setEditing(x)} aria-label={`${fmtDay(x.start)}: ${hm(x.end! - x.start)}`}>
                  <span class={h >= x.goal ? 'hit' : ''} style={{ height: `${Math.min(100, (h / 24) * 100)}%` }} />
                  <small>{new Date(x.end!).toLocaleDateString(undefined, { weekday: 'narrow' })}</small>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <FastEditor fast={editing} onClose={() => setEditing(null)} />
    </section>
  )
}

function FastRing({ elapsed, goal }: { elapsed: number; goal: number }) {
  const pct = Math.min(1, elapsed / (goal * HOUR))
  const r = 70
  const c = 2 * Math.PI * r
  const left = goal * HOUR - elapsed
  return (
    <div class="fast-ring">
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r={r} class="ring-bg" />
        <circle cx="80" cy="80" r={r} class="ring-fg" stroke-dasharray={c} stroke-dashoffset={c * (1 - pct)} transform="rotate(-90 80 80)" />
      </svg>
      <div class="ring-text">
        <b>{hm(elapsed)}</b>
        <span>{left > 0 ? `${hm(left)} to go` : `${hm(-left)} over goal`}</span>
      </div>
    </div>
  )
}

function FastEditor({ fast, onClose }: { fast: Fast | null; onClose: () => void }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  useEffect(() => {
    if (fast) {
      setStart(toLocalInput(fast.start))
      setEnd(fast.end ? toLocalInput(fast.end) : '')
    }
  }, [fast])
  if (!fast) return <Sheet open={false} onClose={onClose}>{null}</Sheet>
  const save = async () => {
    const s = new Date(start).getTime()
    const e = end ? new Date(end).getTime() : null
    if (!Number.isFinite(s) || (e != null && (!Number.isFinite(e) || e <= s))) return toast('The end has to be after the start')
    if (s > Date.now()) return toast('The start can’t be in the future')
    const saved = await saveFast({ ...fast, start: s, end: fast.end == null ? null : e })
    if (saved.end == null) pushFast(saved)
    onClose()
  }
  return (
    <Sheet
      open={!!fast}
      onClose={onClose}
      title={fast.end == null ? 'Edit current fast' : 'Edit fast'}
      footer={
        <button class="btn btn-primary btn-block" onClick={save}>
          Save
        </button>
      }
    >
      <label class="field">
        <span>Started</span>
        <input id="fast-start" type="datetime-local" value={start} onInput={(e) => setStart(e.currentTarget.value)} />
      </label>
      {fast.end != null && (
        <label class="field">
          <span>Ended</span>
          <input id="fast-end" type="datetime-local" value={end} onInput={(e) => setEnd(e.currentTarget.value)} />
        </label>
      )}
      <button
        class="btn btn-ghost-danger btn-block"
        onClick={async () => {
          if (!(await confirmDialog({ title: 'Delete this fast?', confirm: 'Delete', danger: true }))) return
          await remove('fasts', fast.id)
          if (fast.end == null) cancelPush('fast')
          onClose()
          toast('Fast deleted', { label: 'Undo', run: () => void saveFast(fast) })
        }}
      >
        Delete fast
      </button>
    </Sheet>
  )
}

// ---- Weight ------------------------------------------------------------------

const toUnit = (kg: number, u: 'kg' | 'lb') => (u === 'lb' ? kg * LB : kg)
const fmtW = (kg: number, u: 'kg' | 'lb') => fmtNum(Math.round(toUnit(kg, u) * 10) / 10, 1)

function WeightCard() {
  const u = unit.value
  const list = bodyWeights.value
  const latest = list[0]
  const [value, setValue] = useState('')
  const [all, setAll] = useState(false)
  useEffect(() => {
    if (latest) setValue(String(Math.round(toUnit(latest.kg, u) * 10) / 10))
  }, [latest?.id, u])

  const today = startOfDay(new Date())
  const todays = list.find((b) => startOfDay(new Date(b.date)) === today)

  const log = async () => {
    const n = Number(value.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || n > 700) return toast('Enter your weight')
    const kg = u === 'lb' ? n / LB : n
    await saveBodyWeight(todays ? { ...todays, kg, date: Date.now() } : { id: uid('b'), date: Date.now(), kg, updatedAt: 0 })
    toast(todays ? 'Today’s weight updated' : 'Weight logged')
  }
  const step = (d: number) => {
    const n = Number(value.replace(',', '.')) || (latest ? toUnit(latest.kg, u) : 0)
    setValue(String(Math.round((n + d) * 10) / 10))
  }

  // Trend: 7-day average now vs 7-day average a week and a month earlier.
  const avgAround = (t: number) => {
    const xs = list.filter((b) => b.date <= t && b.date > t - 7 * 86400000)
    return xs.length ? xs.reduce((a, b) => a + b.kg, 0) / xs.length : null
  }
  const now = Date.now()
  const avg7 = avgAround(now)
  const wk = avgAround(now - 7 * 86400000)
  const mo = avgAround(now - 30 * 86400000)
  const delta = (a: number | null, b: number | null) => (a != null && b != null ? toUnit(a - b, u) : null)
  const dW = delta(avg7, wk)
  const dM = delta(avg7, mo)
  const sign = (d: number) => (d > 0 ? '+' : d < 0 ? '−' : '±') + fmtNum(Math.abs(Math.round(d * 10) / 10), 1)

  const points = [...list]
    .filter((b) => b.date > now - 120 * 86400000)
    .reverse()
    .map((b) => ({ t: b.date, v: Math.round(toUnit(b.kg, u) * 10) / 10 }))

  const entryMenu = (b: BodyWeight) =>
    actionSheet({
      title: `${fmtW(b.kg, u)} ${u}`,
      message: `${fmtDay(b.date)} at ${fmtTime(b.date)}`,
      actions: [
        {
          label: 'Delete entry',
          icon: 'trash',
          danger: true,
          onSelect: async () => {
            await remove('body', b.id)
            toast('Entry deleted', { label: 'Undo', run: () => void saveBodyWeight(b) })
          },
        },
      ],
    })

  return (
    <section class="card weight-card">
      <div class="fast-head">
        <span class="eyebrow">
          <Icon name="scale" size={14} /> Body weight
        </span>
        {latest && <span class="muted small">{fmtDay(latest.date)}</span>}
      </div>
      {latest ? (
        <div class="weight-now">
          <b>{fmtW(latest.kg, u)}</b>
          <span>{u}</span>
        </div>
      ) : (
        <p class="fast-idle">Weigh in at the same time each day, ideally in the morning. The trend matters more than any single day.</p>
      )}
      {(dW != null || dM != null) && (
        <div class="weight-trend">
          {avg7 != null && (
            <span>
              7-day avg <b>{fmtW(avg7, u)}</b>
            </span>
          )}
          {dW != null && (
            <span>
              Week <b>{sign(dW)}</b>
            </span>
          )}
          {dM != null && (
            <span>
              Month <b>{sign(dM)}</b>
            </span>
          )}
        </div>
      )}
      <div class="weight-log">
        <button class="icon-btn step" onClick={() => step(-0.1)} aria-label="Down 0.1">
          <Icon name="minus" />
        </button>
        <input
          id="weight-input"
          class="weight-input"
          type="text"
          inputMode="decimal"
          value={value}
          placeholder={u === 'kg' ? '80.0' : '176.0'}
          aria-label={`Weight in ${u}`}
          onInput={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && log()}
        />
        <button class="icon-btn step" onClick={() => step(0.1)} aria-label="Up 0.1">
          <Icon name="plus" />
        </button>
        <button class="btn btn-primary" onClick={log}>
          {todays ? 'Update' : 'Log'}
        </button>
      </div>
      {points.length > 0 && <LineChart points={points} format={(v) => `${fmtNum(v, 1)} ${u}`} best={null} />}
      {list.length > 0 && (
        <ul class="weight-list">
          {(all ? list : list.slice(0, 5)).map((b, i) => {
            const prev = list[i + 1]
            const d = prev ? toUnit(b.kg - prev.kg, u) : null
            return (
              <li>
                <button onClick={() => entryMenu(b)}>
                  <span>{fmtDay(b.date)}</span>
                  <b>
                    {fmtW(b.kg, u)} {u}
                  </b>
                  <span class={'wl-delta' + (d && d > 0 ? ' up' : d && d < 0 ? ' down' : '')}>{d != null ? sign(d) : ''}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {list.length > 5 && (
        <button class="show-all" onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show all ${list.length}`}
        </button>
      )}
    </section>
  )
}
