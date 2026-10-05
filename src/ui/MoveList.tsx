// Warm-up / cool-down editing: write freely in the text box; underneath, each line shows how it was
// read (move, dose, note) and which exercise it's linked to, so its video and timing work. Tap a
// line to link it to a different exercise, keep it as plain text, or save a video for it.
import { useState } from 'preact/hooks'
import { exMap } from '../store'
import { lineFor, linkMove, moveExercise, moveVideo, parseMove, type Move } from '../moves'
import { hasOwnVideo } from '../videos'
import { ExercisePicker } from './ExercisePicker'
import { Icon } from './icons'
import { actionSheet, AutoText, toast } from './overlay'
import { openVideoSheet } from './VideoSheet'

const open = (url: string) => window.open(url, '_blank', 'noopener')

/** One line, read: the move, its dose and note. Used in the editor and on the workout screen. */
export function MoveText({ m }: { m: Move }) {
  return (
    <span class="move-text">
      <span class="move-name">{m.name}</span>
      {m.dose && <span class="move-dose">{m.dose}</span>}
      {m.note && <span class="move-note">{m.note}</span>}
    </span>
  )
}

export function MoveListEditor({ label, lines, onChange, placeholder }: { label: string; lines: string[]; onChange: (lines: string[]) => void; placeholder: string }) {
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'link'; name: string } | null>(null)
  const filled = lines.filter((l) => l.trim())
  const tap = (m: Move) => {
    const ex = moveExercise(m)
    const video = moveVideo(m, ex)
    actionSheet({
      title: m.name,
      message: ex ? `Linked to ${ex.name}${hasOwnVideo(ex) ? ', with your video' : ''}.` : m.ramp ? 'Ramp-up sets use the first exercise.' : 'Plain text: not linked to an exercise.',
      actions: [
        ...(video ? [{ label: ex && hasOwnVideo(ex) ? 'Watch your video' : 'Watch a video', icon: 'video', onSelect: () => open(video) }] : []),
        ...(ex ? [{ label: hasOwnVideo(ex) ? 'Change its video' : 'Save a video for it', icon: 'star', onSelect: () => openVideoSheet({ exerciseId: ex.id }) }] : []),
        ...(!m.ramp && !m.combo ? [{ label: ex ? 'Link to a different exercise' : 'Link to an exercise', icon: 'link', onSelect: () => setPicker({ mode: 'link', name: m.name }) }] : []),
        ...(ex
          ? [
              {
                label: 'Keep as plain text',
                icon: 'unlink',
                onSelect: async () => {
                  await linkMove(m.name, null)
                  toast(`“${m.name}” stays plain text`)
                },
              },
            ]
          : []),
      ],
    })
  }
  return (
    <div class="field move-field">
      <span>{label}</span>
      <AutoText value={lines.join('\n')} onInput={(v) => onChange(v.split('\n').filter((x, i, a) => x.trim() || i === a.length - 1))} placeholder={placeholder} class="input-like" label={label} />
      {filled.length > 0 && (
        <ul class="move-preview" aria-label={`${label}, as read`}>
          {filled.map((l) => {
            const m = parseMove(l)
            const ex = moveExercise(m)
            return (
              <li>
                <button class="move-row" onClick={() => tap(m)}>
                  <span class={'move-link' + (ex ? ' on' : '')} aria-hidden="true">
                    <Icon name={m.ramp ? 'dumbbell' : ex ? 'link' : 'note'} size={14} />
                  </span>
                  <MoveText m={m} />
                  {(m.url || hasOwnVideo(ex)) && <Icon name="star" size={14} class="move-own" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div class="move-actions">
        <button class="btn-text small" onClick={() => setPicker({ mode: 'add' })}>
          <Icon name="plus" size={14} /> Add from library
        </button>
        <span class="field-hint">Write it however you like: “Cat–cow × 8”, “Pec stretch · 30 s / side”, a note in (brackets), a video link on the line.</span>
      </div>
      <ExercisePicker
        open={!!picker}
        single={picker?.mode === 'link'}
        title={picker?.mode === 'link' ? `Link “${picker.name}” to` : `Add to ${label.toLowerCase()}`}
        initialQuery={picker?.mode === 'link' ? picker.name : undefined}
        onClose={() => setPicker(null)}
        onPick={async (ids) => {
          const p = picker
          setPicker(null)
          if (p?.mode === 'link') {
            const ex = exMap.value.get(ids[0])
            if (!ex) return
            await linkMove(p.name, ex.id)
            toast(`“${p.name}” → ${ex.name}, in every routine`)
          } else {
            const add = ids.map((id) => exMap.value.get(id)).filter(Boolean).map((ex) => lineFor(ex!))
            onChange([...filled, ...add])
          }
        }}
      />
    </div>
  )
}
