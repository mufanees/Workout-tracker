// A Material-style clock for picking a time of day: big hour and minute boxes (tap to switch),
// AM / PM, and a dial you tap or drag. Hours snap to the numbers; minutes go to the exact minute
// with labels every five. Letting go of the hour moves on to the minutes, like Android's picker.
// 24-hour locales get an inner ring for 12–23.
import { useRef, useState } from 'preact/hooks'

const H12 = !new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle?.startsWith('h2')
const pad = (n: number) => String(n).padStart(2, '0')
const TAU = Math.PI * 2
// Positions as a fraction of the dial's size.
const OUTER = 0.39
const INNER = 0.25

type Mode = 'hour' | 'minute'

export function ClockPicker({ value, onChange, label }: { value: number; onChange: (t: number) => void; label: string }) {
  const d = new Date(value)
  const h = d.getHours()
  const m = d.getMinutes()
  const pm = h >= 12
  const [mode, setMode] = useState<Mode>('hour')
  const [drag, setDrag] = useState(false)
  const dial = useRef<HTMLDivElement>(null)
  const lastAngle = useRef<number | null>(null)

  const at = (hh: number, mm: number) => {
    if (hh === h && mm === m) return
    navigator.vibrate?.(4)
    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime())
  }

  // Selected value → angle (degrees from 12 o'clock) and ring.
  const inner = !H12 && mode === 'hour' && (h === 0 || h > 12)
  const target = mode === 'hour' ? (h % 12) * 30 : m * 6
  // Turn the short way round (11 → 1 goes through 12, not back through 6).
  const prev = lastAngle.current ?? target
  const angle = prev + ((((target - prev) % 360) + 540) % 360) - 180
  lastAngle.current = angle

  const pick = (e: PointerEvent, release = false) => {
    const el = dial.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const a = (Math.atan2(dx, -dy) + TAU) % TAU
    if (mode === 'hour') {
      const n = Math.round(a / (TAU / 12)) % 12
      const inside = !H12 && Math.hypot(dx, dy) < ((OUTER + INNER) / 2) * r.width
      const hh = H12 ? n + (pm ? 12 : 0) : inside ? (n === 0 ? 0 : n + 12) : n === 0 ? 12 : n
      at(hh, m)
      if (release) setMode('minute')
    } else at(h, Math.round(a / (TAU / 60)) % 60)
  }

  const step = (dir: number) => {
    if (mode === 'hour') at((h + dir + 24) % 24, m)
    else at(h, (m + dir + 60) % 60)
  }

  const labels =
    mode === 'minute'
      ? Array.from({ length: 12 }, (_, i) => ({ text: pad(i * 5), at: i, r: OUTER, on: m === i * 5 }))
      : H12
        ? Array.from({ length: 12 }, (_, i) => ({ text: String(i || 12), at: i, r: OUTER, on: h % 12 === i }))
        : [
            ...Array.from({ length: 12 }, (_, i) => ({ text: String(i || 12), at: i, r: OUTER, on: h === (i || 12) })),
            ...Array.from({ length: 12 }, (_, i) => ({ text: i ? String(i + 12) : '00', at: i, r: INNER, on: h === (i ? i + 12 : 0) })),
          ]
  const handR = inner ? INNER : OUTER
  const between = mode === 'minute' && m % 5 !== 0
  const shownH = H12 ? h % 12 || 12 : h

  return (
    <div class="clock" role="group" aria-label={`${label}: time`}>
      <div class="clock-head">
        <button class={'clock-box' + (mode === 'hour' ? ' on' : '')} aria-pressed={mode === 'hour'} aria-label={`Hour, ${shownH}`} onClick={() => setMode('hour')}>
          {pad(shownH)}
        </button>
        <span class="clock-colon" aria-hidden="true">
          :
        </span>
        <button class={'clock-box' + (mode === 'minute' ? ' on' : '')} aria-pressed={mode === 'minute'} aria-label={`Minute, ${m}`} onClick={() => setMode('minute')}>
          {pad(m)}
        </button>
        {H12 && (
          <div class="clock-ampm" role="radiogroup" aria-label="AM or PM">
            <button role="radio" aria-checked={!pm} class={!pm ? 'on' : ''} onClick={() => pm && at(h - 12, m)}>
              AM
            </button>
            <button role="radio" aria-checked={pm} class={pm ? 'on' : ''} onClick={() => !pm && at(h + 12, m)}>
              PM
            </button>
          </div>
        )}
      </div>
      <div
        ref={dial}
        class={'clock-dial' + (drag ? ' dragging' : '')}
        role="slider"
        tabIndex={0}
        aria-label={mode === 'hour' ? 'Hour' : 'Minute'}
        aria-valuenow={mode === 'hour' ? h : m}
        aria-valuemin={0}
        aria-valuemax={mode === 'hour' ? 23 : 59}
        aria-valuetext={mode === 'hour' ? `${shownH}${H12 ? (pm ? ' PM' : ' AM') : ''}` : `${m} minutes`}
        onPointerDown={(e) => {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          setDrag(true)
          pick(e)
        }}
        onPointerMove={(e) => drag && pick(e)}
        onPointerUp={(e) => {
          if (!drag) return
          setDrag(false)
          pick(e, true)
        }}
        onPointerCancel={() => setDrag(false)}
        onKeyDown={(e) => {
          const dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0
          if (dir) (e.preventDefault(), step(dir))
          if (e.key === 'Enter' && mode === 'hour') (e.preventDefault(), setMode('minute'))
        }}
      >
        <span class="clock-hand" style={{ transform: `rotate(${angle}deg)`, height: `${handR * 100}%` }} aria-hidden="true">
          <i class={'clock-knob' + (between ? ' between' : '')} />
        </span>
        <span class="clock-pivot" aria-hidden="true" />
        {labels.map((l) => {
          const a = l.at * (TAU / 12)
          return (
            <span
              class={'clock-num' + (l.on ? ' on' : '') + (l.r === INNER ? ' inner' : '')}
              style={{ left: `${50 + Math.sin(a) * l.r * 100}%`, top: `${50 - Math.cos(a) * l.r * 100}%` }}
              aria-hidden="true"
            >
              {l.text}
            </span>
          )
        })}
      </div>
    </div>
  )
}
