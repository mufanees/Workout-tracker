import { useEffect, useState } from 'preact/hooks'
import { active, exMap, routines, settings, unit, updateActive } from '../store'
import { navigate } from '../router'
import { adjustRest, armRest, discardActive, finishActive, restTimer, startRest, stopRest, unlockAudio } from '../workout'
import { WorkoutEditor, completeSet, placeholderFor } from '../ui/WorkoutEditor'
import { Icon } from '../ui/icons'
import { actionSheet, AutoText, confirmDialog, Sheet, toast } from '../ui/overlay'
import { doneSets, fmtClock, fmtNum, fmtWeight, toDisplay, totalSets, workoutVolume, haptic } from '../util'
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
  }, [])

  useEffect(() => {
    if (!w) navigate('/train', { replace: true })
  }, [!w])
  if (!w) return null

  const vol = workoutVolume(w)
  const done = doneSets(w)
  const total = totalSets(w)

  const onSetDone = (weId: string) => {
    unlockAudio()
    const list = active.value!.exercises
    const we = list.find((e) => e.id === weId)
    if (!we) return
    const name = (id: string) => exMap.value.get(id)?.name || 'next set'
    let rest = we.rest
    let nextLabel = name(we.exerciseId)
    if (we.superset) {
      const group = list.filter((e) => e.superset === we.superset)
      const pos = group.indexOf(we)
      if (pos < group.length - 1) {
        // Mid-superset: go straight to the next exercise.
        stopRest()
        return
      }
      rest = Math.max(...group.map((e) => e.rest))
      nextLabel = name(group[0].exerciseId)
    }
    if (rest) startRest(rest, nextLabel)
  }

  const finish = async () => {
    const all = w.exercises.flatMap((e) => e.sets)
    if (!all.some((s) => s.done)) {
      const discard = await confirmDialog({
        title: 'Nothing logged yet',
        message: 'Check off at least one set to save this workout, or discard it.',
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
    const pending = all.filter((s) => !s.done).length
    if (pending) {
      actionSheet({
        title: `${pending} unchecked ${pending === 1 ? 'set' : 'sets'}`,
        message: 'Unchecked sets are not saved.',
        actions: [
          { label: 'Leave them out and finish', icon: 'check', onSelect: () => setFinishing(true) },
          { label: 'Complete them with the grey values', icon: 'copy', onSelect: completeAll },
        ],
      })
      return
    }
    setFinishing(true)
  }

  const completeAll = () => {
    let skipped = 0
    updateActive((x) => {
      for (const we of x.exercises) {
        const ex = exMap.value.get(we.exerciseId)
        if (!ex) continue
        const matched = matchPrevious(we.sets, previousSets(we.exerciseId, x.id))
        we.sets.forEach((s, i) => {
          if (s.done) return
          const { set } = completeSet(s, placeholderFor(we.sets, i, matched), ex)
          if (set) we.sets[i] = set
          else skipped++
        })
      }
    })
    if (skipped) toast(`${skipped} ${skipped === 1 ? 'set has' : 'sets have'} no values and will be left out`)
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
      </div>
      <div class="progress" aria-hidden="true">
        <span style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
      </div>

      <main class="live-body">
        {w.routineId && w.exercises.length > 0 && done === 0 && <RoutineNotes />}
        <WorkoutEditor
          mode="live"
          exercises={w.exercises}
          workoutId={w.id}
          onChange={(fn) => updateActive((x) => void (x.exercises = fn(x.exercises)))}
          onSetDone={onSetDone}
        />
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
          <span class="rest-label">Rest · next: {r.label}</span>
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
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open && w) {
      setName(w.name)
      setNotes(w.notes)
      setSaving(false)
    }
  }, [open])
  if (!w) return null
  const u = unit.value
  const save = async () => {
    if (saving) return
    setSaving(true)
    const saved = await finishActive(name, notes)
    onClose()
    if (saved) navigate('/history/' + saved.id + '?done=1', { replace: true })
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Save workout"
      footer={
        <button class="btn btn-primary btn-block btn-lg" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save workout'}
        </button>
      }
    >
      <label class="field">
        <span>Title</span>
        <input type="text" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <div class="summary-stats">
        <div>
          <span class="stat-label">Duration</span>
          <b>
            <Elapsed start={w.start} />
          </b>
        </div>
        <div>
          <span class="stat-label">Volume</span>
          <b>{fmtWeight(workoutVolume(w), u)}</b>
        </div>
        <div>
          <span class="stat-label">Sets</span>
          <b>{doneSets(w)}</b>
        </div>
      </div>
      <label class="field">
        <span>How did it go?</span>
        <AutoText value={notes} onInput={setNotes} placeholder="Energy, sleep, shoulder, anything worth remembering" class="input-like" />
      </label>
    </Sheet>
  )
}
