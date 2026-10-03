// A Material-style clock for picking a time of day: big hour and minute boxes (tap to switch),
// AM / PM, and a dial you tap or drag. Hours snap to the numbers; minutes go to the exact minute
// with labels every five. Letting go of the hour moves on to the minutes, like Android's picker.
// 24-hour locales get an inner ring for 12–23.
import { gsap } from 'gsap'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { gooEase, gooReduced } from './Goo'
import { goo as gooCfg, gt, wobbleEase } from '../gooConfig'

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
  const goo = useRef<HTMLSpanElement>(null)
  const knobAt = useRef<{ a: number; r: number } | null>(null)

  const at = (hh: number, mm: number) => {
    if (hh === h && mm === m) return
    navigator.vibrate?.(4)
    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime())
  }

  // Selected value → angle (degrees from 12 o'clock) and ring.
  const inner = !H12 && mode === 'hour' && (h === 0 || h > 12)
  const target = mode === 'hour' ? (h % 12) * 30 : m * 6

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

  // The knob is goo: a knob, four drops and three bulges under one goo filter, moved by GSAP
  // along the dial. A tap or a switch between hour and minute sends the knob gliding round with
  // the drops strung out behind it, and it lands lumpy; while dragging, the drops trail the finger.
  useLayoutEffect(() => {
    const layer = goo.current
    const dialEl = dial.current
    if (!layer || !dialEl) return
    const S = dialEl.offsetWidth
    const c = S / 2
    const hand = layer.querySelector<HTMLElement>('.clock-hand')!
    const knob = layer.querySelector<HTMLElement>('.clock-knob')!
    const drops = Array.from(layer.querySelectorAll<HTMLElement>('.ck-drop'))
    const bulges = Array.from(layer.querySelectorAll<HTMLElement>('.ck-bulge'))
    const rad = (a: number) => (a * Math.PI) / 180
    const place = (el: HTMLElement, p: { a: number; r: number }) => gsap.set(el, { x: c + Math.sin(rad(p.a)) * p.r, y: c - Math.cos(rad(p.a)) * p.r })
    const r = handR * S
    const from = knobAt.current
    // turn the short way round (11 → 1 goes through 12, not back through 6)
    const a = from ? from.a + ((((target - from.a) % 360) + 540) % 360) - 180 : target
    const st = (layer as HTMLElement & { _st?: { k: { a: number; r: number }; d: { a: number; r: number }[] } })._st || { k: { a, r }, d: drops.map(() => ({ a, r })) }
    ;(layer as HTMLElement & { _st?: typeof st })._st = st
    const draw = () => {
      place(knob, st.k)
      gsap.set(hand, { rotation: st.k.a, height: st.k.r })
      drops.forEach((el, i) => place(el, st.d[i]))
    }
    knobAt.current = { a, r }
    if (!from || gooReduced()) {
      st.k.a = a
      st.k.r = r
      st.d.forEach((d) => ((d.a = a), (d.r = r)))
      return draw()
    }
    if (drag) {
      gsap.to(st.k, { a, r, duration: 0.06, ease: 'none', overwrite: 'auto', onUpdate: draw })
      st.d.forEach((d, i) => gsap.to(d, { a, r, duration: gt(0.2 + i * 0.08 * gooCfg.trail), ease: 'sine.out', overwrite: 'auto', onUpdate: draw }))
      return
    }
    gsap.to(st.k, { a, r, duration: gt(0.85), ease: gooEase.move, overwrite: 'auto', onUpdate: draw })
    st.d.forEach((d, i) => gsap.to(d, { a, r, duration: gt(0.85 + i * 0.06 * gooCfg.trail), delay: gt((0.03 + i * 0.035) * gooCfg.trail), ease: gooEase.move, overwrite: 'auto', onUpdate: draw }))
    drops.forEach((el, i) => gsap.fromTo(el, { scale: 1 }, { scale: 1 - (0.3 + i * 0.1) * Math.min(gooCfg.trail, 1.5), duration: gt(0.42), delay: gt(i * 0.035 * gooCfg.trail), ease: 'sine.inOut', yoyo: true, repeat: 1 }))
    // land lumpy: blobs bulge out of the knob, then wobble back in
    const ur = { x: Math.sin(rad(a)), y: -Math.cos(rad(a)) }
    const ut = { x: -ur.y, y: ur.x }
    const kx = c + ur.x * r
    const ky = c + ur.y * r
    if (gooCfg.lumps > 0.02) bulges.forEach((el, i) => {
      const t = (i - 1) * 14 * Math.min(gooCfg.lumps, 1.5)
      const o = (i % 2 ? 1 : -1) * (15 + Math.random() * 5) * gooCfg.lumps
      gsap
        .timeline({ delay: gt(0.3 + i * 0.06) })
        .set(el, { x: kx, y: ky, scale: 0.4, autoAlpha: 1 })
        .to(el, { x: kx + ut.x * t + ur.x * o, y: ky + ut.y * t + ur.y * o, scale: 1.05, duration: gt(0.34), ease: 'sine.out' })
        .to(el, { x: kx + ut.x * t * 0.3, y: ky + ut.y * t * 0.3, scale: 0.6, duration: wobbleEase().duration, ease: wobbleEase().ease })
        .set(el, { autoAlpha: 0 })
    })
  }, [target, handR, drag, mode])
  const shownH = H12 ? h % 12 || 12 : h

  return (
    <div class="clock" role="group" aria-label={`${label}: time`}>
      <div class="clock-head" data-goo>
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
          <div class="clock-ampm" data-goo role="radiogroup" aria-label="AM or PM">
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
        <span class="clock-goo" ref={goo} aria-hidden="true">
          <span class="clock-hand" />
          <span class="clock-pivot" />
          {[30, 22, 16, 11].map((d) => (
            <i class="ck-drop" style={{ '--s': `${d}px` }} />
          ))}
          {[18, 15, 12].map((d) => (
            <i class="ck-bulge" style={{ '--s': `${d}px` }} />
          ))}
          <i class="clock-knob" />
        </span>
        {between && <span class="clock-between" aria-hidden="true" style={{ transform: `rotate(${target}deg)`, height: `${handR * 100}%` }} />}
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
