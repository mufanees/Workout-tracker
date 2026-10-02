import { useEffect, useState } from 'preact/hooks'
import { active, exMap, routines, settings, unit, updateActive } from '../store'
import { navigate } from '../router'
import { adjustRest, armRest, discardActive, finishActive, restTimer, startRest, stopRest, unlockAudio } from '../workout'
import { HRPanel } from '../ui/HR'
import { checkCoach, coachOn, quick } from '../coach'
import { summarizeHR } from '../hr'
import { WorkoutEditor, completeSet, placeholderFor, nextUp } from '../ui/WorkoutEditor'
import type { WExercise, WSet } from '../types'
import { Icon } from '../ui/icons'
import { AutoText, confirmDialog, Sheet, toast } from '../ui/overlay'
import { doneSets, fmtClock, fmtNum, fmtVolume, toDisplay, workoutVolume, haptic } from '../util'
import { matchPrevious, previousSets } from '../stats'

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let dead = false
    const get = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen')
        if (dead) void lock?.release()
      } catch {
        /* denied or unsupported */
      }
    }
    const onVis = () => document.visibilityState === 'visible' && get()
    void get()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      dead = true
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release()
    }
  }, [on])
}

export function Elapsed({ start }: { start: number }) {
  const now = useNow()
  return <>{fmtClock((now - start) / 1000)}</>
}

export function Live() {
  const w = active.value
  const [finishing, setFinishing] = useState(false)
  useWakeLock(!!w && settings.value.keepAwake)
  useEffect(() => {
    if (restTimer.value) armRest()
    // Resuming mid-workout: bring the next set to do into view.
    const list = active.value?.exercises || []
    if (list.some((e) => e.sets.some((s) => s.done))) {
      for (const we of list) {
        const set = we.sets.find((s) => !s.done)
        if (set) {
          nextUp.value = set.id
          requestAnimationFrame(() => scrollToSet(set.id, 'auto'))
          break
        }
      }
    }
  }, [])

  useEffect(() => {
    if (!w) navigate('/train', { replace: true })
  }, [!w])
  if (!w) return null

  const vol = workoutVolume(w)
  const hrLive = summarizeHR(w.hr)
  const working = w.exercises.flatMap((e) => e.sets).filter((s) => s.kind !== 'warmup')
  const done = working.filter((s) => s.done).length
  const total = working.length

  const onSetDone = (weId: string) => {
    unlockAudio()
    const list = active.value!.exercises
    const we = list.find((e) => e.id === weId)
    if (!we) return
    const next = nextSet(list, we)
    nextUp.value = next?.set.id || null
    if (next) scrollToSet(next.set.id)
    if (!next) {
      stopRest()
      toast('All sets done. Tap Finish when you’re ready.')
      return
    }
    let rest = we.rest
    if (we.superset) {
      const group = list.filter((e) => e.superset === we.superset)
      if (group.indexOf(we) < group.length - 1 && next.we.superset === we.superset) {
        // Mid-superset: go straight to the next exercise.
        stopRest()
        return
      }
      rest = Math.max(...group.map((e) => e.rest))
    }
    const name = exMap.value.get(next.we.exerciseId)?.name || 'next set'
    if (rest) startRest(rest, `${name}, set ${next.label}`)
  }

  const finish = async () => {
    const hasHR = (w.hr?.length || 0) >= 6 // at least ~30 s of heart rate
    if (!hasHR && !w.exercises.some((e) => e.sets.some((s) => s.done))) {
      const discard = await confirmDialog({
        title: 'Nothing logged yet',
        message: 'Check off at least one set (or record some heart rate) to save this workout, or discard it.',
        confirm: 'Discard workout',
        cancel: 'Keep going',
        danger: true,
      })
      if (discard) {
        await discardActive()
        navigate('/train', { replace: true })
      }
      return
    }
    setFinishing(true)
  }

  const discard = async () => {
    const ok = await confirmDialog({
      title: 'Discard workout?',
      message: 'Everything you logged in this session will be lost.',
      confirm: 'Discard',
      cancel: 'Cancel',
      danger: true,
    })
    if (!ok) return
    await discardActive()
    navigate('/train', { replace: true })
  }

  return (
    <div class="live">
      <header class="live-head">
        <button class="icon-btn" onClick={() => navigate('/train')} aria-label="Minimize workout">
          <Icon name="down" size={24} />
        </button>
        <input
          class="live-title"
          value={w.name}
          aria-label="Workout name"
          onInput={(e) => {
            const v = e.currentTarget.value
            updateActive((x) => void (x.name = v))
          }}
        />
        <RestPill />
        <button class="btn btn-primary btn-sm" onClick={finish}>
          Finish
        </button>
      </header>
      <div class="live-stats" aria-label="Workout stats">
        <div>
          <span class="stat-label">Duration</span>
          <b class="stat-value accent">
            <Elapsed start={w.start} />
          </b>
        </div>
        {w.exercises.length || !hrLive ? (
          <>
            <div>
              <span class="stat-label">Volume</span>
              <b class="stat-value">
                {fmtNum(Math.round(toDisplay(vol, unit.value)))} <small>{unit.value}</small>
              </b>
            </div>
            <div>
              <span class="stat-label">Sets</span>
              <b class="stat-value">
                {done}
                <small>/{total}</small>
              </b>
            </div>
          </>
        ) : (
          <>
            <div>
              <span class="stat-label">Avg HR</span>
              <b class="stat-value">{hrLive.avg}</b>
            </div>
            <div>
              <span class="stat-label">{w.targetZone ? `In Z${w.targetZone}` : 'Max HR'}</span>
              <b class="stat-value">
                {w.targetZone ? (
                  <>
                    {Math.floor(hrLive.zoneSeconds[w.targetZone - 1] / 60)}
                    <small> min</small>
                  </>
                ) : (
                  hrLive.max
                )}
              </b>
            </div>
          </>
        )}
      </div>
      <div class="progress" aria-hidden="true">
        <span style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
      </div>

      <main class="live-body">
        <HRPanel />
        <CoachPlanCard />
        {w.routineId && w.exercises.length > 0 && <RoutineNotes />}
        {w.warmup?.length ? <Checklist kind="w" title="Warm-up" items={w.warmup} /> : null}
        <WorkoutEditor
          mode="live"
          exercises={w.exercises}
          workoutId={w.id}
          onChange={(fn) => updateActive((x) => void (x.exercises = fn(x.exercises)))}
          onSetDone={onSetDone}
        />
        {w.cooldown?.length ? <Checklist kind="c" title="Cool-down" items={w.cooldown} /> : null}
        <button class="btn btn-ghost-danger btn-block" onClick={discard}>
          Discard workout
        </button>
      </main>

      <RestBar />
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} />
    </div>
  )
}

