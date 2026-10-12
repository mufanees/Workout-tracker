// Before a routine starts: how long you've got. The target is the most the whole session may take, warm-up
// and cool-down included; the workout is planned, paced and coached to it, and fitted to it when it runs over.
import { signal } from '@preact/signals'
import { useMemo, useState } from 'preact/hooks'
import type { Routine } from '../types'
import { settings } from '../store'
import { budgetFor, estimate, fitToBudget, totalOf } from '../timeplan'
import { routineToday, startRoutine } from '../workout'
import { Icon } from './icons'
import { Sheet, toast } from './overlay'
import { Toggle } from './inputs'

const ask = signal<Routine | null>(null)

/** Ask for a target time, then start `r`. */
export function askStart(r: Routine) {
  ask.value = r
}

const CHIPS = [15, 20, 25, 30, 45, 60]
const MIN = 10
const MAX = 120

export function StartSheetHost() {
  const r = ask.value
  const [last, setLast] = useState<Routine | null>(null)
  const [target, setTarget] = useState(25)
  const [fit, setFit] = useState(true)
  // a new routine opens on its own budget (or yours)
  if (r && r !== last) {
    setLast(r)
    setTarget(budgetFor({ budget: r.budget }).total)
    setFit(true)
  }
  const shown = r || last
  const plan = useMemo(() => {
    if (!shown) return null
    const today = routineToday(shown)
    const est = totalOf(estimate(today))
    const over = est > target
    const res = over ? fitToBudget(today, target) : null
    return { est, over, res }
  }, [shown, target, settings.value.timeBudget])
  const b = budgetFor({ budget: target })
  const lifting = Math.max(0, b.total - b.warmup - b.cooldown)
  const close = () => (ask.value = null)
  const go = async () => {
    if (!shown) return
    ask.value = null
    const changes = await startRoutine(shown, { target, fit: !!plan?.over && fit })
    if (changes && changes.length) toast(`Fitted to ${target} min · ${changes.length} change${changes.length === 1 ? '' : 's'}`)
  }
  const step = (d: number) => setTarget((t) => Math.max(MIN, Math.min(MAX, t + d)))

  return (
    <Sheet
      open={!!r}
      onClose={close}
      title={shown?.name}
      footer={
        <button class="btn btn-primary btn-block btn-lg" onClick={go}>
          <Icon name="play" size={18} /> Start · {target} min
        </button>
      }
    >
      <div class="start-sheet">
        <span class="start-label">Target time</span>
        <div class="start-target">
          <button class="icon-btn start-step" onClick={() => step(-5)} disabled={target <= MIN} aria-label="5 minutes less">
            <Icon name="minus" />
          </button>
          <b class="start-num">
            {target}
            <small>min</small>
          </b>
          <button class="icon-btn start-step" onClick={() => step(5)} disabled={target >= MAX} aria-label="5 minutes more">
            <Icon name="plus" />
          </button>
        </div>
        <div class="start-chips" role="radiogroup" aria-label="Target time">
          {CHIPS.map((m) => (
            <button key={m} role="radio" aria-checked={m === target} class={'phase-chip' + (m === target ? ' on' : '')} onClick={() => setTarget(m)}>
              {m}
            </button>
          ))}
        </div>
        <p class="start-split">
          {b.warmup} warm-up · {lifting} lifting · {b.cooldown} cool-down, all inside {target} min
        </p>
        {plan && (
          <div class={'start-fit' + (plan.over ? ' over' : '')}>
            <Icon name={plan.over ? 'timer' : 'check'} size={18} />
            <span>
              {plan.over ? (
                <>
                  At your pace this takes about <b>{plan.est} min</b>, {plan.est - target} over.
                  {plan.res && plan.res.changes.length > 0 && (
                    <small>
                      Fitting it: {plan.res.changes.slice(0, 2).join('; ')}
                      {plan.res.changes.length > 2 ? ` +${plan.res.changes.length - 2} more` : ''}
                      {plan.res.fits ? ` (~${plan.res.after} min)` : `. Closest it gets: ~${plan.res.after} min`}
                    </small>
                  )}
                </>
              ) : (
                <>
                  At your pace this takes about <b>{plan.est} min</b>
                  {target - plan.est > 0 ? `, ${target - plan.est} to spare` : ''}.
                </>
              )}
            </span>
          </div>
        )}
        {plan?.over && plan.res && plan.res.changes.length > 0 && (
          <div class="start-toggle">
            <span>
              Fit it to {target} min
              <small>Same exercises: heavier sets of fewer reps, supersets and shorter rests first. Off: the coach keeps you to time as you go.</small>
            </span>
            <Toggle checked={fit} onChange={setFit} label={`Fit it to ${target} min`} />
          </div>
        )}
      </div>
    </Sheet>
  )
}
