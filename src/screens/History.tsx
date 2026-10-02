import { useEffect, useState } from 'preact/hooks'
import { workouts, exMap, unit, remove, saveWorkout, saveRoutine, routines } from '../store'
import { navigate, back, route } from '../router'
import { prIndex, PR_LABEL } from '../stats'
import { repeatWorkout, routineDiff, updateRoutineFrom } from '../workout'
import { Icon } from '../ui/icons'
import { actionSheet, confirmDialog, toast } from '../ui/overlay'
import { WorkoutEditor } from '../ui/WorkoutEditor'
import { HRSummaryCard, hrLine, ZoneTrends } from '../ui/HR'
import { summarizeHR } from '../hr'
import { QuoteCard } from '../ui/Quote'
import type { Workout } from '../types'
import { counts, doneSets, fmtDay, fmtDuration, fmtMonth, fmtSet, fmtTime, fmtVolume, startOfWeek, uid, workoutVolume, clone } from '../util'

const WEEK = 7 * 86400000

function weekStats() {
  const list = workouts.value
  const thisWeek = startOfWeek(Date.now())
  const bars: { start: number; count: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const s = thisWeek - i * WEEK
    bars.push({ start: s, count: 0 })
  }
  const weeks = new Set<number>()
  for (const w of list) {
    const ws = startOfWeek(w.start)
    weeks.add(ws)
    const b = bars.find((x) => x.start === ws)
    if (b) b.count++
  }
  // Streak: consecutive weeks with at least one workout, counting back from this week (or last week if this week is empty so far).
  let streak = 0
  let cursor = weeks.has(thisWeek) ? thisWeek : thisWeek - WEEK
  while (weeks.has(cursor)) {
    streak++
    cursor -= WEEK
  }
  return { bars, streak, thisWeek: bars[bars.length - 1].count }
}

