import type { ComponentChildren } from 'preact'
import { useRef, useState } from 'preact/hooks'
import { exMap, settings, unit } from '../store'
import { matchPrevious, previousSets } from '../stats'
import { navigate } from '../router'
import type { Exercise, SetKind, WExercise, WSet } from '../types'
import { clone, fmtNum, fmtRest, fromDisplay, haptic, newSet, newWExercise, supersetColor, targetTop, toDisplay, uid, youtubeUrl } from '../util'
import { Icon } from './icons'
import { NumInput } from './inputs'
import { actionSheet, AutoText, toast } from './overlay'
import { ExercisePicker } from './ExercisePicker'

export type Mode = 'live' | 'edit' | 'routine'

export const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300]

const KIND_LABEL: Record<SetKind, string> = { normal: 'Normal set', warmup: 'Warm-up set', failure: 'Failure set', drop: 'Drop set' }
const KIND_SHORT: Record<SetKind, string> = { normal: '', warmup: 'W', failure: 'F', drop: 'D' }

export function WorkoutEditor({
  mode,
  exercises,
  onChange,
  workoutId,
  before,
  onSetDone,
}: {
  mode: Mode
  exercises: WExercise[]
  /** Receives an updater so edits always apply to the latest state (undo can't clobber newer edits). */
  onChange: (update: (current: WExercise[]) => WExercise[]) => void
  workoutId?: string
  /** When editing a past workout, only sessions before this time count as "previous". */
  before?: number
  onSetDone?: (exerciseId: string) => void
}) {
  const [picker, setPicker] = useState<{ open: boolean; replace?: string }>({ open: false })
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set())

  const mut = (fn: (list: WExercise[]) => void) =>
    onChange((current) => {
      const next = clone(current)
      fn(next)
      return next
    })
  const at = (list: WExercise[], id: string) => list.findIndex((e) => e.id === id)
  const nameOf = (we: WExercise) => exMap.value.get(we.exerciseId)?.name || 'Exercise'

  const addExercises = (ids: string[], asSuperset: boolean) => {
    const group = asSuperset && ids.length > 1 ? uid('ss') : null
    mut((list) => {
      for (const id of ids) {
        const we = newWExercise(id, settings.value.defaultRest)
        we.superset = group
        const prev = previousSets(id, workoutId, before)
        const n = mode === 'routine' ? 3 : Math.min(Math.max(prev.length, 1), 6)
        we.sets = prev.length && mode !== 'routine' ? prev.slice(0, n).map((p) => newSet(p.kind)) : Array.from({ length: n }, () => newSet())
        if (mode === 'edit') for (const st of we.sets) st.done = false
        list.push(we)
      }
    })
    setPicker({ open: false })
    if (ids.length) {
      requestAnimationFrame(() => {
        const cards = document.querySelectorAll('.ex-card')
        cards[cards.length - ids.length]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const replaceExercise = (weId: string, id: string) => {
    mut((list) => {
      const we = list[at(list, weId)]
      if (!we) return
      we.exerciseId = id
      for (const s of we.sets) {
        s.tw = s.tr = s.ts = null
      }
    })
    setPicker({ open: false })
  }

  const leaveSuperset = (list: WExercise[], i: number) => {
    const g = list[i].superset
    list[i].superset = null
    const rest = list.filter((e) => g && e.superset === g)
    if (rest.length === 1) rest[0].superset = null
  }

  const exerciseMenu = (we: WExercise) => {
    const i = exercises.indexOf(we)
    const ex = exMap.value.get(we.exerciseId)
    const others = exercises.filter((e) => e.id !== we.id)
    actionSheet({
      title: ex?.name || 'Exercise',
      actions: [
        {
          label: we.notes || openNotes.has(we.id) ? 'Edit note' : 'Add note',
          icon: 'note',
          onSelect: () => {
            setOpenNotes((s) => new Set(s).add(we.id))
            requestAnimationFrame(() => (document.querySelector(`[data-note="${we.id}"] textarea`) as HTMLTextAreaElement | null)?.focus())
          },
        },
        ...(mode !== 'edit' ? [{ label: 'Rest timer', icon: 'timer', hint: fmtRest(we.rest), onSelect: () => restMenu(we) }] : []),
        we.superset
          ? {
              label: 'Remove from superset',
              icon: 'unlink',
              onSelect: () =>
                mut((list) => {
                  const k = at(list, we.id)
                  if (k >= 0) leaveSuperset(list, k)
                }),
            }
          : {
              label: 'Superset with…',
              icon: 'link',
              onSelect: () => supersetMenu(we, others),
            },
        { label: 'Replace exercise', icon: 'swap', onSelect: () => setPicker({ open: true, replace: we.id }) },
        ...(i > 0 ? [{ label: 'Move up', icon: 'up', onSelect: () => move(we.id, -1) }] : []),
        ...(i < exercises.length - 1 ? [{ label: 'Move down', icon: 'downArrow', onSelect: () => move(we.id, 1) }] : []),
        ...(ex ? [{ label: 'Watch form video', icon: 'video', onSelect: () => window.open(youtubeUrl(ex), '_blank', 'noopener') }] : []),
        ...(ex && mode !== 'routine' ? [{ label: 'Exercise history', icon: 'chart', onSelect: () => navigate('/exercises/' + ex.id) }] : []),
        {
          label: 'Remove exercise',
          icon: 'trash',
          danger: true,
          onSelect: () => {
            let removed: WExercise | null = null
            let index = 0
            mut((list) => {
              index = at(list, we.id)
              if (index < 0) return
              removed = clone(list[index])
              leaveSuperset(list, index)
              list.splice(index, 1)
            })
            toast(`Removed ${nameOf(we)}`, {
              label: 'Undo',
              run: () =>
                mut((list) => {
                  if (!removed || at(list, removed.id) >= 0) return
                  const r = removed as WExercise
                  // Only rejoin the superset if its partner is still there.
                  if (r.superset && !list.some((e) => e.superset === r.superset)) r.superset = null
                  list.splice(Math.min(index, list.length), 0, r)
                }),
            })
          },
        },
      ],
    })
  }

  const supersetMenu = (we: WExercise, others: WExercise[]) => {
    if (!others.length) return toast('Add another exercise first')
    actionSheet({
      title: 'Superset with',
      message: 'Supersets alternate between exercises, resting after the last one.',
      actions: others.map((other) => ({
        label: nameOf(other),
        onSelect: () =>
          mut((list) => {
            const i = at(list, we.id)
            const j = at(list, other.id)
            if (i < 0 || j < 0) return
            const me = list[i]
            const target = list[j]
            const group = target.superset || uid('ss')
            target.superset = group
            me.superset = group
            // Keep superset members next to each other.
            list.splice(i, 1)
            const lastIdx = list.reduce((acc, e, k) => (e.superset === group ? k : acc), -1)
            list.splice(lastIdx + 1, 0, me)
          }),
      })),
    })
  }

  const restMenu = (we: WExercise) => {
    actionSheet({
      title: 'Rest timer',
      message: nameOf(we),
      actions: REST_OPTIONS.map((r) => ({
        label: fmtRest(r),
        selected: r === we.rest,
        onSelect: () =>
          mut((list) => {
            const k = at(list, we.id)
            if (k >= 0) list[k].rest = r
          }),
      })),
    })
  }

  const move = (id: string, d: number) =>
    mut((list) => {
      const i = at(list, id)
      if (i < 0 || i + d < 0 || i + d >= list.length) return
      const [x] = list.splice(i, 1)
      list.splice(i + d, 0, x)
    })

  return (
    <div class="editor">
      {exercises.map((we) => (
        <ExerciseCard
          key={we.id}
          we={we}
          all={exercises}
          mode={mode}
          workoutId={workoutId}
          before={before}
          noteOpen={openNotes.has(we.id)}
          onMenu={() => exerciseMenu(we)}
          onRest={() => restMenu(we)}
          mut={(fn) =>
            mut((list) => {
              const k = at(list, we.id)
              if (k >= 0) fn(list[k])
            })
          }
          onSetDone={() => onSetDone?.(we.id)}
        />
      ))}
      {!exercises.length && (
        <div class="empty-card">
          <Icon name="dumbbell" size={28} />
          <p>{mode === 'routine' ? 'Add the exercises for this routine.' : 'Add your first exercise to get going.'}</p>
        </div>
      )}
      <button class="btn btn-secondary btn-block btn-lg" onClick={() => setPicker({ open: true })}>
        <Icon name="plus" /> Add exercise
      </button>
      <ExercisePicker
        open={picker.open}
        single={picker.replace != null}
        onClose={() => setPicker({ open: false })}
        onPick={(ids, ss) => (picker.replace != null ? replaceExercise(picker.replace, ids[0]) : addExercises(ids, ss))}
      />
    </div>
  )
}

function ExerciseCard({
  we,
  all,
  mode,
  workoutId,
  before,
  noteOpen,
  onMenu,
  onRest,
  mut,
  onSetDone,
}: {
  we: WExercise
  all: WExercise[]
  mode: Mode
  workoutId?: string
  before?: number
  noteOpen: boolean
  onMenu: () => void
  onRest: () => void
  mut: (fn: (we: WExercise) => void) => void
  onSetDone: () => void
}) {
  const ex: Exercise = exMap.value.get(we.exerciseId) || { id: we.exerciseId, name: 'Unknown exercise', muscle: '', equipment: '', type: 'weight_reps', updatedAt: 0 }
  const u = unit.value
  const prev = mode === 'routine' ? [] : previousSets(we.exerciseId, workoutId, before)
  const matched = matchPrevious(we.sets, prev)
  const color = supersetColor(we.superset, all)
  const cardRef = useRef<HTMLDivElement>(null)
  const group = we.superset ? all.filter((e) => e.superset === we.superset) : []
  const groupNo = we.superset ? [...new Set(all.map((e) => e.superset).filter(Boolean))].indexOf(we.superset) + 1 : 0
  const ssLabel = we.superset ? `${groupNo}${String.fromCharCode(97 + group.indexOf(we))}` : ''
  // In a superset the rest happens after the last exercise, so only that one shows its timer.
  const showRest = mode !== 'edit' && (!we.superset || group[group.length - 1] === we)
  const bodyweight = ex.equipment === 'Bodyweight'

  // Progression nudge: last time every working set reached the top of the target range.
  const top = targetTop(we.target)
  const prevWork = prev.filter((s) => s.kind !== 'warmup')
  const goHeavier =
    mode === 'live' && ex.type === 'weight_reps' && top != null && prevWork.length > 0 && prevWork.every((s) => (s.reps || 0) >= top && s.weight != null)

  let n = 0
  const labels = we.sets.map((s) => (s.kind === 'warmup' ? 'W' : String(++n)))

  const placeholder = (i: number) => placeholderFor(we.sets, i, matched)

  // Set edits look sets up by id, so they stay correct if the list changed in between.
  const mutSet = (id: string, fn: (s: WSet, w: WExercise) => void) =>
    mut((w) => {
      const t = w.sets.find((x) => x.id === id)
      if (t) fn(t, w)
    })

  const toggleDone = (i: number) => {
    const s = we.sets[i]
    if (s.done) return mutSet(s.id, (t) => void (t.done = false))
    const { set: next, missing: field } = completeSet(s, placeholder(i), ex)
    if (!next) {
      const input = cardRef.current?.querySelectorAll<HTMLInputElement>(`input[data-f="${field}"]`)[i]
      if (input) {
        input.classList.remove('nudge')
        void input.offsetWidth
        input.classList.add('nudge')
        input.focus()
      }
      haptic(30)
      return
    }
    haptic(12)
    mutSet(s.id, (t) => Object.assign(t, next))
    onSetDone()
  }

  const setMenu = (i: number) => {
    const s = we.sets[i]
    actionSheet({
      title: `Set ${labels[i]}`,
      actions: [
        ...(['warmup', 'normal', 'failure', 'drop'] as SetKind[]).map((k) => ({
          label: KIND_LABEL[k],
          hint: KIND_SHORT[k],
          selected: s.kind === k,
          onSelect: () => mutSet(s.id, (t) => void (t.kind = k)),
        })),
        { label: 'Delete set', icon: 'trash', danger: true, onSelect: () => deleteSet(i) },
      ],
    })
  }

  const deleteSet = (i: number) => {
    const removed = we.sets[i]
    let index = i
    mut((w) => {
      index = w.sets.findIndex((x) => x.id === removed.id)
      if (index >= 0) w.sets.splice(index, 1)
    })
    toast('Set deleted', {
      label: 'Undo',
      run: () =>
        mut((w) => {
          if (index < 0 || w.sets.some((x) => x.id === removed.id)) return
          w.sets.splice(Math.min(index, w.sets.length), 0, removed)
        }),
    })
  }

  const addSet = () =>
    mut((w) => {
      const last = w.sets[w.sets.length - 1]
      const s = newSet(last?.kind === 'warmup' ? 'normal' : last?.kind === 'drop' ? 'drop' : 'normal')
      if (mode === 'routine' && last) {
        s.weight = last.weight
        s.reps = last.reps
        s.seconds = last.seconds
      }
      if (mode === 'edit') s.done = true
      w.sets.push(s)
    })

  const cols = ex.type === 'weight_reps' ? 'w' : 'r'
  const valueHeader = ex.type === 'duration' ? 'SEC' : 'REPS'
  const showNote = noteOpen || !!we.notes

  return (
    <div class={'ex-card' + (color ? ' superset' : '')} style={color ? { '--ss': color } : undefined} ref={cardRef}>
      <div class="ex-head">
        <div class="ex-title">
          <h3>{ex.name}</h3>
          <div class="ex-tags">
            {color && (
              <span class="tag ss-tag">
                <Icon name="link" size={13} /> Superset {ssLabel}
              </span>
            )}
            {mode === 'routine' ? null : we.target ? (
              <span class="tag" title="Target">
                <Icon name="target" size={13} /> {we.target}
              </span>
            ) : null}
            {showRest && (
              <button class="tag tag-btn" onClick={onRest} aria-label={`Rest timer ${fmtRest(we.rest)}. Change`}>
                <Icon name="timer" size={13} /> {we.rest ? fmtRest(we.rest) : 'Rest off'}
              </button>
            )}
          </div>
        </div>
        <a class="icon-btn" href={youtubeUrl(ex)} target="_blank" rel="noopener" aria-label={`Form video for ${ex.name}`}>
          <Icon name="video" />
        </a>
        <button class="icon-btn" onClick={onMenu} aria-label={`Options for ${ex.name}`}>
          <Icon name="more" />
        </button>
      </div>

      {mode === 'routine' && (
        <label class="target-field">
          <span>Target</span>
          <input
            type="text"
            value={we.target}
            placeholder="e.g. 8–10 reps"
            aria-label={`Target for ${ex.name}`}
            onInput={(e) => {
              const v = e.currentTarget.value
              mut((w) => void (w.target = v))
            }}
          />
        </label>
      )}

      {showNote && (
        <div class="ex-note" data-note={we.id}>
          <AutoText value={we.notes} placeholder="Add a note" label={`Note for ${ex.name}`} onInput={(v) => mut((w) => void (w.notes = v))} />
        </div>
      )}

      {goHeavier && (
        <div class="nudge-card">
          <Icon name="up" size={16} /> Hit {top}+ reps on every set last time. Go a little heavier.
        </div>
      )}

      <div class={`sets cols-${cols} mode-${mode}`} role="table" aria-label={`${ex.name} sets`}>
        <div class="set-row head" role="row">
          <span role="columnheader">SET</span>
          {mode !== 'routine' && <span role="columnheader">PREVIOUS</span>}
          {ex.type === 'weight_reps' && <span role="columnheader">{u.toUpperCase()}</span>}
          <span role="columnheader">{valueHeader}</span>
          {mode !== 'routine' && (
            <span role="columnheader" class="center">
              <Icon name="check" size={16} stroke={2.5} />
            </span>
          )}
        </div>
        {we.sets.map((s, i) => {
          const ph = mode === 'routine' ? { weight: null, reps: null, seconds: null } : placeholder(i)
          const p = matched[i]
          const prevText = p ? (ex.type === 'duration' ? `${p.seconds ?? '–'}s` : ex.type === 'reps' || p.weight == null ? `${p.reps ?? '–'} reps` : `${fmtNum(toDisplay(p.weight, u))} × ${p.reps ?? '–'}`) : '—'
          return (
            <SwipeRow key={s.id} onDelete={() => deleteSet(i)} done={s.done && mode === 'live'}>
              <button class={'set-kind k-' + s.kind} onClick={() => setMenu(i)} aria-label={`Set ${labels[i]}, ${KIND_LABEL[s.kind]}. Change type or delete`}>
                {s.kind === 'normal' || s.kind === 'warmup' ? labels[i] : KIND_SHORT[s.kind]}
              </button>
              {mode !== 'routine' && (
                <button
                  class="prev"
                  disabled={!p}
                  aria-label={p ? `Previous: ${prevText}. Copy` : 'No previous set'}
                  onClick={() =>
                    p &&
                    mutSet(s.id, (t) => {
                      t.weight = p.weight
                      t.reps = p.reps
                      t.seconds = p.seconds
                    })
                  }
                >
                  {prevText}
                </button>
              )}
              {ex.type === 'weight_reps' && (
                <NumInput
                  field="weight"
                  decimal
                  label={`Set ${labels[i]} weight in ${u}`}
                  value={s.weight == null ? null : toDisplay(s.weight, u)}
                  placeholder={ph.weight != null ? fmtNum(toDisplay(ph.weight, u)) : bodyweight && mode !== 'routine' ? 'BW' : '–'}
                  onChange={(v) => mutSet(s.id, (t) => void (t.weight = v == null ? null : fromDisplay(v, u)))}
                />
              )}
              {ex.type !== 'duration' ? (
                <NumInput
                  field="reps"
                  label={`Set ${labels[i]} reps`}
                  value={s.reps}
                  placeholder={ph.reps != null ? String(ph.reps) : '–'}
                  onChange={(v) => mutSet(s.id, (t) => void (t.reps = v == null ? null : Math.round(v)))}
                />
              ) : (
                <NumInput
                  field="seconds"
                  seconds
                  label={`Set ${labels[i]} seconds`}
                  value={s.seconds}
                  placeholder={ph.seconds != null ? String(ph.seconds) : '–'}
                  onChange={(v) => mutSet(s.id, (t) => void (t.seconds = v))}
                />
              )}
              {mode !== 'routine' && (
                <button
                  class={'check' + (s.done ? ' on' : '')}
                  aria-pressed={s.done}
                  aria-label={s.done ? `Set ${labels[i]} done. Undo` : `Complete set ${labels[i]}`}
                  onClick={() => toggleDone(i)}
                >
                  <Icon name="check" size={18} stroke={3} />
                </button>
              )}
            </SwipeRow>
          )
        })}
      </div>
      <button class="add-set" onClick={addSet}>
        <Icon name="plus" size={16} stroke={2.5} /> Add set
      </button>
    </div>
  )
}

/** The grey value shown in an empty input: last session's set, else the routine's plan, else the set above. */
export function placeholderFor(sets: WSet[], i: number, matched: (WSet | undefined)[]) {
  const s = sets[i]
  const p = matched[i]
  const above = i > 0 ? sets[i - 1] : undefined
  return {
    weight: p?.weight ?? s.tw ?? above?.weight ?? above?.tw ?? null,
    reps: p?.reps ?? s.tr ?? above?.reps ?? above?.tr ?? null,
    seconds: p?.seconds ?? s.ts ?? above?.seconds ?? above?.ts ?? null,
  }
}

/** Fill a set from its grey values. Returns null if it still can't be completed (and which field is missing). */
export function completeSet(s: WSet, ph: ReturnType<typeof placeholderFor>, ex: Exercise): { set: WSet | null; missing?: 'weight' | 'reps' | 'seconds' } {
  const next: WSet = { ...s }
  if (ex.type === 'weight_reps' && next.weight == null && ph.weight != null) next.weight = ph.weight
  if (ex.type !== 'duration' && next.reps == null) next.reps = ph.reps
  if (ex.type === 'duration' && next.seconds == null) next.seconds = ph.seconds
  if (ex.type === 'weight_reps' && ex.equipment !== 'Bodyweight' && next.weight == null) return { set: null, missing: 'weight' }
  if (ex.type === 'duration' ? next.seconds == null : next.reps == null) return { set: null, missing: ex.type === 'duration' ? 'seconds' : 'reps' }
  next.done = true
  return { set: next }
}

/** A set row you can swipe left to delete. */
function SwipeRow({ children, onDelete, done }: { children: ComponentChildren; onDelete: () => void; done: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const st = useRef({ x: 0, y: 0, dx: 0, active: false, swiping: false, id: -1 })

  const reset = () => {
    const el = ref.current
    if (!el) return
    el.style.transition = 'transform .2s ease'
    el.style.transform = ''
    el.parentElement!.classList.remove('swiping')
  }

  return (
    <div class="swipe-wrap" role="row">
      <div class="swipe-bg" aria-hidden="true">
        <Icon name="trash" size={18} /> Delete
      </div>
      <div
        ref={ref}
        class={'set-row' + (done ? ' done' : '')}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          st.current = { x: e.clientX, y: e.clientY, dx: 0, active: true, swiping: false, id: e.pointerId }
        }}
        onPointerMove={(e) => {
          const s = st.current
          if (!s.active || e.pointerId !== s.id) return
          const dx = e.clientX - s.x
          const dy = e.clientY - s.y
          if (!s.swiping) {
            if (Math.abs(dy) > 10) return void (s.active = false)
            if (dx < -12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              s.swiping = true
              ref.current!.setPointerCapture(e.pointerId)
              ref.current!.parentElement!.classList.add('swiping')
            } else return
          }
          s.dx = Math.min(0, dx)
          ref.current!.style.transition = 'none'
          ref.current!.style.transform = `translateX(${s.dx}px)`
        }}
        onPointerUp={() => {
          const s = st.current
          if (s.swiping) {
            const w = ref.current!.offsetWidth
            if (s.dx < -Math.min(120, w * 0.35)) {
              ref.current!.style.transition = 'transform .18s ease'
              ref.current!.style.transform = `translateX(-${w}px)`
              setTimeout(onDelete, 160)
            } else reset()
          }
          st.current.active = false
          st.current.swiping = false
        }}
        onPointerCancel={() => {
          st.current.active = false
          if (st.current.swiping) reset()
          st.current.swiping = false
        }}
      >
        {children}
      </div>
    </div>
  )
}
