import type { ComponentChildren } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { remove, saveFast, settings } from '../store'
import type { Fast } from '../types'
import { cancelPush } from '../push'
import { HOUR, PROTOCOLS, STAGES, hm, protocolLabel, saveFastEdit } from '../fasting'
import { fmtDay, fmtTime, startOfDay, uid } from '../util'
import { Icon } from './icons'
import { AutoText, confirmDialog, Sheet, toast } from './overlay'

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** "Fri 9:28 PM", or just the time for today. */
export const whenLabel = (t: number) => (fmtDay(t) === 'Today' ? fmtTime(t) : `${fmtDay(t)}, ${fmtTime(t)}`)

/** Progress ring with the metabolic stages placed around it. */
export function StageRing({ elapsed, goal, idle, children }: { elapsed: number; goal: number; idle?: boolean; children: ComponentChildren }) {
  const r = 104
  const c = 2 * Math.PI * r
  const pct = idle ? 0 : Math.min(1, elapsed / (goal * HOUR))
  const hours = elapsed / HOUR
  const marks = STAGES.filter((s) => s.at < goal)
  return (
    <div class={'stage-ring' + (idle ? ' idle' : '')}>
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle cx="120" cy="120" r={r} class="sr-bg" />
        {!idle && <circle cx="120" cy="120" r={r} class="sr-fg" stroke-dasharray={c} stroke-dashoffset={c * (1 - pct)} transform="rotate(-90 120 120)" />}
      </svg>
      {marks.map((s) => {
        const a = (s.at / goal) * 2 * Math.PI - Math.PI / 2
        const passed = !idle && hours >= s.at
        return (
          <span
            class={'sr-mark' + (passed ? ' on' : '')}
            style={{
              left: `${50 + (r / 240) * 100 * Math.cos(a)}%`,
              top: `${50 + (r / 240) * 100 * Math.sin(a)}%`,
            }}
            title={s.name}
          >
            <Icon name={s.icon} size={15} stroke={2.2} />
          </span>
        )
      })}
      <div class="sr-center">{children}</div>
    </div>
  )
}

const OFFSETS = [
  { label: 'Now', min: 0 },
  { label: '15 min ago', min: 15 },
  { label: '30 min ago', min: 30 },
  { label: '1 h ago', min: 60 },
  { label: '2 h ago', min: 120 },
  { label: '3 h ago', min: 180 },
]

const MIN = 60000
const DAY = 86400000
const pad = (n: number) => String(n).padStart(2, '0')
const shortDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' })
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

const ROW = 56 // wheel row height, px
const H12 = !new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle?.startsWith('h2')
const HOURS = H12 ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

/**
 * One column of a big scroll wheel. Rows snap one at a time; the value is picked when the
 * scroll settles, or by tapping a row. A change from outside (clamped to now) scrolls it back.
 */
function Wheel({ items, index, onPick, label, render }: { items: number[] | string[]; index: number; onPick: (i: number) => void; label: string; render?: (v: number | string) => string }) {
  const ref = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [center, setCenter] = useState(index)
  const latest = useRef(index)
  latest.current = index
  const at = () => Math.max(0, Math.min(items.length - 1, Math.round((ref.current?.scrollTop || 0) / ROW)))
  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = index * ROW
    setCenter(index)
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el || at() === index) return setCenter(index)
    el.scrollTo({ top: index * ROW, behavior: 'smooth' })
  }, [index])
  const onScroll = () => {
    const i = at()
    if (i !== center) {
      setCenter(i)
      navigator.vibrate?.(4)
    }
    if (settle.current) clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const j = at()
      if (j !== index) onPick(j)
      // If the pick was refused (e.g. held at now), roll back to the value that stuck.
      setTimeout(() => {
        if (ref.current && at() !== latest.current) ref.current.scrollTo({ top: latest.current * ROW, behavior: 'smooth' })
      }, 60)
    }, 140)
  }
  return (
    <div class="wheel" ref={ref} role="listbox" aria-label={label} tabIndex={0} onScroll={onScroll}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
        if (d) (e.preventDefault(), onPick(Math.max(0, Math.min(items.length - 1, index + d))))
      }}>
      {items.map((v, i) => (
        <button role="option" tabIndex={-1} aria-selected={i === index} class={'wheel-row' + (i === center ? ' on' : '')} onClick={() => (i === index ? null : onPick(i))}>
          {render ? render(v) : String(v)}
        </button>
      ))}
    </div>
  )
}

