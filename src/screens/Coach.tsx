import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { route, navigate } from '../router'
import { getToken } from '../sync'
import { exMap, workouts } from '../store'
import { sessionsByExercise } from '../stats'
import { buildCoachContext, coachPasteText } from '../coachContext'
import { Icon } from '../ui/icons'
import { confirmDialog, toast } from '../ui/overlay'
import { QuoteCard } from '../ui/Quote'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const KEY = 'reps-coach'
const load = (): Msg[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
const persist = (m: Msg[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(m.slice(-40)))
  } catch {
    /* storage blocked */
  }
}

/** null = still checking; false = no coach on this server (or no server). */
const enabled = signal<boolean | null>(null)
async function checkCoach() {
  try {
    const res = await fetch('/api/coach/status', { headers: { authorization: `Bearer ${getToken()}` } })
    enabled.value = res.ok && (res.headers.get('content-type') || '').includes('json') ? !!(await res.json()).enabled : false
  } catch {
    enabled.value = false
  }
}

function suggestions(): string[] {
  // Most-trained exercise lately makes a natural progress question.
  let top: string | null = null
  let n = 0
  for (const [id, s] of sessionsByExercise.value) {
    const recent = s.filter((x) => x.workout.start > Date.now() - 42 * 86400000).length
    if (recent > n && exMap.value.get(id)?.type === 'weight_reps') (n = recent), (top = id)
  }
  const name = top ? exMap.value.get(top)?.name : null
  return [
    'Review my last week',
    'What should I change in my next workout?',
    'Am I recovering well?',
    ...(name ? [`How is my ${name.toLowerCase()} progressing?`] : []),
    'I don’t feel like training today',
  ]
}

export function Coach() {
  const [msgs, setMsgs] = useState<Msg[]>(load)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (enabled.value == null) void checkCoach()
  }, [])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs.length, busy])

  // Deep link from a finished workout: /coach?review=<workoutId>
  useEffect(() => {
    const id = route.value.query.get('review')
    if (id && enabled.value) {
      navigate('/coach', { replace: true })
      void ask('Review this workout: what went well, what to adjust next time, and one thing to focus on.', id)
    }
  }, [enabled.value])

  const ask = async (text: string, focusWorkoutId?: string) => {
    const q = text.trim()
    if (!q || busy) return
    if (!enabled.value) return copyForClaude(q)
    const history: Msg[] = [...msgs, { role: 'user', content: q }]
    setMsgs([...history, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)
    let answer = ''
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ messages: history, context: buildCoachContext({ focusWorkoutId }) }),
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
          const ev = JSON.parse(line) as { t?: string; error?: string }
          if (ev.error) throw new Error(ev.error)
          if (ev.t) {
            answer += ev.t
            setMsgs([...history, { role: 'assistant', content: answer }])
          }
        }
      }
      const done = [...history, { role: 'assistant' as const, content: answer || '…' }]
      setMsgs(done)
      persist(done)
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        const kept = [...history, { role: 'assistant' as const, content: answer ? answer + ' …' : '(stopped)' }]
        setMsgs(kept)
        persist(kept)
      } else {
        setMsgs(history.slice(0, -1))
        setInput(q)
        toast((e as Error).message || 'The coach is unavailable right now.')
      }
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  const copyForClaude = (q: string) =>
    navigator.clipboard
      .writeText(coachPasteText(q))
      .then(() => toast('Copied. Paste it into Claude to get your answer.'))
      .catch(() => toast('Couldn’t copy on this device.'))

  const clear = async () => {
    if (!(await confirmDialog({ title: 'Clear this conversation?', confirm: 'Clear', danger: true }))) return
    setMsgs([])
    persist([])
  }

  const off = enabled.value === false
  return (
    <div class="screen coach-screen">
      <header class="page-head">
        <h1>Coach</h1>
        {msgs.length > 0 && (
          <button class="icon-btn" onClick={clear} aria-label="Clear conversation">
            <Icon name="trash" />
          </button>
        )}
      </header>

      {!msgs.length && (
        <section class="coach-intro">
          <p>
            Ask about your training. Your coach sees your workouts, progress, heart rate zones, morning readings, shoulder ratings, weight and fasts, and answers like a
            trainer would.
          </p>
          {workouts.value.length === 0 && <p class="muted">Log a few workouts first so there’s something to work with.</p>}
          <QuoteCard compact seed={7} />
        </section>
      )}

      {off && (
        <section class="coach-off">
          <b>The in-app coach isn’t set up here</b>
          <span>
            It runs on your server with an Anthropic API key (set <code>ANTHROPIC_API_KEY</code>, see the README). Until then, tap a question below: Reps copies it with your
            training summary, ready to paste into Claude.
          </span>
        </section>
      )}

      <div class="chat">
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div class="bubble user">{m.content}</div>
          ) : (
            <div class="bubble coach">{m.content ? <Markdown text={m.content} /> : busy && i === msgs.length - 1 ? <span class="typing" aria-label="Thinking" /> : null}</div>
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
          placeholder={off ? 'Ask, then paste into Claude' : 'Ask your coach'}
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
          <button type="submit" class="send" disabled={!input.trim()} aria-label={off ? 'Copy for Claude' : 'Send'}>
            <Icon name={off ? 'copy' : 'up'} size={20} />
          </button>
        )}
      </form>
    </div>
  )
}

/** Just enough Markdown for coach replies: paragraphs, lists, headings, bold. No HTML is injected. */
function Markdown({ text }: { text: string }) {
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
