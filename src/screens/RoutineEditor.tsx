import { useEffect, useMemo, useState } from 'preact/hooks'
import { routines, saveRoutine, remove } from '../store'
import { back } from '../router'
import { startRoutine } from '../workout'
import { WorkoutEditor } from '../ui/WorkoutEditor'
import { Icon } from '../ui/icons'
import { AutoText, confirmDialog, toast } from '../ui/overlay'
import type { Routine } from '../types'
import { clone, uid } from '../util'

export function RoutineEditor({ id }: { id: string }) {
  const isNew = id === 'new'
  const original = useMemo(() => routines.value.find((r) => r.id === id), [id])
  const [draft, setDraft] = useState<Routine | null>(() =>
    original
      ? clone(original)
      : isNew
        ? { id: uid('r'), name: '', folder: '', notes: '', order: Math.max(0, ...routines.value.map((r) => r.order)) + 1, exercises: [], updatedAt: 0 }
        : null,
  )
  const [error, setError] = useState('')
  useEffect(() => {
    if (!draft) back('/train')
  }, [])
  if (!draft) return null

  const folders = [...new Set(routines.value.map((r) => r.folder).filter(Boolean))]
  const dirty = isNew ? draft.name.trim() !== '' || draft.exercises.length > 0 : JSON.stringify(draft) !== JSON.stringify(original)

  const save = async (andStart = false) => {
    if (!draft.name.trim()) {
      setError('Name your routine')
      ;(document.querySelector('.routine-name-input') as HTMLInputElement | null)?.focus()
      return
    }
    const saved = await saveRoutine({ ...draft, name: draft.name.trim(), folder: draft.folder.trim() })
    if (andStart) return startRoutine(saved)
    toast(isNew ? 'Routine created' : 'Routine saved')
    back('/train')
  }

  const cancel = async () => {
    if (dirty && !(await confirmDialog({ title: 'Discard changes?', confirm: 'Discard', cancel: 'Keep editing', danger: true }))) return
    back('/train')
  }

  return (
    <div class="screen">
      <header class="page-head sub sticky">
        <button class="btn btn-text" onClick={cancel}>
          Cancel
        </button>
        <span class="page-title">{isNew ? 'New routine' : 'Edit routine'}</span>
        <button class="btn btn-primary btn-sm" onClick={() => save()} disabled={!dirty}>
          Save
        </button>
      </header>
      <label class="field">
        <span>Name</span>
        <input
          class="routine-name-input big-input"
          type="text"
          value={draft.name}
          placeholder="e.g. Upper body"
          onInput={(e) => (setDraft({ ...draft, name: e.currentTarget.value }), setError(''))}
        />
        {error && <span class="field-error">{error}</span>}
      </label>
      <label class="field">
        <span>Folder</span>
        <input type="text" value={draft.folder} placeholder="None" list="folders" onInput={(e) => setDraft({ ...draft, folder: e.currentTarget.value })} />
        <datalist id="folders">
          {folders.map((f) => (
            <option value={f} />
          ))}
        </datalist>
      </label>
      <label class="field">
        <span>Notes</span>
        <AutoText value={draft.notes} onInput={(v) => setDraft({ ...draft, notes: v })} placeholder="Warm-up, cues, anything to remember" class="input-like" />
      </label>
      <p class="field-hint">Weights and reps here are starting suggestions. Once you’ve logged a workout, your last numbers are shown instead.</p>

      <WorkoutEditor mode="routine" exercises={draft.exercises} onChange={(fn) => setDraft((d) => d && { ...d, exercises: fn(d.exercises) })} />

      {!isNew && (
        <div class="stack">
          <button class="btn btn-secondary btn-block" onClick={() => save(true)}>
            <Icon name="play" size={18} /> Save and start
          </button>
          <button
            class="btn btn-ghost-danger btn-block"
            onClick={async () => {
              if (!(await confirmDialog({ title: `Delete “${original!.name}”?`, message: 'Past workouts stay in your history.', confirm: 'Delete', danger: true }))) return
              await remove('routines', id)
              toast('Routine deleted', { label: 'Undo', run: () => void saveRoutine(original!) })
              back('/train')
            }}
          >
            Delete routine
          </button>
        </div>
      )}
    </div>
  )
}
