import { useMemo, useState } from 'preact/hooks'
import { exercises, exMap, unit, remove, saveExercise } from '../store'
import { navigate, back } from '../router'
import { exerciseRecords, sessionsByExercise } from '../stats'
import { Icon } from '../ui/icons'
import { ExerciseForm, filterExercises, MuscleChips } from '../ui/ExercisePicker'
import { LineChart, type Point } from '../ui/Chart'
import { actionSheet, confirmDialog, toast } from '../ui/overlay'
import { counts, e1rm, fmtDay, fmtNum, fmtSeconds, fmtSet, fmtWeight, relDays, setVolume, toDisplay, youtubeUrl } from '../util'

export function Exercises() {
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const list = useMemo(() => filterExercises(exercises.value, query, muscle), [exercises.value, query, muscle])
  const sessions = sessionsByExercise.value

  return (
    <div class="screen">
      <header class="page-head">
        <h1>Exercises</h1>
        <button class="icon-btn" onClick={() => setCreating(true)} aria-label="New exercise">
          <Icon name="plus" />
        </button>
      </header>
      <div class="search">
        <Icon name="search" size={18} />
        <input type="search" placeholder={`Search ${exercises.value.length} exercises`} value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Search exercises" />
        {query && (
          <button class="icon-btn sm" aria-label="Clear search" onClick={() => setQuery('')}>
            <Icon name="x" size={16} />
          </button>
        )}
      </div>
      <MuscleChips value={muscle} onChange={setMuscle} />
      <div class="ex-list">
        {list.map((e) => {
          const s = sessions.get(e.id)
          return (
            <button class="ex-row" onClick={() => navigate('/exercises/' + e.id)}>
              <span class="pick-badge" aria-hidden="true">
                {e.name.slice(0, 1)}
              </span>
              <span class="pick-text">
                <span class="pick-name">{e.name}</span>
                <span class="pick-meta">
                  {e.muscle} · {e.equipment}
                  {e.custom ? ' · Custom' : ''}
                </span>
              </span>
              {s && <span class="ex-last">{relDays(s[0].workout.start)}</span>}
              <Icon name="right" size={16} class="muted" />
            </button>
          )
        })}
        {!list.length && (
          <div class="empty-state small">
            <p>No exercises match “{query}”.</p>
            <button class="btn btn-secondary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={18} /> Create it
            </button>
          </div>
        )}
      </div>
      <ExerciseForm open={creating} initialName={query} onClose={() => setCreating(false)} onSaved={(e) => (setCreating(false), navigate('/exercises/' + e.id))} />
    </div>
  )
}

type Metric = 'weight' | '1rm' | 'volume' | 'reps' | 'time'

