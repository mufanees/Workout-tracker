import { useEffect, useState } from 'preact/hooks'
import { back } from '../router'
import { coachItems, remove, saveCoachItem } from '../store'
import { commitments, goals, insights, notes, profile, tz } from '../coach'
import type { CoachItem } from '../types'
import { fmtDay, uid } from '../util'
import { Icon } from '../ui/icons'
import { AutoText, confirmDialog, toast } from '../ui/overlay'
import { Markdown } from './Coach'

const FIELDS: { key: 'goals' | 'injuries' | 'equipment' | 'schedule' | 'preferences'; label: string; hint: string }[] = [
  { key: 'goals', label: 'Goals', hint: 'Back to a 50 kg bench press by spring. 150 min of zone 2 a week.' },
  { key: 'injuries', label: 'Injuries and limits', hint: 'Stiff left shoulder: no overhead pressing past what feels smooth.' },
  { key: 'equipment', label: 'Equipment', hint: 'Adjustable dumbbells 2–24 kg in 2 kg steps, mat, chair. No bench.' },
  { key: 'schedule', label: 'Schedule', hint: 'Mornings before work, about 30 minutes. Every other day.' },
  { key: 'preferences', label: 'Preferences', hint: 'Short answers. Hate lunges. Motivated by numbers going up.' },
]

