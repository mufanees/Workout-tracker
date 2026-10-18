import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { openGoals } from '../goals'
import { GooDots } from '../ui/Goo'
import { route, navigate } from '../router'
import { active, exMap, workouts } from '../store'
import { sessionsByExercise } from '../stats'
import { checkCoach, coachOn, describeProposal, ensureTz, latestWeekly, openCommitments, type Proposal, type ProposalDay } from '../coach'
import { ask, chat, chatBusy, chatInput, chatStatus, clearChat, decide, stopChat } from '../coachChat'
import { Icon } from '../ui/icons'
import { confirmDialog } from '../ui/overlay'
import { QuoteCard } from '../ui/Quote'
import { adjustMessage } from '../ui/Feedback'
import { fmtDay } from '../util'

function suggestions(): string[] {
  let top: string | null = null
  let n = 0
  for (const [id, s] of sessionsByExercise.value) {
    const recent = s.filter((x) => x.workout.start > Date.now() - 42 * 86400000).length
    if (recent > n && exMap.value.get(id)?.type === 'weight_reps') (n = recent), (top = id)
  }
  const name = top ? exMap.value.get(top)?.name : null
  const g = openGoals.value[0]
  return [
    g ? `How am I tracking on “${(g.item.text || g.title).slice(0, 60)}”?` : 'Help me set a goal',
    'Review my last week',
    'What should I change in my next workout?',
    'Am I recovering well?',
    ...(name ? [`How is my ${name.toLowerCase()} progressing?`] : []),
    'Set me a goal for the next 4 weeks',
    'I don’t feel like training today',
  ]
}

/** The conversation from message `from` on: replies, memory chips and proposals with Approve. */
export function ChatThread({ from }: { from: number }) {
  const msgs = chat.value
  const busy = chatBusy.value
  const status = chatStatus.value
  return (
    <div class="chat">
      {msgs.map((m, i) =>
        i < from ? null : m.role === 'user' ? (
          <div class="bubble user">{m.content}</div>
        ) : (
          <div class="bubble coach">
            {m.content ? <Markdown text={m.content} /> : busy && i === msgs.length - 1 ? <GooDots /> : null}
            {busy && i === msgs.length - 1 && status && (
              <span class="coach-status">
                <span class="spinner" aria-hidden="true" /> {status}…
              </span>
            )}
            {m.memory?.map((x) => (
              <span class="mem-chip">
                <Icon name="brain" size={13} /> {x.action === 'forgot' ? 'Forgot' : x.action === 'commitment' ? 'Commitment' : x.action === 'library' ? 'Saved to library' : x.action === 'goal reached' ? 'Goal reached' : x.action === 'goal dropped' ? 'Goal dropped' : x.action === 'video' ? 'Video saved' : 'Remembered'}: {x.text}
              </span>
            ))}
            {m.proposals?.map((p) => (
              <ProposalCard p={p} onDecide={(ok) => decide(i, p.id, ok)} />
            ))}
          </div>
        ),
      )}
    </div>
  )
}

function ProposalCard({ p, onDecide }: { p: Proposal; onDecide: (approve: boolean) => void }) {
  const d = describeProposal(p)
  const reason = (p.args as { reason?: string }).reason
  const live = p.tool === 'adjust_workout'
  return (
    <div class={'proposal ' + (p.state || 'pending') + (d.days ? ' rich' : '')}>
      <b class="proposal-title">{d.title}</b>
      {d.chips && d.chips.length > 0 && (
        <div class="proposal-chips">
          {d.chips.map((c) => (
            <span>{c}</span>
          ))}
        </div>
      )}
      {reason && <span class="muted small">{reason}</span>}
      {d.days ? (
        <>
          {d.summary && <p class="proposal-summary">{d.summary}</p>}
          {d.days.map((day, di) => (
            <ProposalDayCard day={day} open={di === 0} />
          ))}
        </>
      ) : (
        <ul class="proposal-lines">
          {d.lines.map((l) => (
            <li>{l}</li>
          ))}
        </ul>
      )}
      {p.state === 'pending' || !p.state ? (
        live && !active.value ? (
          <span class="proposal-state">That workout is over</span>
        ) : (
          <div class="row gap">
            <button class="btn btn-secondary btn-sm grow" onClick={() => onDecide(false)}>
              Dismiss
            </button>
            <button class="btn btn-primary btn-sm grow" onClick={() => onDecide(true)}>
              {live ? 'Apply' : 'Approve'}
            </button>
          </div>
        )
      ) : (
        <span class="proposal-state">
          <Icon name={p.state === 'approved' ? 'check' : 'x'} size={14} /> {p.state === 'approved' ? (live ? 'Applied' : 'Approved') : 'Dismissed'}
        </span>
      )}
    </div>
  )
}

