// The coach during a workout: a floating button that opens the conversation in a sheet, with
// one-tap asks for the usual mid-session changes (more or less time, a swap, an easier day).
import { useEffect, useRef, useState } from 'preact/hooks'
import { active, exMap } from '../store'
import { checkCoach, coachOn } from '../coach'
import { ask, chat, chatBusy } from '../coachChat'
import { restTimer } from '../workout'
import { ChatThread, Composer } from '../screens/Coach'
import { nextUp } from './WorkoutEditor'
import { Icon } from './icons'
import { Sheet } from './overlay'

/** The exercise you're on (the one with the next set to do). */
function currentExercise(): string | null {
  const w = active.value
  if (!w) return null
  const we = w.exercises.find((e) => e.sets.some((s) => s.id === nextUp.value)) || w.exercises.find((e) => e.sets.some((s) => !s.done))
  return we ? exMap.value.get(we.exerciseId)?.name || null : null
}

function asks(): string[] {
  const cur = currentExercise()
  const w = active.value
  const left = w?.timePlan ? w.timePlan.budget - Math.round((Date.now() - w.start) / 60000) : null
  return [
    'I have 10 more minutes',
    left != null && left > 12 ? `I only have ${Math.max(5, Math.round((left - 10) / 5) * 5)} min left` : 'I need to finish in 10 min',
    ...(cur ? [`Swap ${cur} for something else`, `${cur} hurts`] : []),
    'Make the rest of today easier',
    'I feel great, push me harder',
  ]
}

export function CoachBubble() {
  const w = active.value
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(chat.value.length)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (coachOn.value == null) void checkCoach()
  }, [])
  const msgs = chat.value
  const busy = chatBusy.value
  useEffect(() => {
    if (open) setSeen(msgs.length)
  }, [open, msgs.length, busy])
  useEffect(() => {
    if (open) requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end' }))
  }, [open, msgs.length, msgs[msgs.length - 1]?.content.length])
  if (!w || !coachOn.value) return null

  // This session's part of the conversation.
  let from = msgs.findIndex((m) => (m.at || 0) >= w.start)
  if (from < 0) from = msgs.length
  const unread = !open && !busy && msgs.length > seen && msgs[msgs.length - 1]?.role === 'assistant'
  return (
    <>
      <button class={'coach-fab' + (restTimer.value ? ' resting' : '') + (busy ? ' busy' : '')} onClick={() => setOpen(true)} aria-label={unread ? 'Coach replied. Open coach' : 'Ask your coach'}>
        <Icon name="coach" size={24} />
        {unread && <span class="coach-fab-dot" aria-hidden="true" />}
        {busy && <span class="coach-fab-ring" aria-hidden="true" />}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Coach" full footer={<Composer placeholder="Ask about this workout" />}>
        {from >= msgs.length && !busy && <p class="coach-fab-intro">Change anything about today’s session. Your coach sees where you are and what’s left, and nothing changes until you tap Apply.</p>}
        <ChatThread from={from} />
        {!busy && (
          <div class={'chips-wrap coach-fab-asks' + (from < msgs.length ? ' row' : '')}>
            {asks().map((q) => (
              <button class="chip" onClick={() => void ask(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </Sheet>
    </>
  )
}
