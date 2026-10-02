import { useEffect, useRef, useState } from 'preact/hooks'
import { readings, remove, saveReading, saveSettings, settings, workouts } from '../store'
import { bpm, connectHR, hrStatus, hrSupported, rmssd, rrListeners, summarizeHR } from '../hr'
import { LineChart } from '../ui/Chart'
import { Icon } from '../ui/icons'
import { actionSheet, Sheet, toast } from '../ui/overlay'
import { fmtDay, startOfDay, startOfWeek, uid } from '../util'
import type { Reading } from '../types'

const DAY = 86400000
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// ---- Morning check: resting HR + HRV ---------------------------------------------------

const READ_SECONDS = 60

export function MorningCheck() {
  const list = readings.value
  const latest = list[0]
  const [phase, setPhase] = useState<'idle' | 'measuring'>('idle')
  const [left, setLeft] = useState(READ_SECONDS)
  const [manual, setManual] = useState(false)
  const [metric, setMetric] = useState<'hrv' | 'rhr'>('hrv')
  const data = useRef<{ rr: number[]; hr: number[]; start: number }>({ rr: [], hr: [], start: 0 })

  useEffect(() => {
    if (phase !== 'measuring') return
    const onBeat = (rr: number[], hr: number) => {
      data.current.rr.push(...rr)
      // Skip the first 10 seconds while you settle.
      if (Date.now() - data.current.start > 10000) data.current.hr.push(hr)
    }
    rrListeners.add(onBeat)
    const t = setInterval(() => {
      const remaining = READ_SECONDS - Math.floor((Date.now() - data.current.start) / 1000)
      setLeft(Math.max(0, remaining))
      if (remaining <= 0) finish()
    }, 250)
    return () => {
      rrListeners.delete(onBeat)
      clearInterval(t)
    }
  }, [phase])

  const begin = async () => {
    if (hrStatus.value !== 'connected' && !(await connectHR())) return
    data.current = { rr: [], hr: [], start: Date.now() }
    setLeft(READ_SECONDS)
    setPhase('measuring')
  }

  const finish = async () => {
    setPhase('idle')
    const { hr, rr } = data.current
    if (hr.length < 10) return toast('Not enough heart rate data. Check the strap is snug and try again.')
    const rhr = Math.round(mean(hr))
    const hrv = rmssd(rr)
    await saveReading({ id: uid('r'), date: Date.now(), rhr, hrv, updatedAt: 0 })
    toast(hrv ? `Resting ${rhr} bpm · HRV ${hrv} ms` : `Resting ${rhr} bpm. Your strap didn’t send beat intervals, so no HRV.`)
  }

  // Baseline: the previous 30 days, excluding today's reading.
  const today = startOfDay(new Date())
  const todays = latest && startOfDay(new Date(latest.date)) === today ? latest : null
  const base = list.filter((r) => r !== todays && r.date > Date.now() - 30 * DAY)
  const baseHrv = base.map((r) => r.hrv).filter((x): x is number => x != null)
  const baseRhr = base.map((r) => r.rhr)
  let verdict: { tone: 'good' | 'easy' | 'normal' | 'building'; text: string } | null = null
  if (todays) {
    if (base.length < 4) verdict = { tone: 'building', text: `Building your baseline: ${base.length + 1} of 5 mornings.` }
    else {
      const hm = baseHrv.length >= 4 ? mean(baseHrv) : null
      const hsd = hm != null ? Math.sqrt(mean(baseHrv.map((x) => (x - hm) ** 2))) : 0
      const rm = mean(baseRhr)
      const lowHrv = hm != null && todays.hrv != null && todays.hrv < hm - Math.max(hsd, hm * 0.07)
      const highRhr = todays.rhr >= rm + 5
      if (lowHrv || highRhr) verdict = { tone: 'easy', text: 'Below your usual. Keep today easy: zone 2, mobility, or rest.' }
      else if (hm != null && todays.hrv != null && todays.hrv >= hm) verdict = { tone: 'good', text: 'Recovered. A good day to train.' }
      else verdict = { tone: 'normal', text: 'Within your normal range.' }
    }
  }

  const points = [...list]
    .filter((r) => r.date > Date.now() - 90 * DAY && (metric === 'rhr' || r.hrv != null))
    .reverse()
    .map((r) => ({ t: r.date, v: metric === 'hrv' ? r.hrv! : r.rhr }))

  if (phase === 'measuring') {
    const pct = 1 - left / READ_SECONDS
    const c = 2 * Math.PI * 70
    return (
      <section class="card body-card">
        <div class="fast-head">
          <span class="eyebrow">
            <Icon name="heart" size={14} /> Morning check
          </span>
        </div>
        <div class="fast-ring reading-ring">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r="70" class="ring-bg" />
            <circle cx="80" cy="80" r="70" class="ring-fg" stroke-dasharray={c} stroke-dashoffset={c * (1 - pct)} transform="rotate(-90 80 80)" />
          </svg>
          <div class="ring-text">
            <b>{bpm.value ?? '--'}</b>
            <span>bpm · {left}s left</span>
          </div>
        </div>
        <p class="fast-idle center-text">Lie still and breathe normally.</p>
        <button class="btn btn-secondary btn-block" onClick={() => setPhase('idle')}>
          Cancel
        </button>
      </section>
    )
  }

  return (
    <section class="card body-card">
      <div class="fast-head">
        <span class="eyebrow">
          <Icon name="heart" size={14} /> Morning check
        </span>
        {latest && <span class="muted small">{fmtDay(latest.date)}</span>}
      </div>
      {latest ? (
        <div class="reading-now">
          <div>
            <b>{latest.rhr}</b>
            <span>resting bpm</span>
          </div>
          <div>
            <b>{latest.hrv ?? '–'}</b>
            <span>HRV ms</span>
          </div>
          {baseHrv.length >= 4 && (
            <div>
              <b>{Math.round(mean(baseHrv))}</b>
              <span>30-day HRV</span>
            </div>
          )}
        </div>
      ) : (
        <p class="fast-idle">
          A one-minute reading after you wake, lying still with the strap on. Over a few mornings it learns your normal and tells you when to take it easy.
        </p>
      )}
      {verdict && <p class={'verdict ' + verdict.tone}>{verdict.text}</p>}
      {hrSupported ? (
        <button class="btn btn-primary btn-block" onClick={begin} disabled={hrStatus.value === 'connecting'}>
          {todays ? 'Take another reading' : hrStatus.value === 'connected' ? `Start 1-minute reading` : 'Connect strap and start'}
        </button>
      ) : (
        <p class="field-hint">Readings need a Bluetooth strap in Chrome on Android. You can still enter a resting heart rate yourself.</p>
      )}
      <button class="show-all" onClick={() => setManual(true)}>
        Enter a reading by hand
      </button>
      {points.length > 1 && (
        <>
          <div class="seg-row">
            {(['hrv', 'rhr'] as const).map((m) => (
              <button class={'chip' + (metric === m ? ' on' : '')} aria-pressed={metric === m} onClick={() => setMetric(m)}>
                {m === 'hrv' ? 'HRV' : 'Resting HR'}
              </button>
            ))}
          </div>
          <LineChart points={points} format={(v) => (metric === 'hrv' ? `${Math.round(v)} ms` : `${Math.round(v)} bpm`)} best={metric === 'hrv' ? 'high' : 'low'} />
        </>
      )}
      {list.length > 0 && (
        <button
          class="show-all"
          onClick={() =>
            actionSheet({
              title: 'Recent readings',
              actions: list.slice(0, 8).map((r) => ({
                label: `${fmtDay(r.date)}: ${r.rhr} bpm${r.hrv ? ` · ${r.hrv} ms` : ''}`,
                hint: 'Delete',
                onSelect: async () => {
                  await remove('readings', r.id)
                  toast('Reading deleted', { label: 'Undo', run: () => void saveReading(r) })
                },
              })),
            })
          }
        >
          Manage readings
        </button>
      )}
      <ManualReading open={manual} onClose={() => setManual(false)} />
    </section>
  )
}

