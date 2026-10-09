// The cardio quick start's choices: activity, zone to hold, warm-up and cool-down minutes, stretches.
// Remembered per person (Settings.cardio). Opened before starting, and from a running session.
import { useEffect, useState } from 'preact/hooks'
import { ACTIVITIES, cardioPhase, cardioPrefs, resumeMain, defaultStretches, discardCardio, saveCardioPrefs, sessionName, startCardioSession, updateSession } from '../cardio'
import { ZONE_NAMES, zoneRange } from '../hr'
import { active } from '../store'
import type { CardioPrefs } from '../types'
import { MoveListEditor } from './MoveList'
import { Sheet } from './overlay'
import { Icon } from './icons'

const MINUTES = [0, 3, 5, 10]

export function CardioSetupSheet({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: 'start' | 'session' }) {
  const [p, setP] = useState<CardioPrefs>(cardioPrefs())
  const [other, setOther] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [custom, setCustom] = useState(false)

  useEffect(() => {
    if (!open) return
    let saved = cardioPrefs()
    const c = active.value?.cardio
    if (mode === 'session' && c) {
      const own = c.stretches && JSON.stringify(c.stretches) !== JSON.stringify(defaultStretches(c.activity))
      saved = { activity: c.activity, target: active.value!.targetZone ?? null, warmupMin: c.warmupMin, cooldownMin: c.cooldownMin, stretches: own ? c.stretches : undefined }
    }
    setP(saved)
    setOther(!!saved.activity && !ACTIVITIES.includes(saved.activity))
    setCustom(!!saved.stretches?.length)
    setLines(saved.stretches?.length ? saved.stretches : saved.activity ? defaultStretches(saved.activity) : [])
  }, [open])

  const pick = (activity: string) => {
    setP({ ...p, activity })
    if (!custom) setLines(defaultStretches(activity))
  }
  const result = (): CardioPrefs => ({ ...p, activity: p.activity.trim(), stretches: custom ? lines.filter((l) => l.trim()) : undefined })
  const ready = !!p.activity.trim()

  const go = async () => {
    const r = result()
    await saveCardioPrefs(r)
    onClose()
    if (mode === 'start') await startCardioSession(r)
    else updateSession(r)
  }

  const chips = <T,>(label: string, opts: [T, string][], value: T, set: (v: T) => void) => (
    <div class="chips-wrap" data-goo role="radiogroup" aria-label={label}>
      {opts.map(([v, l]) => (
        <button role="radio" aria-checked={v === value} class={'chip' + (v === value ? ' on' : '')} onClick={() => set(v)}>
          {l}
        </button>
      ))}
    </div>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === 'start' ? 'Cardio' : 'This session'}
      footer={
        <button class="btn btn-primary btn-block btn-lg" disabled={!ready} onClick={go}>
          {mode === 'start' ? (ready ? `Start ${sessionName(p.activity.trim(), p.target).replace(' · Zone', ' · zone')}` : 'Pick an activity') : 'Done'}
        </button>
      }
    >
      <div class="field">
        <span>Activity</span>
        <div class="chips-wrap" data-goo role="radiogroup" aria-label="Activity">
          {ACTIVITIES.map((a) => (
            <button role="radio" aria-checked={!other && p.activity === a} class={'chip' + (!other && p.activity === a ? ' on' : '')} onClick={() => (setOther(false), pick(a))}>
              {a}
            </button>
          ))}
          <button role="radio" aria-checked={other} class={'chip' + (other ? ' on' : '')} onClick={() => (setOther(true), pick(ACTIVITIES.includes(p.activity) ? '' : p.activity))}>
            Other
          </button>
        </div>
        {other && <input type="text" value={p.activity} placeholder="What is it? e.g. Hike, Skipping" aria-label="Activity name" onInput={(e) => setP({ ...p, activity: e.currentTarget.value })} />}
      </div>

      <div class="field">
        <span>Zone to hold</span>
        {chips<number | null>('Zone to hold', [[null, 'None'], [1, 'Z1'], [2, 'Z2'], [3, 'Z3'], [4, 'Z4'], [5, 'Z5']], p.target, (target) => setP({ ...p, target }))}
        <span class="field-hint">
          {p.target
            ? `Zone ${p.target} · ${ZONE_NAMES[p.target - 1]} · ${zoneRange(p.target)} bpm. Your phone buzzes after 15 s out of it, once the warm-up is over.`
            : 'Free cardio: every zone is shown, no alerts.'}
        </span>
      </div>

      <div class="field">
        <span>Warm-up</span>
        {chips('Warm-up minutes', MINUTES.map((m) => [m, m ? `${m} min` : 'None'] as [number, string]), p.warmupMin, (warmupMin) => setP({ ...p, warmupMin }))}
      </div>

      <div class="field">
        <span>Cool-down</span>
        {chips('Cool-down minutes', MINUTES.map((m) => [m, m ? `${m} min` : 'None'] as [number, string]), p.cooldownMin, (cooldownMin) => setP({ ...p, cooldownMin }))}
      </div>

      {p.cooldownMin > 0 && (
        <>
          <MoveListEditor
            label="Cool-down stretches"
            lines={lines}
            placeholder="Standing calf stretch · 30 s / side"
            onChange={(l) => {
              setLines(l)
              setCustom(true)
            }}
          />
          {custom && p.activity && (
            <button
              class="btn-text small cs-reset"
              onClick={() => {
                setCustom(false)
                setLines(defaultStretches(p.activity))
              }}
            >
              Use the usual stretches for {p.activity.toLowerCase()}
            </button>
          )}
        </>
      )}

      {mode === 'session' && active.value && cardioPhase(active.value) === 'cooldown' && (
        <button
          class="btn btn-secondary btn-block"
          onClick={() => {
            resumeMain()
            onClose()
          }}
        >
          Back to {active.value.cardio?.activity.toLowerCase()}
        </button>
      )}
      {mode === 'session' && (
        <button
          class="btn btn-ghost-danger btn-block"
          onClick={async () => {
            if (await discardCardio()) onClose()
          }}
        >
          Discard session
        </button>
      )}
    </Sheet>
  )
}

/** Train's cardio quick start: your activity and zone at a tap, or "Cardio" (choose first) the first time. */
export function CardioQuick() {
  const [open, setOpen] = useState(false)
  const p = cardioPrefs()
  const chosen = !!p.activity
  return (
    <div class="cardio-quick grow">
      <button class="btn btn-secondary btn-lg cq-main" onClick={() => (chosen ? startCardioSession(p) : setOpen(true))}>
        {!chosen && <Icon name="heart" />}
        <span class="cq-text">
          <b>{chosen ? p.activity : 'Cardio'}</b>
          {chosen && (
            <small>
              <Icon name="heart" size={12} /> {p.target ? `Zone ${p.target}` : 'Free'}
            </small>
          )}
        </span>
      </button>
      {chosen && (
        <button class="btn btn-secondary btn-lg cq-edit" onClick={() => setOpen(true)} aria-label="Change cardio activity, zone and stretches">
          <Icon name="sliders" size={18} />
        </button>
      )}
      <CardioSetupSheet open={open} onClose={() => setOpen(false)} mode="start" />
    </div>
  )
}
