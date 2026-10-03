import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { openGoals } from '../goals'
import { route, navigate } from '../router'
import { getToken, syncNow } from '../sync'
import { exMap, workouts } from '../store'
import { sessionsByExercise } from '../stats'
import { buildCoachContext, coachPasteText, routinesText } from '../coachContext'
import { claudeChat } from '../coachClaude'
import { applyProposal, checkCoach, coachMode, coachOn, describeProposal, ensureTz, latestWeekly, openCommitments, quick, tz, type Proposal } from '../coach'
import { Icon } from '../ui/icons'
import { confirmDialog, toast } from '../ui/overlay'
import { QuoteCard } from '../ui/Quote'
import { adjustMessage } from '../ui/Feedback'
import { fmtDay } from '../util'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  memory?: { action: string; text: string }[]
  proposals?: Proposal[]
}

const KEY = 'reps-coach'
const KEEP = 40 // messages kept on the phone; older ones are condensed into memory
const load = (): Msg[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
const persist = (m: Msg[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(m))
  } catch {
    /* storage blocked */
  }
}

const TOOL_LABEL: Record<string, string> = {
  recent_workouts: 'Looking through your workouts',
  exercise_progress: 'Checking that exercise’s history',
  body_stats: 'Checking weight, recovery and shoulder',
  list_routines: 'Looking at your routines',
  remember: 'Saving to memory',
  forget: 'Updating memory',
  set_commitment: 'Noting a commitment',
  resolve_commitment: 'Updating a commitment',
  propose_routine_targets: 'Preparing a routine change',
  propose_routine_changes: 'Reworking your routine',
  search_exercises: 'Finding alternatives',
  propose_goal: 'Preparing a goal',
  propose_training_block: 'Planning a training block',
  propose_program: 'Designing your program',
  training_knowledge: 'Checking the training science',
  search_library: 'Reading your library',
  save_to_library: 'Saving to your library',
  resolve_goal: 'Updating your goal',
  propose_profile_update: 'Preparing a profile update',
}

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

