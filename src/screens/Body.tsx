import { useEffect, useState } from 'preact/hooks'
import { activeFast, bodyWeights, fasts, remove, saveBodyWeight, settings, saveSettings, unit } from '../store'
import type { BodyWeight } from '../types'
import { navigate } from '../router'
import { HOUR, endFast, fastStats, hm, protocolLabel, stageAt, startFast } from '../fasting'
import { useNow, whenLabel } from '../ui/Fasting'
import { fmtDay, fmtNum, fmtTime, LB, startOfDay, uid } from '../util'
import { LineChart } from '../ui/Chart'
import { MorningCheck, ShoulderCard, Zone2Week } from './BodyCards'
import { Icon } from '../ui/icons'
import { actionSheet, Sheet, toast } from '../ui/overlay'

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

/** Compact fasting card; the full screen is /fast. */
function FastingCard() {
  const f = activeFast.value
  const now = useNow(1000)
  const goal = f ? f.goal : settings.value.fastGoal
  const last = fasts.value.find((x) => x.end != null)
  const stats = fastStats(fasts.value, now)
  const elapsed = f ? now - f.start : 0
  const pct = Math.min(100, (elapsed / (goal * HOUR)) * 100)
  const stage = stageAt(elapsed / HOUR)
  const stop = (e: Event) => e.stopPropagation()

  const end = async (e: Event) => {
    stop(e)
    if (!f) return
    const saved = await endFast(f)
    navigate(`/fast/done/${saved.id}`)
  }
  const start = (e: Event) => {
    stop(e)
    void startFast(Date.now(), goal)
  }

  return (
    <section class={'fast-card' + (f ? ' on' : '')} onClick={() => navigate('/fast')} role="link" aria-label="Open fasting">
      <div class="fast-head">
        <span class="eyebrow">
          <Icon name="fast" size={14} /> {f ? `Fasting · ${protocolLabel(goal)}` : 'Not fasting'}
        </span>
        <span class="fast-streak">
          {stats.streak > 0 && (
            <>
              <Icon name="flame" size={14} /> {stats.streak} day{stats.streak > 1 ? 's' : ''}
            </>
          )}
          <Icon name="right" size={16} />
        </span>
      </div>
      {f ? (
        <>
          <div class="fc-now">
            <b>{hm(elapsed)}</b>
            <span>
              <Icon name={stage.icon} size={14} /> {stage.name}
            </span>
          </div>
          <div class="fc-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <div class="fast-meta">
            <span>
              Started <b>{whenLabel(f.start)}</b>
            </span>
            <span>{elapsed >= goal * HOUR ? <b>Goal reached</b> : <>{hm(goal * HOUR - elapsed)} to go</>}</span>
          </div>
          <button class="btn btn-ink btn-block" onClick={end}>
            End fast
          </button>
        </>
      ) : (
        <>
          <p class="fast-idle">{last ? `Eating window open for ${hm(now - last.end!)}` : 'Start a fast when you finish eating.'}</p>
          <button class="btn btn-ink btn-block btn-lg" onClick={start}>
            Start {protocolLabel(goal)} fast
          </button>
        </>
      )}
    </section>
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
  const [targetOpen, setTargetOpen] = useState(false)
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
      <WeightGoalBar onEdit={() => setTargetOpen(true)} />
      <TargetSheet open={targetOpen} onClose={() => setTargetOpen(false)} />
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

/** Start → target progress, Easy Fast style. Start is the first weigh-in. */
export function WeightGoalBar({ onEdit }: { onEdit: () => void }) {
  const u = unit.value
  const list = bodyWeights.value
  const goal = settings.value.weightGoal
  if (!list.length) return null
  if (goal == null)
    return (
      <button class="btn-text small target-set" onClick={onEdit}>
        <Icon name="target" size={14} /> Set a target weight
      </button>
    )
  const start = list[list.length - 1].kg
  const now = list[0].kg
  const span = start - goal
  const pct = span === 0 ? 100 : Math.max(0, Math.min(100, ((start - now) / span) * 100))
  const left = Math.abs(now - goal)
  return (
    <button class="wgoal" onClick={onEdit} aria-label="Change target weight">
      <span class="wgoal-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span class="wgoal-labels">
        <span>
          Start <b>{fmtW(start, u)}</b>
        </span>
        <span>{left < 0.05 ? <b>Target reached</b> : `${fmtW(left, u)} ${u} to go`}</span>
        <span>
          Target <b>{fmtW(goal, u)}</b>
        </span>
      </span>
    </button>
  )
}

export function TargetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const u = unit.value
  const cur = settings.value.weightGoal
  const [v, setV] = useState('')
  useEffect(() => {
    if (open) setV(cur != null ? String(Math.round(toUnit(cur, u) * 10) / 10) : '')
  }, [open])
  const save = async () => {
    const n = Number(v.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || n > 700) return toast('Enter a target weight')
    await saveSettings({ weightGoal: u === 'lb' ? n / LB : n })
    onClose()
  }
  const clear = async () => {
    await saveSettings({ weightGoal: null })
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Target weight"
      footer={
        <div class="row gap">
          {cur != null && (
            <button class="btn btn-secondary grow" onClick={clear}>
              Remove
            </button>
          )}
          <button class="btn btn-primary grow" onClick={save}>
            Save
          </button>
        </div>
      }
    >
      <label class="field">
        <span>Target ({u})</span>
        <input id="target-weight" type="text" inputMode="decimal" value={v} onInput={(e) => setV(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </label>
    </Sheet>
  )
}
