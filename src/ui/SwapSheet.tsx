// "Can't do this?": alternatives for one exercise of the live workout, one tap to swap (with Undo),
// then two optional taps: change the routine too, and remember what kit is missing.
import { useEffect, useRef, useState } from 'preact/hooks'
import { active, exMap, routines } from '../store'
import { alternativesFor, guessLack, rememberLack, swapActive, swapFor, swapInRoutine, type Alternative } from '../swap'
import { Icon } from './icons'
import { Sheet, toast } from './overlay'
import { haptic } from '../util'

export function SwapSheet() {
  const weId = swapFor.value
  const w = active.value
  const we = weId ? w?.exercises.find((e) => e.id === weId) : undefined
  // what it was and what it became, for the follow-up step
  const [done, setDone] = useState<{ fromId: string; toId: string; undo: () => void } | null>(null)
  const [lack, setLack] = useState('')
  const [saved, setSaved] = useState<{ routine?: string; lack?: boolean }>({})
  const last = useRef<{ name: string; alts: Alternative[] }>({ name: '', alts: [] })
  useEffect(() => {
    if (!weId) return
    setDone(null)
    setSaved({})
    setLack(guessLack(exMap.value.get(we?.exerciseId || '')?.name || ''))
  }, [weId])
  const close = () => (swapFor.value = null)
  if (we && !done) last.current = { name: exMap.value.get(we.exerciseId)?.name || 'this exercise', alts: alternativesFor(we.exerciseId) }
  const { name, alts } = last.current
  const fromName = done ? exMap.value.get(done.fromId)?.name || name : name
  const toName = done ? exMap.value.get(done.toId)?.name || '' : ''
  const routine = w?.routineId ? routines.value.find((r) => r.id === w.routineId) : undefined
  const inRoutine = !!done && (!!saved.routine || !!routine?.exercises.some((e) => e.exerciseId === done.fromId))

  const pick = (a: Alternative) => {
    if (!we) return
    const fromId = we.exerciseId
    const undo = swapActive(we.id, a.id)
    if (!undo) return
    haptic(12)
    setDone({ fromId, toId: a.id, undo })
  }

  return (
    <Sheet open={!!weId && !!we} onClose={close} label={done ? 'Swapped' : `Swap ${name}`}>
      {!done ? (
        <>
          <div class="action-head">
            <div class="action-title">Can’t do {name}?</div>
            <div class="action-msg">Same muscles, with kit you have. Sets and targets stay.</div>
          </div>
          {alts.length ? (
            <div class="action-list swap-list">
              {alts.map((a) => (
                <button class="action load-opt" onClick={() => pick(a)}>
                  <Icon name="swap" />
                  <span class="action-label">
                    <b>{a.name}</b>
                    <small>{a.why}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p class="swap-empty">No close match with your kit. Use Replace exercise in the ⋯ menu to pick any move.</p>
          )}
          <button class="btn btn-quiet btn-block" onClick={close}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <div class="action-head">
            <div class="action-title">
              {fromName} → {toName}
            </div>
            <div class="action-msg">Swapped in this workout.</div>
          </div>
          <div class="swap-follow">
            {inRoutine && (
              <button
                class="btn btn-secondary btn-block"
                disabled={!!saved.routine}
                onClick={async () => {
                  const msg = await swapInRoutine(routine!.id, done.fromId, done.toId)
                  setSaved((s) => ({ ...s, routine: msg }))
                }}
              >
                <Icon name={saved.routine ? 'check' : 'pencil'} size={18} /> {saved.routine || `Also change ${routine!.name}`}
              </button>
            )}
            <label class="field swap-lack">
              <span>Remember what’s missing (optional)</span>
              <div class="row gap">
                <input type="text" value={lack} placeholder="e.g. a bench" onInput={(e) => setLack(e.currentTarget.value)} aria-label="What kit you don’t have" disabled={saved.lack} />
                <button
                  class="btn btn-secondary"
                  disabled={!lack.trim() || saved.lack}
                  onClick={async () => {
                    await rememberLack(lack, fromName)
                    setSaved((s) => ({ ...s, lack: true }))
                    toast('Your coach will plan around it')
                  }}
                >
                  {saved.lack ? <Icon name="check" size={18} /> : 'Remember'}
                </button>
              </div>
            </label>
            <div class="row gap">
              <button
                class="btn btn-secondary grow"
                onClick={() => {
                  done.undo()
                  setDone(null)
                  toast(`Back to ${fromName}`)
                }}
              >
                Undo
              </button>
              <button class="btn btn-primary grow" onClick={close}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </Sheet>
  )
}