function RoutineNotes() {
  const [open, setOpen] = useState(false)
  const notes = routines.value.find((r) => r.id === active.value?.routineId)?.notes
  if (!notes) return null
  return (
    <button class={'routine-note' + (open ? ' open' : '')} onClick={() => setOpen(!open)} aria-expanded={open}>
      <Icon name="note" size={16} />
      <span>{notes}</span>
    </button>
  )
}

/** Today's targets from the coach, fetched once when a routine workout starts. */
function CoachPlanCard() {
  const w = active.value!
  const plan = w.coachPlan
  const started = w.exercises.some((e) => e.sets.some((s) => s.done))
  useEffect(() => {
    if (coachOn.value == null) void checkCoach()
  }, [])
  useEffect(() => {
    if (!coachOn.value || w.coachPlanAsked || !w.exercises.length || started) return
    updateActive((x) => void (x.coachPlanAsked = true))
    const names = w.exercises.map((e) => exMap.value.get(e.exerciseId)?.name || '').filter(Boolean)
    quick<{ focus: string; targets: { exercise: string; weight_kg?: number; reps?: string; note?: string }[] }>({ kind: 'pre', routine: w.name, exercises: names })
      .then((r) => updateActive((x) => void (x.coachPlan = { focus: r.focus, targets: r.targets || [] })))
      .catch(() => updateActive((x) => void (x.coachPlan = null)))
  }, [coachOn.value])
  if (!coachOn.value || (!plan && (!w.coachPlanAsked || started))) return null
  if (!plan) {
    return (
      <section class="coach-card loading">
        <span class="eyebrow">
          <Icon name="sparkles" size={14} /> Coach
        </span>
        <span class="coach-status">
          <span class="spinner" aria-hidden="true" /> Working out today’s targets…
        </span>
      </section>
    )
  }
  const u = unit.value
  const apply = () => {
    let n = 0
    updateActive((x) => {
      for (const t of plan.targets) {
        const want = t.exercise.toLowerCase()
        const we = x.exercises.find((e) => (exMap.value.get(e.exerciseId)?.name || '').toLowerCase() === want) || x.exercises.find((e) => (exMap.value.get(e.exerciseId)?.name || '').toLowerCase().includes(want))
        if (!we) continue
        const reps = Number(String(t.reps || '').match(/\d+/)?.[0])
        for (const s of we.sets) {
          if (s.done || s.kind === 'warmup') continue
          if (t.weight_kg != null && Number.isFinite(t.weight_kg)) s.cw = t.weight_kg
          if (Number.isFinite(reps)) s.cr = reps
        }
        n++
      }
      if (x.coachPlan) x.coachPlan.applied = true
    })
    toast(n ? `Targets set for ${n} exercise${n > 1 ? 's' : ''}` : 'Couldn’t match those exercises')
  }
  return (
    <section class="coach-card">
      <span class="eyebrow">
        <Icon name="sparkles" size={14} /> Coach · today
      </span>
      {plan.focus && <p>{plan.focus}</p>}
      {plan.targets.length > 0 && (
        <ul class="coach-targets">
          {plan.targets.map((t) => (
            <li>
              <span>
                {t.exercise}
                {t.note && <small>{t.note}</small>}
              </span>
              <b>
                {t.weight_kg != null ? `${fmtNum(toDisplay(t.weight_kg, u))} ${u}` : ''}
                {t.weight_kg != null && t.reps ? ' × ' : ''}
                {t.reps || ''}
              </b>
            </li>
          ))}
        </ul>
      )}
      {plan.targets.length > 0 &&
        (plan.applied ? (
          <span class="proposal-state">
            <Icon name="check" size={14} /> Targets are in your grey values
          </span>
        ) : (
          <button class="btn btn-secondary btn-sm" onClick={apply}>
            Use these targets
          </button>
        ))}
    </section>
  )
}