export function ExerciseDetail({ id }: { id: string }) {
  const ex = exMap.value.get(id)
  const [editing, setEditing] = useState(false)
  const recs = useMemo(() => exerciseRecords(id), [id, sessionsByExercise.value])
  const type = ex?.type || 'weight_reps'
  const metrics: [Metric, string][] =
    type === 'duration' ? [['time', 'Longest']] : type === 'reps' ? [['reps', 'Most reps'], ['volume', 'Total reps']] : [['weight', 'Heaviest'], ['1rm', 'Est. 1RM'], ['volume', 'Volume']]
  const [metric, setMetric] = useState<Metric>(metrics[0][0])
  const u = unit.value

  if (!ex) {
    return (
      <div class="screen">
        <header class="page-head sub">
          <button class="icon-btn" onClick={() => back('/exercises')} aria-label="Back">
            <Icon name="left" />
          </button>
        </header>
        <p class="empty-note">This exercise was deleted.</p>
      </div>
    )
  }

  const m = metrics.some(([k]) => k === metric) ? metric : metrics[0][0]
  const points: Point[] = [...recs.sessions].reverse().map((s) => {
    const work = s.sets.filter(counts)
    let v = 0
    for (const set of work) {
      if (m === 'weight') v = Math.max(v, set.weight || 0)
      else if (m === '1rm') v = Math.max(v, e1rm(set.weight || 0, set.reps || 0))
      else if (m === 'volume') v += type === 'reps' ? set.reps || 0 : setVolume(set)
      else if (m === 'reps') v = Math.max(v, set.reps || 0)
      else if (m === 'time') v = Math.max(v, set.seconds || 0)
    }
    return { t: s.workout.start, v: m === 'weight' || m === '1rm' || (m === 'volume' && type !== 'reps') ? toDisplay(v, u) : v }
  }).filter((p) => p.v > 0)
  const format = (v: number) => (m === 'time' ? fmtSeconds(Math.round(v)) : m === 'reps' || (m === 'volume' && type === 'reps') ? `${fmtNum(v)} reps` : `${fmtNum(Math.round(v * 10) / 10)} ${u}`)

  const records: [string, string][] = []
  if (type === 'weight_reps') {
    if (recs.heaviest) records.push(['Heaviest weight', fmtSet(recs.heaviest, type, u)])
    if (recs.best1rm) records.push(['Best est. 1RM', fmtWeight(e1rm(recs.best1rm.weight!, recs.best1rm.reps!), u)])
    if (recs.bestVol) records.push(['Best set', fmtSet(recs.bestVol, type, u)])
    if (recs.bestSession) records.push(['Best session volume', fmtWeight(recs.bestSession, u)])
    if (!recs.heaviest && recs.mostReps) records.push(['Most reps', `${recs.mostReps.reps}`])
  } else if (type === 'reps') {
    if (recs.mostReps) records.push(['Most reps in a set', `${recs.mostReps.reps}`])
  } else if (recs.longest) records.push(['Longest set', fmtSeconds(recs.longest.seconds!)])

  const menu = () =>
    actionSheet({
      title: ex.name,
      actions: [
        { label: 'Edit exercise', icon: 'pencil', onSelect: () => setEditing(true) },
        ...(ex.custom || !recs.sessions.length
          ? [
              {
                label: 'Delete exercise',
                icon: 'trash',
                danger: true,
                onSelect: async () => {
                  if (recs.sessions.length) return toast('It’s in your history, so it can’t be deleted')
                  const ok = await confirmDialog({ title: `Delete “${ex.name}”?`, confirm: 'Delete', danger: true })
                  if (!ok) return
                  await remove('exercises', ex.id)
                  back('/exercises')
                  toast('Exercise deleted', { label: 'Undo', run: () => void saveExercise(ex) })
                },
              },
            ]
          : []),
      ],
    })

  return (
    <div class="screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => back('/exercises')} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="grow" />
        <button class="icon-btn" onClick={menu} aria-label="Exercise options">
          <Icon name="more" />
        </button>
      </header>
      <h1 class="detail-title">{ex.name}</h1>
      <p class="detail-date">
        {ex.muscle} · {ex.equipment}
        {type === 'weight_reps' && ex.equipment === 'Dumbbell' ? ' · weight per dumbbell' : ''}
      </p>
      <a class="btn btn-secondary btn-block" href={youtubeUrl(ex)} target="_blank" rel="noopener">
        <Icon name="video" size={18} /> Watch form videos
      </a>

      {recs.sessions.length > 0 ? (
        <>
          <section class="card">
            <div class="seg-row">
              {metrics.length > 1 &&
                metrics.map(([k, l]) => (
                  <button class={'chip' + (k === m ? ' on' : '')} aria-pressed={k === m} onClick={() => setMetric(k)}>
                    {l}
                  </button>
                ))}
            </div>
            <LineChart points={points} format={format} />
          </section>

          {records.length > 0 && (
            <section>
              <h2 class="section-title">Records</h2>
              <div class="records">
                {records.map(([k, v]) => (
                  <div class="record">
                    <span>{k}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 class="section-title">History</h2>
            <div class="history-list">
              {recs.sessions.map((s) => (
                <button class="history-item" onClick={() => navigate('/history/' + s.workout.id)}>
                  <div class="hi-top">
                    <b>{s.workout.name}</b>
                    <span>{fmtDay(s.workout.start)}</span>
                  </div>
                  <div class="hi-sets">
                    {s.sets.map((set) => (
                      <span class={'hi-set' + (set.kind === 'warmup' ? ' warm' : '')}>{fmtSet(set, type, u)}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div class="empty-state small">
          <Icon name="chart" size={32} />
          <p>Your records and progress for this exercise will show up here once you log it.</p>
        </div>
      )}
      <ExerciseForm open={editing} existing={ex} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
    </div>
  )
}
