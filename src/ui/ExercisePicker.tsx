import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { exercises, saveExercise } from '../store'
import { sessionsByExercise } from '../stats'
import { MUSCLES, EQUIPMENT } from '../seed'
import type { Exercise, ExType } from '../types'
import { uid } from '../util'
import { Icon } from './icons'
import { Sheet } from './overlay'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function filterExercises(list: Exercise[], query: string, muscle: string | null) {
  const q = norm(query)
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return list.filter((e) => {
    if (muscle && e.muscle !== muscle) return false
    if (!q) return true
    const hay = (e.name + ' ' + e.muscle + ' ' + e.equipment).toLowerCase()
    return norm(e.name).includes(q) || words.every((w) => hay.includes(w))
  })
}

export function MuscleChips({ value, onChange }: { value: string | null; onChange: (m: string | null) => void }) {
  return (
    <div class="chips-scroll" data-goo role="group" aria-label="Filter by muscle">
      <button class={'chip' + (value == null ? ' on' : '')} onClick={() => onChange(null)} aria-pressed={value == null}>
        All
      </button>
      {MUSCLES.map((m) => (
        <button class={'chip' + (value === m ? ' on' : '')} onClick={() => onChange(value === m ? null : m)} aria-pressed={value === m}>
          {m}
        </button>
      ))}
    </div>
  )
}