function ManualReading({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rhr, setRhr] = useState('')
  const [hrv, setHrv] = useState('')
  useEffect(() => {
    if (open) (setRhr(''), setHrv(''))
  }, [open])
  const save = async () => {
    const r = Number(rhr)
    if (!r || r < 25 || r > 150) return toast('Enter a resting heart rate between 25 and 150')
    const h = hrv ? Number(hrv) : null
    await saveReading({ id: uid('r'), date: Date.now(), rhr: Math.round(r), hrv: h && h > 0 ? Math.round(h) : null, updatedAt: 0 } as Reading)
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Enter a reading"
      footer={
        <button class="btn btn-primary btn-block" onClick={save}>
          Save
        </button>
      }
    >
      <label class="field">
        <span>Resting heart rate (bpm)</span>
        <input id="manual-rhr" type="text" inputMode="numeric" value={rhr} onInput={(e) => setRhr(e.currentTarget.value.replace(/\D/g, ''))} />
      </label>
      <label class="field">
        <span>HRV, RMSSD in ms (optional, e.g. from your watch)</span>
        <input id="manual-hrv" type="text" inputMode="numeric" value={hrv} onInput={(e) => setHrv(e.currentTarget.value.replace(/\D/g, ''))} />
      </label>
    </Sheet>
  )
}