export function Coach() {
  const [msgs, setMsgs] = useState<Msg[]>(load)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

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

  const save = (m: Msg[]) => {
    setMsgs(m)
    persist(m)
  }

  /** Keep the chat short: condense the oldest messages into memory notes, then drop them. */
  const condense = async (all: Msg[]): Promise<Msg[]> => {
    if (all.length <= KEEP) return all
    const old = all.slice(0, all.length - KEEP + 10)
    try {
      await quick({ kind: 'condense', messages: old.map(({ role, content }) => ({ role, content })) })
    } catch {
      /* best effort: still trim */
    }
    return all.slice(old.length)
  }

  const ask = async (text: string, focusWorkoutId?: string) => {
    const q = text.trim()
    if (!q || busy) return
    if (!coachOn.value) return copyForClaude(q)
    const history: Msg[] = [...msgs, { role: 'user', content: q }]
    const reply: Msg = { role: 'assistant', content: '', memory: [], proposals: [] }
    const show = () => setMsgs([...history, { ...reply }])
    show()
    setInput('')
    setBusy(true)
    setStatus('')
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      if (coachMode.value === 'claude') {
        const text = await claudeChat(history.map(({ role, content }) => ({ role, content })), focusWorkoutId, {
          signal: ctrl.signal,
          onText: (t) => {
            reply.content = t
            setStatus('')
            show()
          },
          onTool: (name) => {
            setStatus(TOOL_LABEL[name] || 'Working on it')
            show()
          },
          onMemory: (m) => {
            reply.memory!.push(m)
            show()
          },
          onProposal: (p) => {
            reply.proposals!.push(p)
            show()
          },
        })
        reply.content = text || reply.content
        if (!reply.content) reply.content = reply.proposals?.length ? 'Here’s what I suggest:' : '…'
        save(await condense([...history, reply]))
        return
      }
      await syncNow() // the coach reads your profile and memory from the server
      const res = await fetch('/api/coach', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), context: buildCoachContext({ focusWorkoutId }), routines: routinesText(), tz: tz() }),
      })
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? 'Connect sync first (Settings → Sync key).' : 'The coach is unavailable right now.')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).replace(/^data: /, '')
          buf = buf.slice(i + 2)
          if (!line) continue
          const ev = JSON.parse(line) as { t?: string; error?: string; tool?: string; memory?: { action: string; text: string }; proposal?: Proposal }
          if (ev.error) throw new Error(ev.error)
          if (ev.t) {
            reply.content += ev.t
            setStatus('')
          }
          if (ev.tool) setStatus(TOOL_LABEL[ev.tool] || 'Working on it')
          if (ev.memory) reply.memory!.push(ev.memory)
          if (ev.proposal) reply.proposals!.push({ ...ev.proposal, state: 'pending' })
          show()
        }
      }
      if (!reply.content) reply.content = reply.proposals?.length ? 'Here’s what I suggest:' : '…'
      save(await condense([...history, reply]))
      void syncNow() // pull memory the coach saved
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        save([...history, { ...reply, content: reply.content ? reply.content + ' …' : '(stopped)' }])
      } else {
        setMsgs(history.slice(0, -1))
        setInput(q)
        toast((e as Error).message || 'The coach is unavailable right now.')
      }
    } finally {
      setBusy(false)
      setStatus('')
      abort.current = null
    }
  }

  const decide = async (mi: number, pid: string, approve: boolean) => {
    const m = msgs[mi]
    const p = m.proposals?.find((x) => x.id === pid)
    if (!p) return
    try {
      if (approve) toast(await applyProposal(p))
      const next = msgs.map((x, j) => (j === mi ? { ...x, proposals: x.proposals!.map((y) => (y.id === pid ? { ...y, state: approve ? ('approved' as const) : ('dismissed' as const) } : y)) } : x))
      save(next)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const copyForClaude = (q: string) =>
    navigator.clipboard
      .writeText(coachPasteText(q))
      .then(() => toast('Copied. Paste it into Gemini or Claude to get your answer.'))
      .catch(() => toast('Couldn’t copy on this device.'))

  const clear = async () => {
    if (!(await confirmDialog({ title: 'Clear this conversation?', message: 'Your coach keeps its memory. Manage that under Memory.', confirm: 'Clear', danger: true }))) return
    save([])
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
            It runs on your server with a free Gemini API key (set <code>GEMINI_API_KEY</code>, see the README). Until then, tap a question below: Reps copies it with your
            training summary, ready to paste into Gemini or Claude.
          </span>
        </section>
      )}

      <div class="chat">
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div class="bubble user">{m.content}</div>
          ) : (
            <div class="bubble coach">
              {m.content ? <Markdown text={m.content} /> : busy && i === msgs.length - 1 ? <span class="typing" aria-label="Thinking" /> : null}
              {busy && i === msgs.length - 1 && status && (
                <span class="coach-status">
                  <span class="spinner" aria-hidden="true" /> {status}…
                </span>
              )}
              {m.memory?.map((x) => (
                <span class="mem-chip">
                  <Icon name="brain" size={13} /> {x.action === 'forgot' ? 'Forgot' : x.action === 'commitment' ? 'Commitment' : x.action === 'library' ? 'Saved to library' : x.action === 'goal reached' ? 'Goal reached' : x.action === 'goal dropped' ? 'Goal dropped' : 'Remembered'}: {x.text}
                </span>
              ))}
              {m.proposals?.map((p) => {
                const d = describeProposal(p)
                const reason = (p.args as { reason?: string }).reason
                return (
                  <div class={'proposal ' + (p.state || 'pending')}>
                    <b>{d.title}</b>
                    {reason && <span class="muted small">{reason}</span>}
                    <ul>
                      {d.lines.map((l) => (
                        <li>{l}</li>
                      ))}
                    </ul>
                    {p.state === 'pending' || !p.state ? (
                      <div class="row gap">
                        <button class="btn btn-secondary btn-sm grow" onClick={() => decide(i, p.id, false)}>
                          Dismiss
                        </button>
                        <button class="btn btn-primary btn-sm grow" onClick={() => decide(i, p.id, true)}>
                          Approve
                        </button>
                      </div>
                    ) : (
                      <span class="proposal-state">
                        <Icon name={p.state === 'approved' ? 'check' : 'x'} size={14} /> {p.state === 'approved' ? 'Approved' : 'Dismissed'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {!busy && (
        <div class="chips-wrap coach-chips">
          {suggestions().map((s) => (
            <button class="chip" onClick={() => ask(s)}>
              {off && <Icon name="copy" size={13} />} {s}
            </button>
          ))}
        </div>
      )}

      <form
        class="composer"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(input)
        }}
      >
        <textarea
          id="coach-input"
          rows={1}
          value={input}
          placeholder={off ? 'Ask, then paste into Gemini' : 'Ask your coach'}
          aria-label="Message your coach"
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void ask(input)
            }
          }}
        />
        {busy ? (
          <button type="button" class="send" onClick={() => abort.current?.abort()} aria-label="Stop">
            <Icon name="x" size={20} />
          </button>
        ) : (
          <button type="submit" class="send" disabled={!input.trim()} aria-label={off ? 'Copy question and training summary' : 'Send'}>
            <Icon name={off ? 'copy' : 'up'} size={20} />
          </button>
        )}
      </form>
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

/** Just enough Markdown for coach replies: paragraphs, lists, headings, bold. No HTML is injected. */
export function Markdown({ text }: { text: string }) {
  const blocks: ComponentChildren[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const items = list.items.map((it) => <li>{inline(it)}</li>)
    blocks.push(list.ordered ? <ol>{items}</ol> : <ul>{items}</ul>)
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const ul = line.match(/^\s*[-*•]\s+(.*)/)
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/)
    if (ul || ol) {
      const ordered = !!ol
      if (!list || list.ordered !== ordered) (flush(), (list = { ordered, items: [] }))
      list.items.push((ul || ol)![1])
      continue
    }
    flush()
    if (!line.trim()) continue
    const h = line.match(/^#{1,4}\s+(.*)/)
    blocks.push(h ? <h3>{inline(h[1])}</h3> : <p>{inline(line)}</p>)
  }
  flush()
  return <>{blocks}</>
}

function inline(s: string): ComponentChildren[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part) => (part.startsWith('**') && part.endsWith('**') ? <b>{part.slice(2, -2)}</b> : part))
}