/** Tick-off list for the routine's warm-up or cool-down. Collapses once everything is done. */
function Checklist({ kind, title, items }: { kind: 'w' | 'c'; title: string; items: string[] }) {
  const checks = active.value?.checks || {}
  const done = items.filter((_, i) => checks[kind + i]).length
  const complete = done === items.length
  const [open, setOpen] = useState(!complete)
  useEffect(() => {
    if (complete) setOpen(false)
  }, [complete])
  return (
    <section class={'checklist' + (complete ? ' complete' : '')}>
      <button class="checklist-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span class={'cl-dot' + (complete ? ' on' : '')}>{complete && <Icon name="check" size={14} stroke={3} />}</span>
        <b>{title}</b>
        <span class="cl-count">
          {done}/{items.length}
        </span>
        <Icon name="down" size={18} class={'chev' + (open ? ' open' : '')} />
      </button>
      {open && (
        <ul>
          {items.map((it, i) => {
            const on = !!checks[kind + i]
            return (
              <li>
                <button
                  class={'cl-item' + (on ? ' on' : '')}
                  aria-pressed={on}
                  onClick={() => {
                    haptic(8)
                    updateActive((x) => {
                      x.checks = { ...(x.checks || {}), [kind + i]: !on }
                    })
                  }}
                >
                  <span class="cl-box">{on && <Icon name="check" size={14} stroke={3} />}</span>
                  <span>{it}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function RestBar() {
  const r = restTimer.value
  const now = useNow(250)
  if (!r) return null
  const left = Math.max(0, Math.ceil((r.end - now) / 1000))
  const pct = Math.min(100, Math.max(0, ((r.end - now) / 1000 / r.total) * 100))
  return (
    <div class="rest-bar" role="timer" aria-live="off" aria-label={`Rest ${fmtClock(left)} remaining`}>
      <div class="rest-fill" style={{ width: pct + '%' }} />
      <div class="rest-inner">
        <button class="rest-btn" onClick={() => (haptic(), adjustRest(-15))} aria-label="Subtract 15 seconds">
          −15
        </button>
        <div class="rest-center">
          <span class="rest-time">{fmtClock(left)}</span>
          <span class="rest-label">Next: {r.label}</span>
        </div>
        <button class="rest-btn" onClick={() => (haptic(), adjustRest(15))} aria-label="Add 15 seconds">
          +15
        </button>
        <button class="rest-btn skip" onClick={stopRest}>
          Skip
        </button>
      </div>
    </div>
  )
}

function FinishSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const w = active.value
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [stuck, setStuck] = useState<string[]>([])
  const [shoulder, setShoulder] = useState<number | null>(null)
  useEffect(() => {
    if (open && w) {
      setShoulder(w.shoulder ?? null)
      setNotes(w.notes)
      setSaving(false)
      setStuck([])
    }
  }, [open])
  if (!w) return null
  const u = unit.value
  const pending = w.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0)

  const completeAll = () => {
    const missing = new Set<string>()
    updateActive((x) => {
      for (const we of x.exercises) {
        const ex = exMap.value.get(we.exerciseId)
        if (!ex) continue
        const matched = matchPrevious(we.sets, previousSets(we.exerciseId, x.id))
        we.sets.forEach((s, i) => {
          if (s.done) return
          const { set } = completeSet(s, placeholderFor(we.sets, i, matched), ex)
          if (set) we.sets[i] = set
          else missing.add(ex.name)
        })
      }
    })
    setStuck([...missing])
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    const saved = await finishActive(w.name, notes, settings.value.askShoulder ? { shoulder } : {})
    onClose()
    if (saved) navigate('/history/' + saved.id + '?done=1', { replace: true })
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Finish workout"
      footer={
        <button class="btn btn-primary btn-block btn-lg" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save workout'}
        </button>
      }
    >
      <div class="summary-stats">
        <div>
          <span class="stat-label">Duration</span>
          <b>
            <Elapsed start={w.start} />
          </b>
        </div>
        <div>
          <span class="stat-label">Volume</span>
          <b>{fmtVolume(workoutVolume(w), u)}</b>
        </div>
        <div>
          <span class="stat-label">Sets</span>
          <b>{doneSets(w)}</b>
        </div>
      </div>
      {pending > 0 && (
        <div class="pending-card">
          <p>
            <b>
              {pending} unchecked {pending === 1 ? 'set' : 'sets'}
            </b>{' '}
            won’t be saved.
            {stuck.length > 0 && <> {stuck.join(', ')} {stuck.length === 1 ? 'has' : 'have'} no values to fill in.</>}
          </p>
          <div class="row gap">
            <button class="btn btn-secondary btn-sm grow" onClick={onClose}>
              Go back
            </button>
            {stuck.length === 0 && (
              <button class="btn btn-secondary btn-sm grow" onClick={completeAll}>
                Fill in grey values
              </button>
            )}
          </div>
        </div>
      )}
      {settings.value.askShoulder && (
        <div class="field">
          <span>Shoulder stiffness today</span>
          <div class="scale-row" role="radiogroup" aria-label="Shoulder stiffness, 0 none to 10 worst">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                role="radio"
                aria-checked={shoulder === n}
                class={'scale-btn' + (shoulder === n ? ' on' : '') + (n >= 7 ? ' high' : n >= 4 ? ' mid' : '')}
                onClick={() => setShoulder(shoulder === n ? null : n)}
              >
                {n}
              </button>
            ))}
          </div>
          <span class="field-hint">0 is none, 10 is the worst. Skip it if you didn’t notice.</span>
        </div>
      )}
      <label class="field">
        <span>How did it go?</span>
        <AutoText value={notes} onInput={setNotes} placeholder="Optional: energy, sleep, anything worth remembering" class="input-like" />
      </label>
    </Sheet>
  )
}

/** The next set to do: alternate through a superset, otherwise finish this exercise, then move on. */
function nextSet(list: WExercise[], we: WExercise): { we: WExercise; set: WSet; label: string } | null {
  const firstOpen = (e: WExercise) => {
    let n = 0
    for (const s of e.sets) {
      if (s.kind !== 'warmup') n++
      if (!s.done) return { we: e, set: s, label: s.kind === 'warmup' ? 'W' : String(n) }
    }
    return null
  }
  const i = list.indexOf(we)
  if (we.superset) {
    const group = list.filter((e) => e.superset === we.superset)
    const pos = group.indexOf(we)
    for (let k = 1; k <= group.length; k++) {
      const hit = firstOpen(group[(pos + k) % group.length])
      if (hit) return hit
    }
    const last = list.indexOf(group[group.length - 1])
    for (const e of [...list.slice(last + 1), ...list.slice(0, last + 1)]) {
      const hit = firstOpen(e)
      if (hit) return hit
    }
    return null
  }
  for (const e of [...list.slice(i), ...list.slice(0, i)]) {
    const hit = firstOpen(e)
    if (hit) return hit
  }
  return null
}

function scrollToSet(setId: string, behavior: ScrollBehavior = 'smooth') {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-set="${setId}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    // Leave room for the sticky header and the rest bar.
    if (r.top < 150 || r.bottom > window.innerHeight - 130) el.scrollIntoView({ behavior, block: 'center' })
  })
}

function RestPill() {
  const r = restTimer.value
  const now = useNow(500)
  if (!r) return null
  const left = Math.max(0, Math.ceil((r.end - now) / 1000))
  return (
    <button class="rest-pill" onClick={stopRest} aria-label={`Rest ${fmtClock(left)}. Skip`}>
      <Icon name="timer" size={14} /> {fmtClock(left)}
    </button>
  )
}