/** Hour, minute (5-minute steps) and AM/PM wheels for the time of day of `value`. */
function TimeWheels({ value, onChange, label }: { value: number; onChange: (t: number) => void; label: string }) {
  const d = new Date(value)
  const h = d.getHours()
  const m = d.getMinutes()
  const pm = h >= 12
  const at = (hh: number, mm: number) => onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime())
  const hIndex = H12 ? h % 12 : h
  return (
    <div class={'wheels' + (H12 ? ' h12' : '')} role="group" aria-label={`${label}: time`}>
      <div class="wheel-band" aria-hidden="true" />
      <Wheel label="Hour" items={HOURS} index={hIndex} onPick={(i) => at(H12 ? i + (pm ? 12 : 0) : i, m)} />
      <span class="wheel-colon" aria-hidden="true">:</span>
      <Wheel label="Minute" items={MINUTES} index={Math.round(m / 5) % 12} onPick={(i) => at(h, i * 5)} render={(v) => pad(Number(v))} />
      {H12 && <Wheel label="AM or PM" items={['AM', 'PM']} index={pm ? 1 : 0} onPick={(i) => at((h % 12) + (i ? 12 : 0), m)} />}
    </div>
  )
}

/**
 * A moment in the past: day chips (today, the last few days, earlier) and big snapping
 * wheels for the time. Never goes past now.
 */
export function WhenPicker({ value, onChange, min, label }: { value: number; onChange: (t: number) => void; min?: number; label: string }) {
  const now = Date.now()
  const today = startOfDay(new Date(now))
  const vDay = startOfDay(new Date(value))
  const d = new Date(value)
  const tod = value - vDay
  const set = (t: number) => onChange(Math.min(t, now))
  const days = [0, 1, 2, 3].map((i) => today - i * DAY)
  // Calendar days, not 24 h steps, so DST changes don't shift the time.
  const onDay = (day: number) => {
    const x = new Date(day)
    set(new Date(x.getFullYear(), x.getMonth(), x.getDate(), d.getHours(), d.getMinutes()).getTime())
  }
  const earlier = vDay < days[3]
  return (
    <div class="when" role="group" aria-label={label}>
      <div class="when-days" role="radiogroup" aria-label={`${label}: day`}>
        {days.map((day, i) => (
          <button role="radio" aria-checked={vDay === day} class={'chip' + (vDay === day ? ' on' : '')} disabled={min != null && day + DAY <= min} onClick={() => onDay(day)}>
            {i === 0 ? 'Today' : i === 1 ? 'Yesterday' : shortDay.format(day)}
          </button>
        ))}
        <span class={'chip when-earlier' + (earlier ? ' on' : '')}>
          {earlier ? shortDate.format(value) : 'Earlier'}
          <input
            type="date"
            aria-label={`${label}: pick a date`}
            max={`${new Date(now).getFullYear()}-${pad(new Date(now).getMonth() + 1)}-${pad(new Date(now).getDate())}`}
            value={`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`}
            onChange={(e) => {
              const [y, m, dd] = e.currentTarget.value.split('-').map(Number)
              if (y) set(new Date(y, m - 1, dd).getTime() + tod)
            }}
          />
        </span>
      </div>
      <TimeWheels label={label} value={value} onChange={set} />
    </div>
  )
}