// ---- Zone 2 weekly goal -----------------------------------------------------------------

const GOAL_OPTIONS = [60, 90, 120, 150, 180, 240, 300]

export function Zone2Week() {
  const goal = settings.value.zone2Goal
  const thisWeek = startOfWeek(Date.now())
  let now = 0
  let last = 0
  for (const w of workouts.value) {
    if (w.start < thisWeek - 7 * DAY) break // newest first
    const s = summarizeHR(w.hr)
    if (!s) continue
    if (w.start >= thisWeek) now += s.zoneSeconds[1] / 60
    else last += s.zoneSeconds[1] / 60
  }
  const pct = Math.min(1, now / goal)
  const c = 2 * Math.PI * 34
  const daysLeft = 7 - Math.floor((Date.now() - thisWeek) / DAY)
  return (
    <section class="card body-card zone2-card">
      <div class="z2-ring">
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="40" r="34" class="z2-bg" />
          <circle cx="40" cy="40" r="34" class="z2-fg" stroke-dasharray={c} stroke-dashoffset={c * (1 - pct)} transform="rotate(-90 40 40)" />
        </svg>
        <span>{Math.round(pct * 100)}%</span>
      </div>
      <div class="z2-text">
        <span class="eyebrow">Zone 2 this week</span>
        <b>
          {Math.round(now)} <small>/ {goal} min</small>
        </b>
        <span class="muted small">
          {now >= goal ? 'Goal reached.' : `${Math.ceil(goal - now)} min to go · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
          {last > 0 ? ` · last week ${Math.round(last)}` : ''}
        </span>
      </div>
      <button
        class="icon-btn"
        aria-label="Change weekly zone 2 goal"
        onClick={() =>
          actionSheet({
            title: 'Weekly zone 2 goal',
            message: 'Minutes in zone 2 across all workouts, Monday to Sunday.',
            actions: GOAL_OPTIONS.map((m) => ({ label: `${m} minutes`, selected: m === goal, onSelect: () => saveSettings({ zone2Goal: m }) })),
          })
        }
      >
        <Icon name="pencil" size={18} />
      </button>
    </section>
  )
}

// ---- Shoulder trend -----------------------------------------------------------------------

export function ShoulderCard() {
  if (!settings.value.askShoulder) return null
  const rated = workouts.value.filter((w) => w.shoulder != null)
  const now = Date.now()
  const recent = rated.filter((w) => w.start > now - 14 * DAY).map((w) => w.shoulder!)
  const prior = rated.filter((w) => w.start <= now - 14 * DAY && w.start > now - 28 * DAY).map((w) => w.shoulder!)
  const rAvg = recent.length ? mean(recent) : null
  const pAvg = prior.length ? mean(prior) : null
  const worse = rAvg != null && pAvg != null && rAvg - pAvg >= 1 && rAvg >= 3
  const better = rAvg != null && pAvg != null && pAvg - rAvg >= 1
  const points = [...rated]
    .filter((w) => w.start > now - 120 * DAY)
    .reverse()
    .map((w) => ({ t: w.start, v: w.shoulder! }))
  return (
    <section class="card body-card">
      <div class="fast-head">
        <span class="eyebrow">
          <Icon name="activity" size={14} /> Shoulder
        </span>
        {rated[0] && <span class="muted small">Last: {rated[0].shoulder}/10</span>}
      </div>
      {!rated.length ? (
        <p class="fast-idle">Rate stiffness from 0 to 10 when you finish a workout. If it creeps up week to week, you’ll see it here.</p>
      ) : (
        <>
          <div class="reading-now">
            {rAvg != null && (
              <div>
                <b>{rAvg.toFixed(1)}</b>
                <span>last 2 weeks</span>
              </div>
            )}
            {pAvg != null && (
              <div>
                <b>{pAvg.toFixed(1)}</b>
                <span>2 weeks before</span>
              </div>
            )}
          </div>
          {worse && <p class="verdict easy">Stiffness is creeping up. Your plan says: shorten the range or lower the weight, and get it checked by a physio if it keeps rising.</p>}
          {better && <p class="verdict good">Easing off compared with two weeks ago.</p>}
          {points.length > 1 && <LineChart points={points} format={(v) => `${v}/10`} best="low" />}
        </>
      )}
    </section>
  )
}