/** Message box with send (or stop while the coach is answering). */
export function Composer({ placeholder, focusWorkoutId }: { placeholder: string; focusWorkoutId?: string }) {
  const busy = chatBusy.value
  const off = coachOn.value === false
  const input = chatInput.value
  const send = () => void ask(input, focusWorkoutId)
  return (
    <form
      class="composer"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <textarea
        id="coach-input"
        rows={1}
        value={input}
        placeholder={placeholder}
        aria-label="Message your coach"
        onInput={(e) => (chatInput.value = e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
      />
      {busy ? (
        <button type="button" class="send" onClick={stopChat} aria-label="Stop">
          <Icon name="x" size={20} />
        </button>
      ) : (
        <button type="submit" class="send" disabled={!input.trim()} aria-label={off ? 'Copy question and training summary' : 'Send'}>
          <Icon name={off ? 'copy' : 'up'} size={20} />
        </button>
      )}
    </form>
  )
}

export function Coach() {
  const msgs = chat.value
  const busy = chatBusy.value
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (coachOn.value == null) void checkCoach()
  }, [])
  useEffect(() => {
    if (coachOn.value) void ensureTz()
  }, [coachOn.value])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length, busy])

  // Deep links: /coach?review=<workoutId>, /coach?adjust=<workoutId> (from a finished workout), /coach?ask=<question> (goals)
  useEffect(() => {
    const id = route.value.query.get('review')
    const adj = route.value.query.get('adjust')
    const q = route.value.query.get('ask')
    if (!coachOn.value || (!id && !adj && !q)) return
    navigate('/coach', { replace: true })
    if (q) void ask(q)
    else if (adj) {
      const w = workouts.value.find((x) => x.id === adj)
      if (w) void ask(adjustMessage(w), adj)
    } else void ask('Review this workout: what went well, what to adjust next time, and one thing to focus on.', id!)
  }, [coachOn.value])

  const clear = async () => {
    if (!(await confirmDialog({ title: 'Clear this conversation?', message: 'Your coach keeps its memory. Manage that under Memory.', confirm: 'Clear', danger: true }))) return
    clearChat()
  }

  const off = coachOn.value === false
  const weekly = latestWeekly.value
  const showWeekly = weekly && Date.now() - (weekly.created || 0) < 8 * 86400000
  const open = openCommitments.value
  return (
    <div class="screen coach-screen">
      <header class="page-head">
        <h1>Coach</h1>
        <button class="btn btn-text" onClick={() => navigate('/coach/memory')}>
          <Icon name="brain" size={18} /> Memory
        </button>
        {msgs.length > 0 && (
          <button class="icon-btn" onClick={clear} aria-label="Clear conversation">
            <Icon name="trash" />
          </button>
        )}
      </header>

      {showWeekly && <WeeklyCard text={weekly!.text || ''} date={weekly!.created || 0} />}

      {open.length > 0 && (
        <section class="commit-strip" aria-label="Open commitments">
          <span class="eyebrow">
            <Icon name="target" size={14} /> Working on
          </span>
          {open.slice(0, 3).map((c) => (
            <span class={'commit' + (c.due && c.due < Date.now() ? ' due' : '')}>
              {c.text}
              {c.due ? <small> · {fmtDay(c.due)}</small> : null}
            </span>
          ))}
        </section>
      )}

      {!msgs.length && (
        <section class="coach-intro">
          <p>
            Ask about your training. Your coach sees your workouts, progress, heart rate zones, recovery, shoulder ratings, weight and fasts, remembers what you tell it, and
            can suggest changes for you to approve.
          </p>
          {workouts.value.length === 0 && <p class="muted">Log a few workouts first so there’s something to work with.</p>}
          <QuoteCard compact seed={7} />
        </section>
      )}

      {off && (
        <section class="coach-off">
          <b>The in-app coach isn’t set up here</b>
          <span>
            It runs on your server with a free Gemini API key (set <code>GEMINI_API_KEY</code>, see the README). Until then, tap a question below: Gloop copies it with your
            training summary, ready to paste into Gemini or Claude.
          </span>
        </section>
      )}

      <ChatThread from={0} />
      <div ref={endRef} />

      {!busy && (
        <div class="chips-wrap coach-chips">
          {suggestions().map((s) => (
            <button class="chip" onClick={() => ask(s)}>
              {off && <Icon name="copy" size={13} />} {s}
            </button>
          ))}
        </div>
      )}

      <Composer placeholder={off ? 'Ask, then paste into Gemini' : 'Ask your coach'} />
    </div>
  )
}

function WeeklyCard({ text, date }: { text: string; date: number }) {
  const [open, setOpen] = useState(Date.now() - date < 2 * 86400000)
  return (
    <section class="weekly-card">
      <button class="weekly-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span class="eyebrow">
          <Icon name="calendar" size={14} /> Week in review · {fmtDay(date)}
        </span>
        <Icon name="down" size={18} class={'chev' + (open ? ' open' : '')} />
      </button>
      {open && (
        <div class="weekly-body">
          <Markdown text={text} />
        </div>
      )}
    </section>
  )
}