/** Pick a moment in the past: quick offsets, or an exact day and time. */
export function TimeSheet({
  open,
  title,
  initial,
  min,
  confirm,
  onPick,
  onClose,
}: {
  open: boolean
  title: string
  initial: number
  min?: number
  confirm: string
  onPick: (t: number) => void
  onClose: () => void
}) {
  const [t, setT] = useState(initial)
  useEffect(() => {
    if (open) setT(initial)
  }, [open])
  const valid = Number.isFinite(t) && t <= Date.now() + 60000 && (min == null || t > min)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <button class="btn btn-primary btn-block" disabled={!valid} onClick={() => (onPick(Math.min(t, Date.now())), onClose())}>
          {confirm}
        </button>
      }
    >
      <div class="time-big">
        <b>{valid ? fmtTime(t) : '–'}</b>
        <span>{valid ? fmtDay(t) : min != null && t <= min ? `Has to be after ${whenLabel(min)}` : 'Can’t be in the future'}</span>
      </div>
      <div class="chips-wrap">
        {OFFSETS.map((o) => {
          const at = Date.now() - o.min * 60000
          const on = Math.abs(at - t) < 60000
          return (
            <button class={'chip' + (on ? ' on' : '')} disabled={min != null && at <= min} onClick={() => setT(at)}>
              {o.label}
            </button>
          )
        })}
      </div>
      <div class="field">
        <span>Or pick the day and time</span>
        <WhenPicker label="Time" value={t} min={min} onChange={setT} />
      </div>
    </Sheet>
  )
}

export function ProtocolSheet({ open, value, onPick, onClose }: { open: boolean; value: number; onPick: (goal: number) => void; onClose: () => void }) {
  const [custom, setCustom] = useState(value)
  useEffect(() => {
    if (open) setCustom(value)
  }, [open])
  const known = PROTOCOLS.some((p) => p.goal === value)
  return (
    <Sheet open={open} onClose={onClose} title="Fasting plan">
      <div class="proto-list" role="radiogroup" aria-label="Fasting plan">
        {PROTOCOLS.map((p) => (
          <button role="radio" aria-checked={p.goal === value} class={'proto' + (p.goal === value ? ' on' : '')} onClick={() => (onPick(p.goal), onClose())}>
            <b>{p.label}</b>
            <span>{p.name}</span>
            <small>{p.goal < 24 ? `${p.goal} h fast · ${24 - p.goal} h eating` : `${p.goal} h fast`}</small>
          </button>
        ))}
      </div>
      <div class={'proto-custom' + (!known ? ' on' : '')}>
        <span>Custom</span>
        <div class="stepper">
          <button class="icon-btn step" aria-label="One hour less" onClick={() => setCustom(Math.max(10, custom - 1))}>
            <Icon name="minus" />
          </button>
          <b>{custom} h</b>
          <button class="icon-btn step" aria-label="One hour more" onClick={() => setCustom(Math.min(96, custom + 1))}>
            <Icon name="plus" />
          </button>
        </div>
        <button class="btn btn-secondary btn-sm" onClick={() => (onPick(custom), onClose())}>
          Use
        </button>
      </div>
    </Sheet>
  )
}

