import { useEffect, useState } from 'preact/hooks'
import { exMap, routines, saveWorkout } from '../store'
import { navigate } from '../router'
import type { Feedback, Workout } from '../types'
import { phaseMinutes } from '../util'
import { Icon } from './icons'
import { AutoText, toast } from './overlay'

type Opt<T extends string> = [T, string][]

function Choice<T extends string>({ value, options, onChange, label }: { value?: T; options: Opt<T>; onChange: (v: T | undefined) => void; label: string }) {
  return (
    <div class="fb-choice" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button role="radio" aria-checked={value === v} class={'fb-opt' + (value === v ? ' on ' + v : '')} onClick={() => onChange(value === v ? undefined : v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

const LENGTH: Opt<'short' | 'right' | 'long'> = [
  ['short', 'Too short'],
  ['right', 'About right'],
  ['long', 'Too long'],
]
const PHASE: Opt<'right' | 'long'> = [
  ['right', 'Fine'],
  ['long', 'Too long'],
]
const FEEL: Opt<'easy' | 'right' | 'hard' | 'pain'> = [
  ['easy', 'Easy'],
  ['right', 'Right'],
  ['hard', 'Hard'],
  ['pain', 'Hurt'],
]

/** "How did it go?" after a workout: length, warm-up/cool-down, each exercise, a note. Goes to the coach. */
export function FeedbackCard({ w, open: startOpen }: { w: Workout; open?: boolean }) {
  const [fb, setFb] = useState<Feedback>(w.feedback || {})
  const [open, setOpen] = useState(!!startOpen || !w.feedback)
  useEffect(() => setFb(w.feedback || {}), [w.id])
  const total = w.end ? Math.max(1, Math.round((w.end - w.start) / 60000)) : null
  const ph = phaseMinutes(w)
  const routine = routines.value.find((r) => r.id === w.routineId)
  const hasWarm = !!(w.warmup?.length || routine?.warmup?.length)
  const hasCool = !!(w.cooldown?.length || routine?.cooldown?.length)
  const touched = !!(fb.length || fb.warmup || fb.cooldown || fb.note?.trim() || Object.values(fb.ex || {}).some(Boolean))

  const save = async () => {
    const clean: Feedback = { ...fb, note: fb.note?.trim() || undefined, at: Date.now() }
    await saveWorkout({ ...w, feedback: clean })
    return clean
  }
  const sendToCoach = async () => {
    await save()
    navigate(`/coach?adjust=${w.id}`)
  }

  if (!open)
    return (
      <button class="card fb-collapsed" onClick={() => setOpen(true)}>
        <Icon name="coach" size={18} />
        <span>{w.feedback ? 'Your feedback is saved. Edit it' : 'How did it go? Tell your coach'}</span>
        <Icon name="right" size={16} />
      </button>
    )

  return (
    <section class="card fb-card">
      <div class="fb-head">
        <span class="eyebrow">How did it go?</span>
        {total != null && (
          <span class="muted small">
            {total} min{ph.warmup != null ? ` · warm-up ${ph.warmup}` : ''}
            {ph.cooldown != null ? ` · cool-down ${ph.cooldown}` : ''}
          </span>
        )}
      </div>

      <div class="fb-row">
        <span class="fb-label">Session length</span>
        <Choice label="Session length" value={fb.length} options={LENGTH} onChange={(v) => setFb({ ...fb, length: v })} />
      </div>
      {hasWarm && (
        <div class="fb-row">
          <span class="fb-label">Warm-up{ph.warmup != null ? <small> {ph.warmup} min</small> : null}</span>
          <Choice label="Warm-up" value={fb.warmup} options={PHASE} onChange={(v) => setFb({ ...fb, warmup: v })} />
        </div>
      )}
      {w.exercises.map((we) => (
        <div class="fb-row">
          <span class="fb-label">{exMap.value.get(we.exerciseId)?.name || 'Exercise'}</span>
          <Choice label={exMap.value.get(we.exerciseId)?.name || 'Exercise'} value={fb.ex?.[we.id]} options={FEEL} onChange={(v) => setFb({ ...fb, ex: { ...(fb.ex || {}), [we.id]: v as NonNullable<Feedback['ex']>[string] } })} />
        </div>
      ))}
      {hasCool && (
        <div class="fb-row">
          <span class="fb-label">Cool-down{ph.cooldown != null ? <small> {ph.cooldown} min</small> : null}</span>
          <Choice label="Cool-down" value={fb.cooldown} options={PHASE} onChange={(v) => setFb({ ...fb, cooldown: v })} />
        </div>
      )}
      <AutoText value={fb.note || ''} onInput={(v) => setFb({ ...fb, note: v })} placeholder="Anything else? What felt off, what you'd rather do, how much time you have…" class="input-like" label="Note for your coach" />
      <div class="row gap">
        <button
          class="btn btn-secondary grow"
          disabled={!touched}
          onClick={async () => {
            await save()
            setOpen(false)
            toast('Feedback saved. Your coach will see it.')
          }}
        >
          Save
        </button>
        <button class="btn btn-primary grow" disabled={!touched} onClick={sendToCoach}>
          <Icon name="coach" size={18} /> Ask coach to adjust
        </button>
      </div>
    </section>
  )
}

/** The message the coach gets when you tap "Ask coach to adjust". */
export function adjustMessage(w: Workout): string {
  const routine = routines.value.find((r) => r.id === w.routineId)
  return `Here's my feedback on today's "${w.name}". Rework ${routine ? `"${routine.name}"` : 'the routine'} to fit my time, swap anything that hurt or felt too hard, and remember what matters.`
}