/**
 * Just enough Markdown for coach replies, laid out to scan: the opening answer, then each
 * heading as its own section, "**Label:** detail" items as labelled rows, numbers as pills.
 * No HTML is injected.
 */
export function Markdown({ text }: { text: string }) {
  type Block = { kind: 'p'; text: string } | { kind: 'quote'; text: string } | { kind: 'list'; ordered: boolean; items: string[] }
  const sections: { title: string | null; blocks: Block[] }[] = [{ title: null, blocks: [] }]
  const cur = () => sections[sections.length - 1].blocks
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const ul = line.match(/^\s*[-*•]\s+(.*)/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/)
    if (ul || ol) {
      const ordered = !!ol
      const last = cur()[cur().length - 1]
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push((ul || ol)![1])
      else cur().push({ kind: 'list', ordered, items: [(ul || ol)![1]] })
      continue
    }
    if (!line.trim()) continue
    // "### Days", or a line that is only "**Days:**" / "Days:", starts a section.
    const h = line.match(/^#{1,4}\s+(.*)/) || line.match(/^\*\*([^*]{1,40}?):?\*\*:?$/) || line.match(/^([A-Z][^.!?*]{0,30}):$/)
    if (h) {
      sections.push({ title: h[1].replace(/\*\*/g, '').replace(/:$/, ''), blocks: [] })
      continue
    }
    const q = line.match(/^>\s?(.*)/)
    cur().push(q ? { kind: 'quote', text: q[1] } : { kind: 'p', text: line })
  }
  const kv = (it: string) => it.match(/^\*\*(.+?):?\*\*:?\s*(.*)$/)
  const render = (bl: Block, lead: boolean) => {
    if (bl.kind === 'p') return <p class={lead ? 'md-lead' : undefined}>{inline(bl.text)}</p>
    if (bl.kind === 'quote') return <p class="md-callout">{inline(bl.text)}</p>
    if (bl.items.every((it) => kv(it))) {
      const rows = bl.items.map((it) => {
        const m = kv(it)!
        return (
          <li class="md-row">
            <span class="md-key">{m[1]}</span>
            {m[2] && <span class="md-val">{inline(m[2])}</span>}
          </li>
        )
      })
      return bl.ordered ? <ol class="md-rows">{rows}</ol> : <ul class="md-rows">{rows}</ul>
    }
    const items = bl.items.map((it) => <li>{inline(it)}</li>)
    return bl.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
  }
  const structured = sections.length > 1
  return (
    <>
      {sections.map((sec, si) =>
        sec.title == null ? (
          sec.blocks.map((bl, bi) => render(bl, structured && si === 0 && bi === 0))
        ) : (
          <section class="md-sec">
            <h3 class="md-h">{sec.title}</h3>
            {sec.blocks.map((bl) => render(bl, false))}
          </section>
        ),
      )}
    </>
  )
}

function inline(s: string): ComponentChildren[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part) => {
    if (!(part.startsWith('**') && part.endsWith('**') && part.length > 4)) return part
    const t = part.slice(2, -2)
    // Short numbers ("12 kg", "2 × 12", "~30 min") read best as pills.
    return /^[~≈+]?\d[\d.,:]*(\s?[×x–-]\s?\d+)?\s?(kg|lb|min|s|sec|reps?|sets?|bpm|%|km|days?)?$/i.test(t) ? <b class="md-num">{t}</b> : <b>{t}</b>
  })
}

/** One day of a proposed program: a collapsible card, exercises grouped by superset. */
function ProposalDayCard({ day, open }: { day: ProposalDay; open: boolean }) {
  const moves = day.groups.reduce((n, g) => n + g.moves.length, 0)
  const supersets = day.groups.filter((g) => g.label).length
  return (
    <details class="pday" open={open}>
      <summary>
        <span class="pday-name">{day.name}</span>
        <span class="pday-meta">
          {moves} moves{supersets ? ` · ${supersets} supersets` : ''}
        </span>
        <Icon name="down" size={16} />
      </summary>
      {day.groups.map((g) => (
        <div class="pday-group">
          {g.label && <span class="pday-label">{g.label}</span>}
          {g.moves.map((m) => (
            <div class={'pmove' + (m.optional ? ' optional' : '')}>
              <div class="pmove-top">
                <span class="pmove-name">{m.name}</span>
                <span class="pmove-dose">{m.dose}</span>
              </div>
              {(m.load || m.optional || m.note) && (
                <div class="pmove-sub">
                  {m.load && <span class="pmove-load">{m.load}</span>}
                  {m.optional && <span class="pmove-tag">{m.optional}</span>}
                  {m.note && <span class="pmove-note">{m.note}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </details>
  )
}