/** Edit a fast (or add a past one when `isNew`). */
export function FastEditor({ fast, isNew, onClose }: { fast: Fast | null; isNew?: boolean; onClose: () => void }) {
  const [s, setS] = useState(0)
  const [e, setE] = useState<number | null>(null)
  const [open, setOpen] = useState<'start' | 'end' | null>('start')
  const [goal, setGoal] = useState(16)
  const [note, setNote] = useState('')
  const [proto, setProto] = useState(false)
  useEffect(() => {
    if (fast) {
      setS(fast.start)
      setE(fast.end ?? null)
      setOpen(isNew ? 'start' : null)
      setGoal(fast.goal)
      setNote(fast.note || '')
    }
  }, [fast])
  if (!fast)
    return (
      <Sheet open={false} onClose={onClose}>
        {null}
      </Sheet>
    )
  const running = fast.end == null
  const len = (e ?? Date.now()) - s
  const save = async () => {
    if (!Number.isFinite(s) || (!running && (e == null || !Number.isFinite(e) || e <= s))) return toast('The end has to be after the start')
    if (s > Date.now() || (e != null && e > Date.now() + 60000)) return toast('That’s in the future')
    await saveFastEdit({
      ...fast,
      start: s,
      end: running ? null : e,
      goal,
      note: note.trim() || undefined,
    })
    toast(isNew ? 'Fast added' : 'Fast saved')
    onClose()
  }
  return (
    <Sheet
      open={!!fast}
      onClose={onClose}
      title={isNew ? 'Add a past fast' : running ? 'Current fast' : 'Edit fast'}
      footer={
        <button class="btn btn-primary btn-block" onClick={save}>
          {isNew ? 'Add fast' : 'Save'}
        </button>
      }
    >
      <div class="fe-summary">
        <b>{Number.isFinite(len) && len > 0 ? hm(len) : '–'}</b>
        <button class="chip on" onClick={() => setProto(true)}>
          {protocolLabel(goal)} <Icon name="pencil" size={13} />
        </button>
      </div>
      {!running && e != null && (
        <div class="fe-lengths" role="group" aria-label="Set the length">
          <span>Length</span>
          <div class="chips-wrap">
            {[14, 16, 18, 20, 24].map((h) => (
              <button class={'chip' + (Math.abs(e - s - h * HOUR) < MIN ? ' on' : '')} onClick={() => setS(e - h * HOUR)}>
                {h}h
              </button>
            ))}
          </div>
        </div>
      )}
      <WhenRow label="Started" value={s} open={open === 'start'} onToggle={() => setOpen(open === 'start' ? null : 'start')}>
        <WhenPicker label="Started" value={s} onChange={setS} />
      </WhenRow>
      {!running && e != null && (
        <WhenRow label="Ended" value={e} open={open === 'end'} bad={e <= s} onToggle={() => setOpen(open === 'end' ? null : 'end')}>
          <WhenPicker label="Ended" value={e} min={s} onChange={setE} />
        </WhenRow>
      )}
      <label class="field">
        <span>Note</span>
        <AutoText value={note} onInput={setNote} placeholder="How did it feel? What broke it?" class="input-like" />
      </label>
      {!isNew && (
        <button
          class="btn btn-ghost-danger btn-block"
          onClick={async () => {
            if (
              !(await confirmDialog({
                title: 'Delete this fast?',
                confirm: 'Delete',
                danger: true,
              }))
            )
              return
            await remove('fasts', fast.id)
            if (running) cancelPush('fast')
            onClose()
            toast('Fast deleted', {
              label: 'Undo',
              run: () => void saveFast(fast),
            })
          }}
        >
          Delete fast
        </button>
      )}
      <ProtocolSheet open={proto} value={goal} onPick={setGoal} onClose={() => setProto(false)} />
    </Sheet>
  )
}

/** A start or end time: a summary row that opens its picker. */
function WhenRow({ label, value, open, bad, onToggle, children }: { label: string; value: number; open: boolean; bad?: boolean; onToggle: () => void; children: ComponentChildren }) {
  return (
    <div class={'when-row' + (open ? ' open' : '') + (bad ? ' bad' : '')}>
      <button class="when-head" aria-expanded={open} onClick={onToggle}>
        <span>{label}</span>
        <b>{whenLabel(value)}</b>
        <Icon name="down" size={18} />
      </button>
      {open && children}
      {bad && <p class="when-err">Has to be after the start</p>}
    </div>
  )
}

/** A new past fast ending at `end` (defaults: the current plan, ending at noon that day or now). */
export function draftPastFast(end: number): Fast {
  const goal = settings.value.fastGoal
  const e = Math.min(end, Date.now())
  return { id: uid('f'), start: e - goal * HOUR, end: e, goal, updatedAt: 0 }
}

/** One fast as a row: plan pill, start and end, length. */
export function FastRow({ f, now, onEdit }: { f: Fast; now: number; onEdit: () => void }) {
  const len = (f.end ?? now) - f.start
  const hit = len >= f.goal * HOUR
  return (
    <button class="fast-row" onClick={onEdit}>
      <span class={'fr-pill' + (hit ? ' hit' : '')}>
        {protocolLabel(f.goal)}
        {hit && <Icon name="check" size={12} stroke={3} />}
      </span>
      <span class="fr-times">
        <span>
          <Icon name="play" size={11} /> {whenLabel(f.start)}
        </span>
        <span>
          <Icon name="fast" size={11} /> {f.end ? whenLabel(f.end) : 'In progress'}
        </span>
        {f.note && <small>{f.note}</small>}
      </span>
      <b class="fr-len">{hm(len)}</b>
    </button>
  )
}
