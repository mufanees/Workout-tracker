// The coach conversation, shared by the Coach screen and the coach sheet during a workout:
// one thread, so a reply keeps streaming when you close the sheet and shows up in both places.
import { signal } from '@preact/signals'
import { getToken, syncNow } from './sync'
import { exMap } from './store'
import { buildCoachContext, coachPasteText, routinesText } from './coachContext'
import { claudeChat } from './coachClaude'
import { applyProposal, coachMode, coachOn, quick, tz, type Proposal } from './coach'
import { toast } from './ui/overlay'
import { saveVideo } from './videos'

export interface Msg {
  role: 'user' | 'assistant'
  content: string
  at?: number // when it was sent
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

export const chat = signal<Msg[]>(load())
export const chatBusy = signal(false)
export const chatStatus = signal('')
/** The message box text, kept here so a failed send can put the question back. */
export const chatInput = signal('')
let abort: AbortController | null = null

const save = (m: Msg[]) => {
  chat.value = m
  persist(m)
}

export const TOOL_LABEL: Record<string, string> = {
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
  find_stretches: 'Picking stretches',
  propose_mobility_plan: 'Building in your mobility',
  search_library: 'Reading your library',
  save_to_library: 'Saving to your library',
  save_exercise_video: 'Saving the video',
  resolve_goal: 'Updating your goal',
  propose_profile_update: 'Preparing a profile update',
  adjust_workout: 'Reworking today’s session',
}

/** Keep the chat short: condense the oldest messages into memory notes, then drop them. */
async function condense(all: Msg[]): Promise<Msg[]> {
  if (all.length <= KEEP) return all
  const old = all.slice(0, all.length - KEEP + 10)
  try {
    await quick({ kind: 'condense', messages: old.map(({ role, content }) => ({ role, content })) })
  } catch {
    /* best effort: still trim */
  }
  return all.slice(old.length)
}

export function copyForClaude(q: string) {
  return navigator.clipboard
    .writeText(coachPasteText(q))
    .then(() => toast('Copied. Paste it into Gemini or Claude to get your answer.'))
    .catch(() => toast('Couldn’t copy on this device.'))
}

export function stopChat() {
  abort?.abort()
}

export function clearChat() {
  save([])
}

export async function ask(text: string, focusWorkoutId?: string) {
  const q = text.trim()
  if (!q || chatBusy.value) return
  if (!coachOn.value) return copyForClaude(q)
  const history: Msg[] = [...chat.value, { role: 'user', content: q, at: Date.now() }]
  const reply: Msg = { role: 'assistant', content: '', at: Date.now(), memory: [], proposals: [] }
  const show = () => (chat.value = [...history, { ...reply }])
  show()
  chatInput.value = ''
  chatBusy.value = true
  chatStatus.value = ''
  const ctrl = new AbortController()
  abort = ctrl
  try {
    if (coachMode.value === 'claude') {
      const text = await claudeChat(history.map(({ role, content }) => ({ role, content })), focusWorkoutId, {
        signal: ctrl.signal,
        onText: (t) => {
          reply.content = t
          chatStatus.value = ''
          show()
        },
        onTool: (name) => {
          chatStatus.value = TOOL_LABEL[name] || 'Working on it'
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
        const ev = JSON.parse(line) as { t?: string; error?: string; tool?: string; memory?: { action: string; text: string }; proposal?: Proposal; video?: { exerciseId: string; name: string; url: string; title?: string | null } }
        if (ev.error) throw new Error(ev.error)
        if (ev.t) {
          reply.content += ev.t
          chatStatus.value = ''
        }
        if (ev.tool) chatStatus.value = TOOL_LABEL[ev.tool] || 'Working on it'
        if (ev.memory) reply.memory!.push(ev.memory)
        if (ev.video) {
          const ex = exMap.value.get(ev.video.exerciseId)
          if (ex) void saveVideo(ex, ev.video.url, { title: ev.video.title || undefined })
        }
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
      chat.value = history.slice(0, -1)
      chatInput.value = q
      toast((e as Error).message || 'The coach is unavailable right now.')
    }
  } finally {
    chatBusy.value = false
    chatStatus.value = ''
    abort = null
  }
}

/** Approve or dismiss a proposal in message mi. */
export async function decide(mi: number, pid: string, approve: boolean) {
  const m = chat.value[mi]
  const p = m?.proposals?.find((x) => x.id === pid)
  if (!p) return
  try {
    if (approve) toast(await applyProposal(p))
    save(chat.value.map((x, j) => (j === mi ? { ...x, proposals: x.proposals!.map((y) => (y.id === pid ? { ...y, state: approve ? ('approved' as const) : ('dismissed' as const) } : y)) } : x)))
  } catch (e) {
    toast((e as Error).message)
  }
}