export function History() {
  const list = workouts.value
  const { bars, streak, thisWeek } = weekStats()
  const max = Math.max(4, ...bars.map((b) => b.count))
  const months: { label: string; items: Workout[] }[] = []
  for (const w of list) {
    const label = fmtMonth(w.start)
    const last = months[months.length - 1]
    if (last?.label === label) last.items.push(w)
    else months.push({ label, items: [w] })
  }

  return (
    <div class="screen">
      <header class="page-head">
        <h1>History</h1>
      </header>
      {list.length > 0 && (
        <section class="week-card">
          <div class="week-stats">
            <div>
              <b>{thisWeek}</b>
              <span>this week</span>
            </div>
            <div>
              <b>
                {streak}
                {streak > 0 && <Icon name="flame" size={18} class="flame" />}
              </b>
              <span>week streak</span>
            </div>
            <div>
              <b>{list.length}</b>
              <span>workouts</span>
            </div>
          </div>
          <div class="week-bars" role="img" aria-label={`Workouts per week, last 12 weeks: ${bars.map((b) => b.count).join(', ')}`}>
            {bars.map((b, i) => (
              <div class="week-bar" key={b.start}>
                <span class={b.count ? 'on' : ''} style={{ height: `${Math.max(b.count ? 14 : 6, (b.count / max) * 100)}%` }} />
                {(i === 0 || i === 6 || i === 11) && <small>{i === 11 ? 'Now' : `${11 - i}w`}</small>}
              </div>
            ))}
          </div>
        </section>
      )}
      <ZoneTrends workouts={list} />
      {!list.length && (
        <div class="empty-state">
          <Icon name="history" size={36} />
          <h2>No workouts yet</h2>
          <p>Finished workouts show up here, with your records and progress.</p>
          <button class="btn btn-primary" onClick={() => navigate('/train')}>
            Go train
          </button>
        </div>
      )}
      {months.map((m) => (
        <section key={m.label}>
          <h2 class="month-label">{m.label}</h2>
          <div class="workout-list">
            {m.items.map((w) => (
              <WorkoutCard w={w} key={w.id} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function WorkoutCard({ w }: { w: Workout }) {
  const u = unit.value
  const prs = prIndex.value.byWorkout.get(w.id) || 0
  const vol = workoutVolume(w)
  return (
    <button class="workout-card" onClick={() => navigate('/history/' + w.id)}>
      <div class="wc-top">
        <span class="wc-name">{w.name}</span>
        <span class="wc-date">{fmtDay(w.start)}</span>
      </div>
      <div class="wc-meta">
        <span>
          <Icon name="timer" size={14} /> {w.end ? fmtDuration(w.end - w.start) : '–'}
        </span>
        {vol > 0 && <span>{fmtVolume(vol, u)}</span>}
        {doneSets(w) > 0 && <span>{doneSets(w)} sets</span>}
        {hrLine(w) && (
          <span>
            <Icon name="heart" size={14} /> {hrLine(w)}
          </span>
        )}
        {prs > 0 && (
          <span class="pr-pill">
            <Icon name="medal" size={13} /> {prs} PR{prs > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <ul class="wc-ex">
        {w.exercises.slice(0, 4).map((e) => (
          <li>
            <span class="wc-sets">{e.sets.length} ×</span> {exMap.value.get(e.exerciseId)?.name || 'Exercise'}
          </li>
        ))}
        {w.exercises.length > 4 && <li class="muted">+{w.exercises.length - 4} more</li>}
      </ul>
    </button>
  )
}

export function WorkoutDetail({ id }: { id: string }) {
  const w = workouts.value.find((x) => x.id === id)
  const celebrate = route.value.query.get('done') === '1'
  const [diffHandled, setDiffHandled] = useState(false)
  if (!w) {
    return (
      <div class="screen">
        <header class="page-head sub">
          <button class="icon-btn" onClick={() => back('/history')} aria-label="Back">
            <Icon name="left" />
          </button>
        </header>
        <p class="empty-note">This workout no longer exists.</p>
      </div>
    )
  }
  const u = unit.value
  const prs = prIndex.value
  const prCount = prs.byWorkout.get(w.id) || 0
  const diff = celebrate && !diffHandled ? routineDiff(w) : null
  const number = [...workouts.value].reverse().findIndex((x) => x.id === w.id) + 1
  const hrStats = summarizeHR(w.hr)

  const menu = () =>
    actionSheet({
      title: w.name,
      actions: [
        { label: 'Edit workout', icon: 'pencil', onSelect: () => navigate('/edit/' + w.id) },
        { label: 'Do it again', icon: 'play', onSelect: () => repeatWorkout(w) },
        {
          label: 'Save as routine',
          icon: 'copy',
          onSelect: async () => {
            const r = {
              id: uid('r'),
              name: w.name,
              folder: '',
              notes: '',
              order: Math.max(0, ...routines.value.map((x) => x.order)) + 1,
              exercises: w.exercises.map((e) => ({ ...clone(e), id: uid('e'), sets: e.sets.map((s) => ({ ...s, id: uid('s'), done: false })) })),
              updatedAt: 0,
            }
            await saveRoutine(r)
            toast('Saved as routine', { label: 'Open', run: () => navigate('/routine/' + r.id) })
          },
        },
        {
          label: 'Delete workout',
          icon: 'trash',
          danger: true,
          onSelect: async () => {
            const ok = await confirmDialog({ title: 'Delete this workout?', message: 'It will be removed from your history and records.', confirm: 'Delete', danger: true })
            if (!ok) return
            await remove('workouts', w.id)
            back('/history')
            toast('Workout deleted', { label: 'Undo', run: () => void saveWorkout(w) })
          },
        },
      ],
    })

  return (
    <div class="screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => (celebrate ? navigate('/history', { replace: true }) : back('/history'))} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="grow" />
        <button class="icon-btn" onClick={menu} aria-label="Workout options">
          <Icon name="more" />
        </button>
      </header>

      {celebrate && (
        <section class="celebrate">
          <div class="celebrate-badge" aria-hidden="true">
            <Icon name="check" size={28} stroke={3} />
          </div>
          <h1>Workout #{number} done</h1>
          <p>{prCount ? `You set ${prCount} personal record${prCount > 1 ? 's' : ''}. Nice.` : 'Logged and saved. Rest well.'}</p>
          <QuoteCard compact seed={3} />
        </section>
      )}

      {!celebrate && <h1 class="detail-title">{w.name}</h1>}
      <p class="detail-date">
        {fmtDay(w.start)} at {fmtTime(w.start)}
      </p>

      <div class="summary-stats">
        <div>
          <span class="stat-label">Duration</span>
          <b>{w.end ? fmtDuration(w.end - w.start) : '–'}</b>
        </div>
        {doneSets(w) > 0 ? (
          <>
            <div>
              <span class="stat-label">Volume</span>
              <b>{fmtVolume(workoutVolume(w), u)}</b>
            </div>
            <div>
              <span class="stat-label">Sets</span>
              <b>{doneSets(w)}</b>
            </div>
            <div>
              <span class="stat-label">PRs</span>
              <b class={prCount ? 'gold' : ''}>{prCount}</b>
            </div>
          </>
        ) : hrStats ? (
          <>
            <div>
              <span class="stat-label">Avg HR</span>
              <b>{hrStats.avg}</b>
            </div>
            <div>
              <span class="stat-label">Max HR</span>
              <b>{hrStats.max}</b>
            </div>
            {w.targetZone ? (
              <div>
                <span class="stat-label">In Z{w.targetZone}</span>
                <b>{Math.round(hrStats.zoneSeconds[w.targetZone - 1] / 60)} min</b>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {diff && (
        <section class="update-card">
          <h2>Add these to “{diff.routine.name}”?</h2>
          <ul>
            {diff.changes.slice(0, 5).map((c) => (
              <li>{c}</li>
            ))}
          </ul>
          <div class="row gap">
            <button class="btn btn-quiet grow" onClick={() => setDiffHandled(true)}>
              Not now
            </button>
            <button
              class="btn btn-primary grow"
              onClick={async () => {
                await updateRoutineFrom(diff.routine, w)
                setDiffHandled(true)
                toast('Routine updated')
              }}
            >
              Add to routine
            </button>
          </div>
        </section>
      )}

      {w.notes && <p class="detail-notes">{w.notes}</p>}

      <HRSummaryCard w={w} />

      <div class="detail-list">
        {w.exercises.map((we) => {
          const ex = exMap.value.get(we.exerciseId)
          let n = 0
          return (
            <section class="detail-ex">
              <button class="detail-ex-name" onClick={() => ex && navigate('/exercises/' + ex.id)}>
                {ex?.name || 'Unknown exercise'} <Icon name="right" size={16} />
              </button>
              {we.notes && <p class="detail-ex-note">{we.notes}</p>}
              <ol class="detail-sets">
                {we.sets.map((s) => {
                  const kinds = prs.bySet.get(s.id) || []
                  const label = s.kind === 'warmup' ? 'W' : s.kind === 'failure' ? 'F' : s.kind === 'drop' ? 'D' : String(++n)
                  if (s.kind !== 'warmup' && s.kind !== 'normal') n++
                  return (
                    <li class={counts(s) ? '' : 'muted'}>
                      <span class={'set-kind static k-' + s.kind}>{label}</span>
                      <span class="ds-val">{fmtSet(s, ex?.type || 'weight_reps', u)}</span>
                      {kinds.length > 0 && (
                        <span class="pr-pill" title={kinds.map((k) => PR_LABEL[k]).join(', ')}>
                          <Icon name="medal" size={13} /> {PR_LABEL[kinds[0]]}
                          {kinds.length > 1 ? ` +${kinds.length - 1}` : ''}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
      </div>
      {celebrate && (
        <div class="stack">
          <button class="btn btn-secondary btn-block" onClick={() => navigate('/coach?review=' + w.id)}>
            <Icon name="coach" size={18} /> Ask your coach about it
          </button>
          <button class="btn btn-primary btn-block btn-lg" onClick={() => navigate('/train', { replace: true })}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}

/** Edit a finished workout with the same editor used while training. */
export function EditWorkout({ id }: { id: string }) {
  const original = workouts.value.find((x) => x.id === id)
  const [draft, setDraft] = useState<Workout | null>(original ? clone(original) : null)
  const [durationMin, setDurationMin] = useState(original?.end ? Math.round((original.end - original.start) / 60000) : 0)
  useEffect(() => {
    if (!original) back('/history')
  }, [])
  if (!draft || !original) return null
  const dirty = JSON.stringify(draft) !== JSON.stringify(original) || durationMin !== Math.round(((original.end || original.start) - original.start) / 60000)

  const cancel = async () => {
    if (dirty && !(await confirmDialog({ title: 'Discard changes?', confirm: 'Discard', cancel: 'Keep editing', danger: true }))) return
    back('/history/' + id)
  }
  const save = async () => {
    const exercises = draft.exercises
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
      .filter((e) => e.sets.length)
    await saveWorkout({ ...draft, exercises, end: draft.start + Math.max(1, durationMin) * 60000 })
    toast('Workout updated')
    back('/history/' + id)
  }
  const date = new Date(draft.start)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

  return (
    <div class="screen">
      <header class="page-head sub sticky">
        <button class="btn btn-text" onClick={cancel}>
          Cancel
        </button>
        <span class="page-title">Edit workout</span>
        <button class="btn btn-primary btn-sm" onClick={save} disabled={!dirty}>
          Save
        </button>
      </header>
      <label class="field">
        <span>Title</span>
        <input type="text" value={draft.name} onInput={(e) => setDraft({ ...draft, name: e.currentTarget.value })} />
      </label>
      <div class="row gap">
        <label class="field grow">
          <span>Started</span>
          <input
            type="datetime-local"
            value={local}
            onInput={(e) => {
              const t = new Date(e.currentTarget.value).getTime()
              if (Number.isFinite(t)) setDraft({ ...draft, start: t })
            }}
          />
        </label>
        <label class="field" style={{ width: '7.5rem' }}>
          <span>Minutes</span>
          <input type="text" inputMode="numeric" value={String(durationMin)} onInput={(e) => setDurationMin(Number(e.currentTarget.value.replace(/\D/g, '')) || 0)} />
        </label>
      </div>
      <label class="field">
        <span>Notes</span>
        <textarea rows={2} value={draft.notes} onInput={(e) => setDraft({ ...draft, notes: e.currentTarget.value })} />
      </label>
      <p class="field-hint">Unchecked sets are removed when you save.</p>
      <WorkoutEditor
        mode="edit"
        exercises={draft.exercises}
        workoutId={draft.id}
        before={draft.start}
        onChange={(fn) => setDraft((d) => d && { ...d, exercises: fn(d.exercises) })}
      />
    </div>
  )
}