export function ExercisePicker({
  open,
  onClose,
  onPick,
  single,
  title,
  initialMuscle,
  initialQuery,
}: {
  open: boolean
  onClose: () => void
  onPick: (ids: string[], superset: boolean) => void
  single?: boolean
  title?: string
  /** Pre-filter (e.g. same muscle group when replacing an exercise). */
  initialMuscle?: string
  /** Pre-filled search (e.g. a warm-up line's move name). */
  initialQuery?: string
}) {
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [limit, setLimit] = useState(80)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery(initialQuery || '')
      setMuscle(initialMuscle || null)
      setPicked([])
      setLimit(80)
    }
  }, [open])

  const results = useMemo(() => filterExercises(exercises.value, query, muscle), [exercises.value, query, muscle])
  const recent = useMemo(() => {
    if (query || muscle) return []
    const s = sessionsByExercise.value
    return exercises.value
      .filter((e) => s.has(e.id))
      .sort((a, b) => s.get(b.id)![0].workout.start - s.get(a.id)![0].workout.start)
      .slice(0, 6)
  }, [exercises.value, sessionsByExercise.value, query, muscle])
  const exact = exercises.value.some((e) => norm(e.name) === norm(query))

  const toggle = (id: string) => {
    if (single) {
      onPick([id], false)
      return
    }
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  const row = (e: Exercise) => {
    const on = picked.includes(e.id)
    return (
      <button class={'pick-row' + (on ? ' on' : '')} onClick={() => toggle(e.id)} aria-pressed={single ? undefined : on}>
        <span class="pick-badge" aria-hidden="true">
          {on ? <Icon name="check" size={16} stroke={3} /> : e.name.slice(0, 1)}
        </span>
        <span class="pick-text">
          <span class="pick-name">{e.name}</span>
          <span class="pick-meta">
            {e.muscle} · {e.equipment}
          </span>
        </span>
        {on && <span class="pick-order">{picked.indexOf(e.id) + 1}</span>}
      </button>
    )
  }

  return (
    <>
      <Sheet
        open={open && !creating}
        onClose={onClose}
        full
        title={title || (single ? 'Replace exercise' : 'Add exercises')}
        footer={
          !single && picked.length > 0 ? (
            <div class="row gap">
              {picked.length > 1 && (
                <button class="btn btn-secondary grow" onClick={() => onPick(picked, true)}>
                  <Icon name="link" size={18} /> Superset
                </button>
              )}
              <button class="btn btn-primary grow" onClick={() => onPick(picked, false)}>
                Add {picked.length} {picked.length === 1 ? 'exercise' : 'exercises'}
              </button>
            </div>
          ) : undefined
        }
      >
        <div class="search">
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search exercises"
            value={query}
            aria-label="Search exercises"
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          {query && (
            <button class="icon-btn sm" aria-label="Clear search" onClick={() => (setQuery(''), searchRef.current?.focus())}>
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
        <MuscleChips value={muscle} onChange={setMuscle} />
        {query.trim() && !exact && !results.length && (
          <button class="pick-row create" onClick={() => setCreating(true)}>
            <span class="pick-badge accent" aria-hidden="true">
              <Icon name="plus" size={16} stroke={2.5} />
            </span>
            <span class="pick-text">
              <span class="pick-name">Create “{query.trim()}”</span>
              <span class="pick-meta">New custom exercise</span>
            </span>
          </button>
        )}
        {recent.length > 0 && (
          <>
            <div class="list-label">Recent</div>
            {recent.map(row)}
            <div class="list-label">All exercises</div>
          </>
        )}
        {results.slice(0, limit).map(row)}
        {results.length > limit && (
          <button class="btn btn-quiet btn-block" onClick={() => setLimit(limit + 150)}>
            Show {Math.min(150, results.length - limit)} more of {results.length - limit}
          </button>
        )}
        {query.trim() && !exact && results.length > 0 && (
          <button class="pick-row create" onClick={() => setCreating(true)}>
            <span class="pick-badge accent" aria-hidden="true">
              <Icon name="plus" size={16} stroke={2.5} />
            </span>
            <span class="pick-text">
              <span class="pick-name">Create “{query.trim()}”</span>
              <span class="pick-meta">New custom exercise</span>
            </span>
          </button>
        )}
      </Sheet>
      <ExerciseForm
        open={open && creating}
        initialName={query.trim()}
        onClose={() => setCreating(false)}
        onSaved={(e) => {
          setCreating(false)
          setQuery('')
          if (single) onPick([e.id], false)
          else setPicked((p) => [...p, e.id])
        }}
      />
    </>
  )
}

const TYPES: [ExType, string, string][] = [
  ['weight_reps', 'Weight', 'Squats, rows'],
  ['reps', 'Reps only', 'Push-ups'],
  ['duration', 'Time', 'Planks'],
]

export function ExerciseForm({
  open,
  onClose,
  onSaved,
  initialName = '',
  existing,
}: {
  open: boolean
  onClose: () => void
  onSaved: (e: Exercise) => void
  initialName?: string
  existing?: Exercise
}) {
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState('Chest')
  const [equipment, setEquipment] = useState('Dumbbell')
  const [type, setType] = useState<ExType>('weight_reps')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(existing?.name ?? initialName)
    setMuscle(existing?.muscle ?? 'Chest')
    setEquipment(existing?.equipment ?? 'Dumbbell')
    setType(existing?.type ?? 'weight_reps')
    setError('')
  }, [open])

  const save = async () => {
    const n = name.trim()
    if (!n) return setError('Give it a name.')
    const clash = exercises.value.find((e) => e.name.toLowerCase() === n.toLowerCase() && e.id !== existing?.id)
    if (clash) return setError('You already have an exercise with that name.')
    const rec = await saveExercise({
      ...(existing || { id: uid('x-c-'), custom: true, updatedAt: 0 }),
      name: n,
      muscle,
      equipment,
      type,
    })
    onSaved(rec)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit exercise' : 'New exercise'}
      footer={
        <button class="btn btn-primary btn-block" onClick={save}>
          {existing ? 'Save changes' : 'Create exercise'}
        </button>
      }
    >
      <label class="field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          placeholder="e.g. Cossack squat"
          onInput={(e) => (setName(e.currentTarget.value), setError(''))}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        {error && <span class="field-error">{error}</span>}
      </label>
      <div class="field">
        <span>Tracks</span>
        <div class="type-grid" data-goo>
          {TYPES.map(([t, l, hint]) => (
            <button class={'type-opt' + (type === t ? ' on' : '')} aria-pressed={type === t} onClick={() => setType(t)}>
              <b>{l}</b>
              <small>{hint}</small>
            </button>
          ))}
        </div>
        {existing && existing.type !== type && <span class="field-hint">Past sets keep their numbers; only the columns shown change.</span>}
      </div>
      <div class="field">
        <span>Muscle group</span>
        <div class="chips-wrap" data-goo>
          {MUSCLES.map((m) => (
            <button class={'chip' + (muscle === m ? ' on' : '')} aria-pressed={muscle === m} onClick={() => setMuscle(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div class="field">
        <span>Equipment</span>
        <div class="chips-wrap" data-goo>
          {EQUIPMENT.map((m) => (
            <button class={'chip' + (equipment === m ? ' on' : '')} aria-pressed={equipment === m} onClick={() => setEquipment(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