export function CoachMemory() {
  const p = profile.value
  const [draft, setDraft] = useState<CoachItem>(p)
  const [noteText, setNoteText] = useState('')
  const [goalText, setGoalText] = useState('')
  useEffect(() => setDraft(p), [p.updatedAt])
  const dirty = JSON.stringify(draftFields(draft)) !== JSON.stringify(draftFields(p))

  const saveProfile = async () => {
    await saveCoachItem({ ...draft, id: 'profile', kind: 'profile', tz: tz() })
    toast('Profile saved')
  }
  const addNote = async () => {
    const text = noteText.trim()
    if (!text) return
    await saveCoachItem({ id: uid('note-'), kind: 'note', text, created: Date.now(), source: 'you', updatedAt: 0 })
    setNoteText('')
  }
  const addGoal = async () => {
    const text = goalText.trim()
    if (!text) return
    await saveCoachItem({ id: uid('goal-'), kind: 'goal', text, status: 'open', created: Date.now(), source: 'you', updatedAt: 0 })
    setGoalText('')
  }
  const del = async (item: CoachItem, what: string) => {
    await remove('coach', item.id)
    toast(`${what} deleted`, { label: 'Undo', run: () => void saveCoachItem(item) })
  }
  const wipe = async () => {
    const ok = await confirmDialog({
      title: 'Forget everything?',
      message: 'Deletes all notes, goals, commitments and reviews. Your profile, library and training data stay.',
      confirm: 'Forget everything',
      danger: true,
    })
    if (!ok) return
    for (const x of coachItems.value) if (!['profile', 'source', 'snapshot', 'block'].includes(x.kind)) await remove('coach', x.id)
    toast('Memory cleared')
  }

  const openC = commitments.value.filter((c) => (c.status || 'open') === 'open')
  const closedC = commitments.value.filter((c) => c.status && c.status !== 'open').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

  return (
    <div class="screen">
      <header class="page-head sub">
        <button class="icon-btn" onClick={() => back('/coach')} aria-label="Back">
          <Icon name="left" />
        </button>
        <span class="page-title">Coach memory</span>
        <span class="icon-btn" aria-hidden="true" />
      </header>
      <p class="field-hint">Everything here goes to your coach with each question. Edit or delete anything.</p>

      <h2 class="section-title">About you</h2>
      <section class="card stack-card">
        {FIELDS.map((f) => (
          <label class="field">
            <span>{f.label}</span>
            <AutoText value={(draft[f.key] as string) || ''} onInput={(v) => setDraft({ ...draft, [f.key]: v })} placeholder={f.hint} class="input-like" />
          </label>
        ))}
        <div class="row gap">
          <label class="field grow">
            <span>Age</span>
            <input id="p-age" type="text" inputMode="numeric" value={draft.age ?? ''} onInput={(e) => setDraft({ ...draft, age: Number(e.currentTarget.value.replace(/\D/g, '')) || null })} />
          </label>
          <label class="field grow">
            <span>Max heart rate</span>
            <input id="p-maxhr" type="text" inputMode="numeric" value={draft.maxHr ?? ''} onInput={(e) => setDraft({ ...draft, maxHr: Number(e.currentTarget.value.replace(/\D/g, '')) || null })} />
          </label>
        </div>
        <button class="btn btn-primary btn-block" disabled={!dirty} onClick={saveProfile}>
          Save profile
        </button>
      </section>

      <h2 class="section-title">Goals</h2>
      <section class="card mem-list">
        {goals.value.map((g) => (
          <div class={'mem-row' + (g.status === 'done' ? ' done' : '')}>
            <button
              class={'cl-box' + (g.status === 'done' ? ' on' : '')}
              aria-pressed={g.status === 'done'}
              aria-label={g.status === 'done' ? 'Mark not achieved' : 'Mark achieved'}
              onClick={() => saveCoachItem({ ...g, status: g.status === 'done' ? 'open' : 'done' })}
            >
              {g.status === 'done' && <Icon name="check" size={14} stroke={3} />}
            </button>
            <span class="mem-text">
              {g.text}
              {g.due ? <small> · by {fmtDay(g.due)}</small> : null}
            </span>
            <button class="icon-btn sm" aria-label="Delete goal" onClick={() => del(g, 'Goal')}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        <div class="mem-add">
          <input id="goal-new" type="text" class="plain-input" value={goalText} placeholder="Add a goal" onInput={(e) => setGoalText(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && addGoal()} />
          <button class="btn btn-secondary btn-sm" disabled={!goalText.trim()} onClick={addGoal}>
            Add
          </button>
        </div>
      </section>

      <h2 class="section-title">Commitments</h2>
      <section class="card mem-list">
        {!commitments.value.length && <p class="muted small">When you and your coach agree on something specific, it’s tracked here and checked next time.</p>}
        {openC.map((c) => (
          <div class="mem-row">
            <span class={'pill-state' + (c.due && c.due < Date.now() ? ' due' : '')}>{c.due && c.due < Date.now() ? 'Due' : 'Open'}</span>
            <span class="mem-text">
              {c.text}
              {c.due ? <small> · {fmtDay(c.due)}</small> : null}
            </span>
            <button class="icon-btn sm" aria-label="Mark done" onClick={() => saveCoachItem({ ...c, status: 'done', outcome: c.outcome || 'Marked done by you' })}>
              <Icon name="check" size={16} />
            </button>
            <button class="icon-btn sm" aria-label="Delete commitment" onClick={() => del(c, 'Commitment')}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        {closedC.slice(0, 8).map((c) => (
          <div class="mem-row closed">
            <span class={'pill-state ' + c.status}>{c.status === 'done' ? 'Done' : c.status === 'missed' ? 'Missed' : 'Dropped'}</span>
            <span class="mem-text">
              {c.text}
              {c.outcome ? <small> · {c.outcome}</small> : null}
            </span>
            <button class="icon-btn sm" aria-label="Delete commitment" onClick={() => del(c, 'Commitment')}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
      </section>

      <h2 class="section-title">Notes</h2>
      <section class="card mem-list">
        {!notes.value.length && <p class="muted small">Your coach saves lasting facts here, like how your shoulder responds to a movement. You can add your own.</p>}
        {notes.value.map((n) => (
          <div class="mem-row">
            <span class="mem-text">
              {n.text}
              <small>
                {' '}
                · {n.source === 'you' ? 'you' : 'coach'}, {fmtDay(n.created || n.updatedAt)}
              </small>
            </span>
            <button class="icon-btn sm" aria-label="Delete note" onClick={() => del(n, 'Note')}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        <div class="mem-add">
          <input id="note-new" type="text" class="plain-input" value={noteText} placeholder="Tell your coach something to remember" onInput={(e) => setNoteText(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
          <button class="btn btn-secondary btn-sm" disabled={!noteText.trim()} onClick={addNote}>
            Add
          </button>
        </div>
      </section>

      <h2 class="section-title" id="library">Library</h2>
      <Library />

      {insights.value.length > 0 && (
        <>
          <h2 class="section-title">Reviews</h2>
          <section class="card mem-list">
            {insights.value.slice(0, 12).map((x) => (
              <details class="review">
                <summary>
                  {x.type === 'weekly' ? 'Week in review' : 'Workout takeaway'} · {fmtDay(x.created || x.updatedAt)}
                </summary>
                <Markdown text={x.text || ''} />
              </details>
            ))}
          </section>
        </>
      )}

      <button class="btn btn-ghost-danger btn-block" onClick={wipe}>
        Forget everything
      </button>
    </div>
  )
}

function draftFields(p: CoachItem) {
  return [p.goals || '', p.injuries || '', p.equipment || '', p.schedule || '', p.preferences || '', p.age ?? null, p.maxHr ?? null]
}

/** Your own material for the coach: video transcripts, programs, articles, notes. */
function Library() {
  const items = coachItems.value.filter((x) => x.kind === 'source').sort((a, b) => (b.created || 0) - (a.created || 0))
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const add = async () => {
    if (!title.trim() || !text.trim()) return
    await saveCoachItem({ id: uid('src-'), kind: 'source', text: title.trim().slice(0, 120), body: text.trim().slice(0, 60000), created: Date.now(), source: 'you', updatedAt: 0 })
    setTitle('')
    setText('')
    setAdding(false)
    toast('Added to your library')
  }
  const del = async (item: CoachItem) => {
    if (!(await confirmDialog({ title: 'Remove from library?', message: item.text, confirm: 'Remove', danger: true }))) return
    await remove('coach', item.id)
    toast('Removed', { label: 'Undo', run: () => void saveCoachItem(item) })
  }
  return (
    <section class="card mem-list">
      <p class="muted small">Videos, programs, articles and notes you want your coach to learn from. It searches them when planning and answering. You can also paste something in chat and say “save this to my library”.</p>
      {items.map((x) => (
        <details class="review lib-item">
          <summary>
            <span>
              <b>{x.text}</b>
              <small>
                {' '}
                · {wordCount(x.body || '')} · {fmtDay(x.created || x.updatedAt)}
              </small>
            </span>
          </summary>
          <p class="lib-body">{(x.body || '').slice(0, 1500)}{(x.body || '').length > 1500 ? '…' : ''}</p>
          <button class="btn btn-ghost-danger btn-sm" onClick={() => void del(x)}>
            Remove
          </button>
        </details>
      ))}
      {adding ? (
        <div class="lib-add">
          <input type="text" class="plain-input" value={title} placeholder="Title, e.g. Nippard minimalist video" onInput={(e) => setTitle(e.currentTarget.value)} />
          <AutoText value={text} onInput={setText} placeholder="Paste the transcript, program or notes" class="input-like" label="Material" />
          <div class="row gap">
            <button class="btn btn-secondary grow" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button class="btn btn-primary grow" disabled={!title.trim() || !text.trim()} onClick={add}>
              Add to library
            </button>
          </div>
        </div>
      ) : (
        <button class="btn btn-secondary btn-block" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add material
        </button>
      )}
    </section>
  )
}

const wordCount = (t: string) => {
  const n = (t.match(/\S+/g) || []).length
  return n < 1000 ? `${n} words` : `${Math.round(n / 100) / 10}k words`
}
