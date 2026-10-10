// The gooey layer: an SVG "metaball" filter (blur, then a hard alpha cut, so nearby blobs melt
// into one liquid shape) and the small pieces that use it. Everything here is decoration:
// it's hidden from screen readers and switched off for people who prefer reduced motion.
import { gsap } from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import { glideCurve, goo, gt, wobbleEase } from '../gooConfig'
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks'

/** Put once in the app. Elements with `filter: url(#goo)` merge their blobs. Also makes every
 *  tap on a control shed a few droplets (see `gooTap`). */
export function GooDefs() {
  useEffect(() => {
    // capture, so it still runs when a handler stops the click
    document.addEventListener('click', onTap, true)
    const stop = watchGroups()
    return () => {
      document.removeEventListener('click', onTap, true)
      stop()
    }
  }, [])
  return (
    <svg class="goo-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="goo" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
        <filter id="goo-sm" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
        {/* blur, cut the alpha so overlaps go solid, then lay the crisp shapes back on top:
            separate shapes that come close grow a liquid bridge, and keep their own edges */}
        <filter id="goo-merge" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="goo" />
          <feMerge>
            <feMergeNode in="goo" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="goo-merge-lg" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
          <feMerge>
            <feMergeNode in="goo" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* the tab pill's: #goo-merge-lg with its region cut to just around the tab bar (the
            pill and its blobs never reach further), so the compositor blurs a quarter of the area */}
        <filter id="goo-tab" x="-8%" y="-75%" width="116%" height="250%" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
          <feMerge>
            <feMergeNode in="goo" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="goo-merge-sm"x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
          <feMerge>
            <feMergeNode in="goo" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="goo-soft" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" />
        </filter>
      </defs>
    </svg>
  )
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Controls that shed droplets when tapped. The set check has its own splash; text fields don't.
const TAPPABLE = 'button, a[href], [role="button"], [role="tab"], label.chip, summary'
const SKIP = '.check, .toggle, [data-no-goo], input, textarea, select'
let live = 0

function onTap(e: MouseEvent) {
  if (gooReduced()) return
  // An option in a goo group: start its goo now rather than after the app re-renders. It has
  // its own goo, so no droplets.
  const opt = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-goo] > :is(button, .chip, .proto-custom, .swatch)') : null
  if (opt && !(opt as HTMLButtonElement).disabled && opt.parentElement) return gooPick(opt.parentElement, opt)
  if (!goo.taps) return
  const t = e.target instanceof Element ? e.target.closest(TAPPABLE) : null
  if (!t || t.closest(SKIP) || (t as HTMLButtonElement).disabled) return
  // Droplets bud off the control's top edge, above your finger, so they never cover its label.
  const r = t.getBoundingClientRect()
  const keyboard = !e.detail || (!e.clientX && !e.clientY)
  const x = keyboard ? r.left + r.width / 2 : Math.min(r.right - 8, Math.max(r.left + 8, e.clientX))
  const y = r.top + 1
  gooTap(x, y)
}

/** A small bead swells at (x, y) and droplets pinch off it and float up and away. */
export function gooTap(x: number, y: number) {
  if (gooReduced() || live >= 4) return
  live++
  const wrap = document.createElement('span')
  wrap.className = 'goo-tap'
  wrap.setAttribute('aria-hidden', 'true')
  wrap.style.left = `${x}px`
  wrap.style.top = `${y}px`
  const n = 6 + Math.floor(Math.random() * 4)
  for (let i = 0; i < n; i++) {
    const b = document.createElement('i')
    // mostly upward, fanned out, each with its own pace and sideways wander
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6
    const d = 40 + Math.random() * 80
    b.style.setProperty('--dx', `${Math.cos(a) * d}px`)
    b.style.setProperty('--dy', `${Math.sin(a) * d - 12}px`)
    b.style.setProperty('--wx', `${(Math.random() - 0.5) * 30}px`)
    b.style.setProperty('--sz', `${4 + Math.random() * 7}px`)
    b.style.animationDuration = `${900 + Math.random() * 700}ms`
    b.style.animationDelay = `${i * 30 + Math.random() * 60}ms`
    wrap.appendChild(b)
  }
  wrap.appendChild(document.createElement('b'))
  document.body.appendChild(wrap)
  setTimeout(() => {
    wrap.remove()
    live--
  }, 1800)
}

/** A lime splash that bursts out of `el` and melts back (ticking a set). It's drawn inside `host`
 *  (a positioned, unclipped ancestor) so it scrolls with the row; rows that clip can't cut it off. */
export function gooSplash(el: Element | null | undefined, host: HTMLElement | null | undefined) {
  if (!el || !host || gooReduced()) return
  const wrap = document.createElement('span')
  wrap.className = 'goo-splash'
  wrap.setAttribute('aria-hidden', 'true')
  const n = 7
  for (let i = 0; i < n; i++) {
    const b = document.createElement('i')
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6
    const d = 22 + Math.random() * 14
    b.style.setProperty('--dx', `${Math.cos(a) * d}px`)
    b.style.setProperty('--dy', `${Math.sin(a) * d}px`)
    b.style.setProperty('--s', `${0.55 + Math.random() * 0.5}`)
    b.style.animationDelay = `${Math.random() * 40}ms`
    wrap.appendChild(b)
  }
  const core = document.createElement('b')
  wrap.appendChild(core)
  const r = el.getBoundingClientRect()
  const h = host.getBoundingClientRect()
  wrap.style.left = `${r.left - h.left + r.width / 2}px`
  wrap.style.top = `${r.top - h.top + r.height / 2}px`
  host.appendChild(wrap)
  setTimeout(() => wrap.remove(), 900)
}

/** Slow lava-lamp blobs behind a card's content. */
export function Lava({ n = 4 }: { n?: number }) {
  return (
    <span class="lava" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i class={`l${i + 1}`} />
      ))}
    </span>
  )
}

/** Blobs that rise from the bottom of a celebration card and melt together. */
export function GooBurst() {
  return (
    <span class="goo-burst" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i style={{ '--x': `${8 + i * 10.5}%`, '--d': `${(i % 3) * 120 + i * 40}ms`, '--h': `${40 + ((i * 37) % 50)}%` }} />
      ))}
    </span>
  )
}

/** The coach thinking: three drops rise off a bar one after another and sink back into it. */
export function GooDots({ label = 'Thinking' }: { label?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const drops = ref.current ? Array.from(ref.current.querySelectorAll('i')) : []
    if (!drops.length || gooReduced()) return
    const tl = gsap
      .timeline({ repeat: -1, repeatDelay: 0.15 })
      .to(drops, { y: -13, duration: 0.5, ease: 'back.out(2)', stagger: 0.14 })
      .to(drops.slice().reverse(), { y: 0, duration: 0.42, ease: 'power2.in', stagger: 0.14 })
    return () => {
      tl.kill()
    }
  }, [])
  return (
    <span class="goo-dots" role="img" aria-label={label} ref={ref}>
      <b />
      <i />
      <i />
      <i />
    </span>
  )
}

gsap.registerPlugin(CustomEase)
// After a stall (the browser pauses drawing while it swaps screens, or a heavy screen renders),
// carry on from where the motion was instead of jumping ahead to catch up: a gap over 100ms
// counts as one frame. Jumps are what make motion feel un-smooth.
gsap.ticker.lagSmoothing(100, 16)
// One family of curves for all goo, so every piece moves alike, shaped by Settings → Goo →
// Easing (glideCurve in gooConfig.ts): a push off the mark, a sweep through the middle and a
// long, slow landing, never overshooting (reversing direction reads as a jolt).
let curveKey = ''
const curves = { move: 'power3.inOut', size: 'power3.inOut', seconds: 1 }
function eases() {
  const c = glideCurve()
  const key = c.move + c.size
  if (key !== curveKey) {
    curveKey = key
    curves.move = CustomEase.create('goo-move', c.move) as unknown as string
    curves.size = CustomEase.create('goo-size', c.size) as unknown as string
  }
  curves.seconds = c.seconds
  return curves
}
export const gooEase = eases
export const gooReduced = () => reduced() || !goo.enabled

export interface GooRect {
  x: number
  y: number
  w: number
  h: number
  /** corner radius; a pill (h / 2) if left out */
  r?: number
}

const LUMP = [30, 24, 18]
const TRAIL = [40, 24, 24, 16, 11]
const BULGE = [30, 24, 20]

// ---- how a GooTrack is drawn ----
// Every shape is drawn with transforms only, so a move can run on the compositor (Web Animations
// API) and keeps gliding while the main thread is busy drawing the next screen. Blobs are circles
// (a base circle, scaled). A rounded rectangle (the highlight, the puddle) is six parts: two
// crossed rectangles and four corner circles, each moved and scaled, so its corners stay round
// at every width (scaling one box would squash them).
const SQ = 100 // base size of a rectangle part
const CI = 50 // base diameter of a circle part

/** A rounded rectangle in motion: position, size, corner radius, scale about its centre, opacity. */
interface Box {
  x: number
  y: number
  w: number
  h: number
  r: number
  scale: number
  alpha: number
}
/** A round blob: centre, diameter, scale, opacity. */
interface Blob {
  x: number
  y: number
  s: number
  scale: number
  alpha: number
}
interface Shapes {
  head: Box
  origin: Box
  lumps: Blob[]
  trail: Blob[]
  bulges: Blob[]
}
/** One frame: [transform, opacity] for every element, in `els` order. */
type Frame = [string, number][]

const box = (): Box => ({ x: 0, y: 0, w: 0, h: 0, r: 0, scale: 1, alpha: 0 })
const blob = (): Blob => ({ x: 0, y: 0, s: 0, scale: 1, alpha: 0 })
const copyBox = (b: Box): Box => ({ x: b.x, y: b.y, w: b.w, h: b.h, r: b.r, scale: b.scale, alpha: b.alpha })
const copyBlob = (b: Blob): Blob => ({ x: b.x, y: b.y, s: b.s, scale: b.scale, alpha: b.alpha })
const copyShapes = (s: Shapes): Shapes => ({ head: copyBox(s.head), origin: copyBox(s.origin), lumps: s.lumps.map(copyBlob), trail: s.trail.map(copyBlob), bulges: s.bulges.map(copyBlob) })
const num = (n: number) => Math.round(n * 100) / 100
const tiny = (n: number) => Math.max(n, 0.0001)

function boxParts(b: Box, out: Frame) {
  const k = Math.max(0, b.scale)
  const W = Math.max(0, b.w * k)
  const H = Math.max(0, b.h * k)
  const R = Math.max(0, Math.min(b.r * k, W / 2, H / 2))
  const X = b.x + (b.w - W) / 2
  const Y = b.y + (b.h - H) / 2
  const a = Math.max(0, Math.min(1, b.alpha))
  // a part with no area is parked (the same every frame, so it isn't animated): a pill's flat band
  const sq = (x: number, y: number, w: number, h: number) =>
    out.push(w < 0.05 || h < 0.05 ? ['scale(0)', 0] : [`translate(${num(x)}px, ${num(y)}px) scale(${num(w / SQ * 1e4) / 1e4}, ${num(h / SQ * 1e4) / 1e4})`, a])
  const ci = (x: number, y: number) => out.push([`translate(${num(x)}px, ${num(y)}px) scale(${num(tiny(2 * R) / CI * 1e4) / 1e4})`, a])
  sq(X, Y + R, W, H - 2 * R)
  sq(X + R, Y, W - 2 * R, H)
  ci(X, Y)
  ci(X + W - 2 * R, Y)
  ci(X, Y + H - 2 * R)
  ci(X + W - 2 * R, Y + H - 2 * R)
}

function blobPart(b: Blob, out: Frame) {
  const d = Math.max(0, b.s * b.scale)
  out.push([`translate(${num(b.x - d / 2)}px, ${num(b.y - d / 2)}px) scale(${num(tiny(d) / CI * 1e4) / 1e4})`, Math.max(0, Math.min(1, b.alpha))])
}

function frameOf(s: Shapes): Frame {
  const out: Frame = []
  boxParts(s.origin, out)
  s.lumps.forEach((b) => blobPart(b, out))
  boxParts(s.head, out)
  s.trail.forEach((b) => blobPart(b, out))
  s.bulges.forEach((b) => blobPart(b, out))
  // last: the empty box that marks the highlight (unscaled size, for measuring)
  const h = s.head
  out.push([`translate(${num(h.x)}px, ${num(h.y)}px) scale(${num(tiny(h.w) / SQ * 1e4) / 1e4}, ${num(tiny(h.h) / SQ * 1e4) / 1e4})`, h.alpha > 0 ? 1 : 0])
  return out
}

/** A motion worked out and ready to start. */
interface Plan {
  start: Shapes
  T: number
  n: number
  frames: Shapes[]
  keys: Frame[]
}

/** Samples per second of a move's keyframes (the compositor blends between them). */
const RATE = 30

/**
 * The gooey move, for anything that marks one selected thing in a row or grid (the tab pill,
 * chip groups, AM / PM, the clock's hour and minute boxes, toggles). It lives in a `layer`
 * under a goo filter and is a highlight shape plus blobs. On a move the highlight glides there
 * on one long, soft curve; the place it leaves swells into lumps that are drawn after it and
 * melt away; a puddle there is sucked thin; drops string out behind and catch up; and it lands
 * lumpy, blobs bulging past its edges and easing back in. When everything has finished it
 * comes to rest as an exact copy of the target shape. Sizes scale with the highlight's height
 * (designed at 48px); it works in any direction; Settings → Goo tunes it (gooConfig.ts).
 *
 * How it plays: the choreography is a GSAP timeline over plain numbers (`Shapes`), never run
 * live. It is sampled 30 times a second into keyframes of transform and opacity (the compositor
 * blends linearly between them, well under a pixel off the curve), and every element plays its
 * keyframes with the Web Animations API, which Chrome runs on the compositor: the motion stays
 * smooth while the main thread renders a screen, at whatever rate the display runs (120 Hz too).
 */
export class GooTrack {
  readonly layer: HTMLElement
  /** an empty box on the highlight's resting place (for measuring; the parts draw it) */
  private head: HTMLElement
  private els: HTMLElement[]
  cur: GooRect | null = null
  private shapes: Shapes
  // the motion playing now
  private frames: Shapes[] = []
  private anims: Animation[] = []
  private t0 = 0
  private timer = 0
  private resettle = false

  constructor(layer: HTMLElement) {
    this.layer = layer
    layer.classList.add('goo-track')
    const mk = (cls: string) => {
      const e = document.createElement('i')
      e.className = cls
      layer.appendChild(e)
      return e
    }
    const parts = (cls: string) => [mk(cls + ' gt-sq'), mk(cls + ' gt-sq'), mk(cls), mk(cls), mk(cls), mk(cls)]
    this.head = mk('gt-head')
    const origin = parts('gt-origin')
    const lumps = LUMP.map(() => mk('gt-blob'))
    const head = parts('gt-part')
    const trail = TRAIL.map(() => mk('gt-blob'))
    const bulges = BULGE.map(() => mk('gt-blob'))
    this.els = [...origin, ...lumps, ...head, ...trail, ...bulges, this.head]
    this.shapes = { head: box(), origin: box(), lumps: LUMP.map(blob), trail: TRAIL.map(blob), bulges: BULGE.map(blob) }
    this.draw(this.shapes)
  }

  private sizes(list: number[], r: GooRect, k = 1) {
    const s = Math.min(1.2, r.h / 48) * k
    const cap = Math.min(r.w, r.h)
    return list.map((x) => Math.min(cap, x * s))
  }

  /** Put every element at a still frame (no animation). */
  private draw(s: Shapes) {
    const f = frameOf(s)
    this.els.forEach((el, i) => {
      el.style.transform = f[i][0]
      el.style.opacity = String(f[i][1])
      el.style.visibility = f[i][1] > 0 ? '' : 'hidden'
    })
    const h = s.head
    this.head.style.borderRadius = `${num((h.r / Math.max(h.w, 1)) * SQ)}px / ${num((h.r / Math.max(h.h, 1)) * SQ)}px`
  }

  /** Where everything is right now (mid-motion too). Stops the motion there. */
  private now(): Shapes {
    if (this.frames.length) {
      const a = this.anims[0]
      const ms = a && typeof a.currentTime === 'number' ? a.currentTime : performance.now() - this.t0
      const i = Math.max(0, Math.min(this.frames.length - 1, Math.round((ms / 1000) * RATE)))
      this.shapes = copyShapes(this.frames[i])
    }
    this.stop()
    return copyShapes(this.shapes)
  }

  private stop() {
    clearTimeout(this.timer)
    if (this.anims.length) {
      // hold the current picture while the animations go (no flash back to the old inline styles)
      this.draw(this.shapes)
      this.anims.forEach((a) => a.cancel())
    }
    this.anims = []
    this.frames = []
  }

  /** Build a motion from `start` with `build` (a timeline over the numbers) and play it. */
  private play(start: Shapes, build: (tl: gsap.core.Timeline, s: Shapes) => void) {
    this.stop()
    this.run(this.compose(start, build))
  }

  /** Sample a motion into keyframes (the costly part; `run` only starts it). */
  private compose(start: Shapes, build: (tl: gsap.core.Timeline, s: Shapes) => void): Plan {
    const s = copyShapes(start)
    const tl = gsap.timeline({ paused: true })
    build(tl, s)
    const T = tl.duration()
    if (T <= 0) {
      tl.seek(1, false)
      tl.kill()
      return { start, T: 0, n: 0, frames: [copyShapes(s)], keys: [] }
    }
    const n = Math.ceil(T * RATE)
    const frames: Shapes[] = []
    const keys: Frame[] = []
    for (let k = 0; k <= n; k++) {
      tl.seek(Math.max(0.000001, Math.min(T, k / RATE)), false)
      frames.push(copyShapes(s))
      keys.push(frameOf(s))
    }
    tl.kill()
    return { start, T, n, frames, keys }
  }

  private run({ start, T, n, frames, keys }: Plan) {
    this.stop()
    if (T <= 0) {
      this.shapes = copyShapes(frames[0])
      return this.draw(this.shapes)
    }
    const last = frames[frames.length - 1]
    const ms = T * 1000
    this.draw(start)
    this.els.forEach((el, i) => {
      if (el === this.head) {
        // the measuring box goes straight to where the motion ends (nothing draws it)
        el.style.transform = keys[n][i][0]
        el.style.visibility = keys[n][i][1] > 0 ? '' : 'hidden'
        return
      }
      // each element animates only over the span where it changes, so fewer keyframes to build
      const same = (p: number, q: number) => keys[p][i][0] === keys[q][i][0] && keys[p][i][1] === keys[q][i][1]
      let a = 0
      while (a < n && same(a + 1, 0)) a++
      if (a === n) {
        const [tf, op] = keys[0][i]
        el.style.transform = tf
        el.style.opacity = String(op)
        el.style.visibility = op > 0 ? '' : 'hidden'
        return
      }
      let b = n
      while (b > a + 1 && same(b - 1, n)) b--
      const from = a / RATE
      const span = Math.min(T, b / RATE) - from
      let fades = false
      for (let k = a + 1; k <= b && !fades; k++) fades = keys[k][i][1] !== keys[a][i][1]
      const kf: Keyframe[] = []
      for (let k = a; k <= b; k++) {
        const f: Keyframe = { transform: keys[k][i][0], offset: Math.min(1, (k / RATE - from) / span) }
        if (fades) f.opacity = keys[k][i][1]
        kf.push(f)
      }
      el.style.visibility = ''
      if (!fades) el.style.opacity = String(keys[a][i][1])
      this.anims.push(el.animate(kf, { duration: span * 1000, delay: from * 1000, easing: 'linear', fill: 'both' }))
    })
    this.frames = frames
    this.shapes = last
    this.t0 = performance.now()
    this.timer = window.setTimeout(() => this.finish(), ms + 20)
  }

  private finish() {
    const last = this.frames[this.frames.length - 1]
    if (last) this.shapes = copyShapes(last)
    this.stop()
    this.draw(this.shapes)
    if (this.resettle) {
      this.resettle = false
      if (this.cur) this.glideTo(this.cur)
    }
  }

  /** The exact resting shape: the highlight on its target, the drops hidden inside it. */
  private restShapes(r: GooRect, s: Shapes) {
    Object.assign(s.head, { x: r.x, y: r.y, w: r.w, h: r.h, r: r.r ?? r.h / 2, scale: 1, alpha: 1 })
    const ts = this.sizes(TRAIL, r)
    s.trail.forEach((b, i) => Object.assign(b, { x: r.x + r.w / 2, y: r.y + r.h / 2, s: ts[i], scale: 1, alpha: 1 }))
    this.hideExtras(s)
  }

  /** The extras (lumps, puddle, bulges) hidden, so none is left stuck mid-motion. */
  private hideExtras(s: Shapes) {
    Object.assign(s.origin, { alpha: 0, scale: 0 })
    ;[...s.lumps, ...s.bulges].forEach((b) => Object.assign(b, { alpha: 0, scale: 0 }))
  }

  /** At `at` in the timeline: rest exactly on `r`. */
  private restAt(tl: gsap.core.Timeline, s: Shapes, r: GooRect, at: number) {
    const end = { head: box(), origin: box(), lumps: s.lumps.map(blob), trail: s.trail.map(blob), bulges: s.bulges.map(blob) }
    this.restShapes(r, end)
    tl.set(s.head, { ...end.head }, at)
    tl.set(s.origin, { alpha: 0, scale: 0 }, at)
    s.trail.forEach((b, i) => tl.set(b, { ...end.trail[i] }, at))
    ;[...s.lumps, ...s.bulges].forEach((b) => tl.set(b, { alpha: 0, scale: 0 }, at))
  }

  /** Put the highlight on `r` without animating (null hides it). */
  snap(r: GooRect | null) {
    this.resettle = false
    this.stop()
    this.cur = r
    const s = copyShapes(this.shapes)
    if (r) this.restShapes(r, s)
    else {
      s.head.alpha = 0
      s.trail.forEach((b) => (b.alpha = 0))
      this.hideExtras(s)
    }
    this.shapes = s
    this.draw(s)
  }

  /** The highlight is gone (nothing selected): it shrinks away. */
  hide() {
    if (!this.cur) return
    this.cur = null
    this.resettle = false
    if (gooReduced()) return this.snap(null)
    const s = this.now()
    this.hideExtras(s)
    this.play(s, (tl, st) => {
      tl.to([st.head, ...st.trail], { scale: 0, alpha: 0, duration: gt(0.45), ease: 'sine.inOut' }, 0)
    })
  }

  /** Something got selected where nothing was: it wells up there, lumpy, and settles. */
  appear(to: GooRect) {
    this.snap(to)
    if (gooReduced()) return
    const w = wobbleEase()
    this.play(this.shapes, (tl, st) => {
      tl.fromTo(st.head, { scale: 0.6 }, { scale: 1, duration: w.duration, ease: w.ease }, 0)
      tl.fromTo(st.trail, { scale: 0.4 }, { scale: 1, duration: gt(0.8), ease: 'sine.out' }, 0)
      this.land(tl, st, to, { x: 0, y: -1 }, 0)
      this.restAt(tl, st, to, w.duration + 0.1)
    })
  }

  /** A move to `to` worked out ahead (on a tap's pointer down), for `move(to)` to just start. */
  private ready: { from: GooRect; to: GooRect; plan: Plan } | null = null

  /** Work out the move to `to` now, so the tap that follows only has to start it. Only from rest. */
  prepare(to: GooRect) {
    this.ready = null
    const f = this.cur
    if (!f || this.frames.length || gooReduced()) return
    this.ready = { from: f, to, plan: this.planMove(f, copyShapes(this.shapes), to) }
  }

  /** Glide, goo and all, from where it is to `to`. */
  move(to: GooRect) {
    const f = this.cur
    const ready = this.ready
    this.ready = null
    if (!f) return this.appear(to)
    if (gooReduced()) return this.snap(to)
    this.resettle = false
    const same = (p: GooRect, q: GooRect) => p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h && p.r === q.r
    if (ready && ready.from === f && !this.frames.length && same(ready.to, to)) {
      this.cur = to
      return this.run(ready.plan)
    }
    this.cur = to
    this.run(this.planMove(f, this.now(), to))
  }

  private planMove(f: GooRect, s: Shapes, to: GooRect): Plan {
    this.hideExtras(s)
    // where the highlight really is right now (it may be mid-glide)
    const from: GooRect = { x: s.head.x, y: s.head.y, w: s.head.w || f.w, h: s.head.h || f.h, r: f.r }
    const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
    const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
    const dist = Math.hypot(tc.x - fc.x, tc.y - fc.y) || 1
    const u = { x: (tc.x - fc.x) / dist, y: (tc.y - fc.y) / dist }
    const n = { x: -u.y, y: u.x }
    const along = (r: GooRect) => Math.abs(u.x) * r.w + Math.abs(u.y) * r.h
    const k = Math.min(1.2, Math.min(from.h, to.h) / 48)
    const L = goo.lumps
    const T = goo.trail
    const E = eases()
    const glide = gt(E.seconds)
    const w = wobbleEase()

    return this.compose(s, (tl, st) => {
      // 1. The highlight glides there on one long, soft curve.
      tl.to(st.head, { x: to.x, y: to.y, duration: glide, ease: E.move }, 0)
      tl.to(st.head, { w: to.w, h: to.h, r: to.r ?? to.h / 2, duration: glide * 0.85, ease: E.size }, 0)
      // (back to full size if a move interrupted it welling up or shrinking away)
      if (st.head.scale !== 1 || st.head.alpha !== 1) tl.to(st.head, { scale: 1, alpha: 1, duration: gt(0.3), ease: 'sine.out' }, 0)

      if (L > 0.02) {
        // 2. A puddle stays where it was and is drawn thin towards where it went.
        const horizontal = Math.abs(u.x) >= Math.abs(u.y)
        const stub = 22 * k
        const sw = horizontal ? stub : from.w
        const sh = horizontal ? from.h : stub
        const lead = { x: fc.x + u.x * (along(from) / 2 - stub / 2), y: fc.y + u.y * (along(from) / 2 - stub / 2) }
        tl.set(st.origin, { x: from.x, y: from.y, w: from.w, h: from.h, r: from.r ?? from.h / 2, scale: 1, alpha: 1 }, 0)
        tl.to(st.origin, { x: lead.x - sw / 2, y: lead.y - sh / 2, w: sw, h: sh, duration: gt(0.55), ease: 'sine.inOut' }, 0)
        tl.to(st.origin, { scale: 0, duration: gt(0.55), ease: 'sine.in' }, gt(0.12))
        tl.set(st.origin, { alpha: 0 }, gt(0.67))

        // 3. The place it leaves swells into lumps, drawn after it and melting away.
        const ls = this.sizes(LUMP, from, Math.min(1.4, 0.4 + 0.6 * L))
        st.lumps.forEach((b, i) => {
          const a = ((i - 1) * along(from) * 0.28 + (Math.random() - 0.5) * 8 * k) * L
          const c = (i % 2 ? 1 : -1) * (6 + Math.random() * 5) * k * L
          const moveAt = gt(0.16 + i * 0.05)
          const moveFor = gt(0.7 + i * 0.06)
          const meltAt = gt(0.24 + i * 0.05)
          const meltFor = gt(0.6 + i * 0.06)
          tl.set(b, { x: fc.x, y: fc.y, s: ls[i], scale: 0.5, alpha: 1 }, 0)
          tl.to(b, { x: fc.x + u.x * a + n.x * c, y: fc.y + u.y * a + n.y * c, scale: 1.08, duration: gt(0.3), ease: 'sine.out' }, 0)
          tl.to(b, { x: tc.x, y: tc.y, duration: moveFor, ease: 'sine.inOut' }, moveAt)
          tl.to(b, { scale: 0, duration: meltFor, ease: 'sine.inOut' }, meltAt)
          tl.set(b, { alpha: 0 }, Math.max(moveAt + moveFor, meltAt + meltFor))
        })
      }

      // 4. Drops string out behind it on the same curve and catch up.
      const ts = this.sizes(TRAIL, to)
      st.trail.forEach((b, i) => {
        if (b.alpha !== 1) tl.set(b, { alpha: 1 }, 0)
        tl.to(b, { x: tc.x, y: tc.y, s: ts[i], duration: glide + gt(i * 0.06 * T), ease: E.move }, gt((0.03 + i * 0.035) * T))
        tl.fromTo(b, { scale: 1 }, { scale: 1 - (0.25 + i * 0.1) * Math.min(T, 1.5), duration: gt(0.45), ease: 'sine.inOut', yoyo: true, repeat: 1 }, gt(i * 0.035 * T))
      })

      // 5. It lands lumpy, then rests as an exact copy of the target.
      // bulge as it arrives: with a dramatic curve that is well into the glide
      const landAt = glide * (0.3 + 0.12 * Math.min(2, goo.drama))
      if (L > 0.02) this.land(tl, st, to, u, landAt)
      this.restAt(tl, st, to, Math.max(glide + gt(0.06 * 4 * T + 0.18 * T), landAt + gt(0.3 + 0.1) + w.duration) + 0.05)
    })
  }

  /** Blobs bulge out past the highlight's edges, then ease softly back in. */
  private land(tl: gsap.core.Timeline, st: Shapes, to: GooRect, u: { x: number; y: number }, delay: number) {
    const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
    const n = { x: -u.y, y: u.x }
    const along = Math.abs(u.x) * to.w + Math.abs(u.y) * to.h
    const across = Math.abs(n.x) * to.w + Math.abs(n.y) * to.h
    const k = Math.min(1.2, to.h / 48)
    const L = goo.lumps
    const bs = this.sizes(BULGE, to, Math.min(1.4, 0.4 + 0.6 * L))
    const w = wobbleEase()
    st.bulges.forEach((b, i) => {
      const a = ((i - 1) * along * 0.3 + 6 * k) * Math.min(L, 1.5)
      const c = (i % 2 ? 1 : -1) * (across * 0.32 + Math.random() * 5 * k) * L
      const at = delay + gt(i * 0.06)
      tl.set(b, { x: tc.x - u.x * 18 * k, y: tc.y - u.y * 18 * k, s: bs[i], scale: 0.4, alpha: 1 }, at)
      tl.to(b, { x: tc.x + u.x * a + n.x * c, y: tc.y + u.y * a + n.y * c, scale: 1.05, duration: gt(0.34), ease: 'sine.out' }, at)
      tl.to(b, { x: tc.x + u.x * a * 0.3, y: tc.y + u.y * a * 0.3, scale: 0.6, duration: w.duration, ease: w.ease }, at + gt(0.34))
      tl.set(b, { alpha: 0 }, at + gt(0.34) + w.duration)
    })
  }

  /** Slide the resting highlight onto `to` (its target moved). */
  private glideTo(to: GooRect) {
    const s = this.now()
    const h = s.head
    if (Math.abs(h.x - to.x) + Math.abs(h.y - to.y) + Math.abs(h.w - to.w) + Math.abs(h.h - to.h) < 0.5) return
    const E = eases()
    this.play(s, (tl, st) => {
      tl.to(st.head, { x: to.x, y: to.y, w: to.w, h: to.h, r: to.r ?? to.h / 2, duration: gt(0.45), ease: E.size }, 0)
      st.trail.forEach((b) => tl.to(b, { x: to.x + to.w / 2, y: to.y + to.h / 2, duration: gt(0.45), ease: E.size }, 0))
      this.restAt(tl, st, to, gt(0.45))
    })
  }

  /** The target moved under it (layout change): slide onto it once any move has finished. */
  settle(to: GooRect | null) {
    if (!to) return this.snap(null)
    if (!this.cur || gooReduced()) return this.snap(to)
    const same = this.cur.x === to.x && this.cur.y === to.y && this.cur.w === to.w && this.cur.h === to.h
    this.cur = to
    // nothing moved: leave the glide alone (it rests on its own when it finishes)
    if (same) return
    if (this.frames.length) this.resettle = true
    else this.glideTo(to)
  }

  kill() {
    this.resettle = false
    this.stop()
  }
}

/** Starts the tab pill moving the moment a tab is tapped (set by TabGoo). */
let tabGooTo: ((index: number) => void) | null = null
export const gooTab = (index: number) => tabGooTo?.(index)

/** The lime pill under the tab bar: a GooTrack aimed at the active tab. */
export function TabGoo({ index }: { index: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const track = useRef<GooTrack | null>(null)
  const heading = useRef(-1)
  useLayoutEffect(() => {
    const layer = ref.current
    const nav = layer?.parentElement
    if (!layer || !nav) return
    const t = (track.current ||= new GooTrack(layer))
    const tabs = () => Array.from(nav.querySelectorAll<HTMLElement>('.tab'))
    const H = 48
    const measured = (i: number): GooRect | null => {
      const tab = tabs()[i]
      return tab ? { x: tab.offsetLeft, y: 0, w: tab.offsetWidth, h: H } : null
    }
    // Where tab `to` will sit once it's the active one, worked out before the app re-renders:
    // the active tab loses its label and 4px of padding each side, the new one gains them.
    const predicted = (to: number): GooRect | null => {
      const ts = tabs()
      const cur = ts.findIndex((x) => x.classList.contains('on'))
      if (cur < 0 || !ts[to]) return measured(to)
      const gap = parseFloat(getComputedStyle(nav).columnGap) || 0
      const label = (x: HTMLElement) => (x.querySelector<HTMLElement>('.tab-label')?.scrollWidth || 0) + 16
      const widths = ts.map((x, i) => x.offsetWidth - (i === cur ? label(x) : 0) + (i === to ? label(x) : 0))
      let x = ts[0].offsetLeft
      for (let i = 0; i < to; i++) x += widths[i] + gap
      return { x, y: 0, w: widths[to], h: H }
    }
    const go = (to: number) => {
      const r = predicted(to)
      if (!r) return
      heading.current = to
      t.move(r)
    }
    tabGooTo = (to: number) => to !== heading.current && go(to)
    if (heading.current < 0) {
      t.snap(measured(index))
      heading.current = index
    } else if (heading.current !== index) go(index)
    // Follows the tabs' sizes. No measuring here: reading layout in the middle of a screen
    // change forces it early; the observer reports once layout is done anyway (and once on start).
    const follow = () => t.settle(measured(index))
    const ro = new ResizeObserver(follow)
    ro.observe(nav)
    tabs().forEach((el) => ro.observe(el))
    // A finger on a tab: work the glide out now, so the tap only has to start it.
    const down = (e: PointerEvent) => {
      const tab = e.target instanceof Element ? e.target.closest<HTMLElement>('.tab') : null
      const i = tab ? tabs().indexOf(tab) : -1
      const r = i >= 0 && i !== heading.current ? predicted(i) : null
      if (r) t.prepare(r)
    }
    nav.addEventListener('pointerdown', down)
    return () => {
      ro.disconnect()
      nav.removeEventListener('pointerdown', down)
    }
  }, [index])
  useEffect(
    () => () => {
      tabGooTo = null
      track.current?.kill()
    },
    [],
  )
  return <span class="tab-goo" aria-hidden="true" ref={ref} />
}

// ---- goo groups ------------------------------------------------------------------------
// Any container with `data-goo` whose direct children are options (one has `.on`) gets a
// GooTrack behind its options: the selection travels between them like the tab pill. The
// options' own backgrounds move to a ::before under the goo, and their text stays on top.

interface Group {
  track: GooTrack
  on: HTMLElement | null
  /** tapped and already moving there, before the app marks it `.on` */
  picked: HTMLElement | null
  ro: ResizeObserver
}
const groups = new Map<HTMLElement, Group>()
const OPTION = ':scope > :is(button, .chip, .proto-custom, .swatch)'

const rectOf = (el: HTMLElement): GooRect => {
  const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, r: Math.min(r, el.offsetHeight / 2) }
}

/** Colours of a selected and an unselected option, read with the goo styles briefly off (no paint in between). */
function paint(c: HTMLElement, on: HTMLElement | null) {
  // goo-measure turns transitions off, or we'd read the start of a background transition
  c.classList.add('goo-measure')
  c.classList.remove('goo-ready')
  const off = Array.from(c.querySelectorAll<HTMLElement>(OPTION)).find((x) => !x.classList.contains('on'))
  const onBg = on ? getComputedStyle(on).backgroundColor : ''
  const offBg = off ? getComputedStyle(off).backgroundColor : 'transparent'
  c.classList.add('goo-ready')
  void c.offsetWidth
  c.classList.remove('goo-measure')
  if (onBg) c.style.setProperty('--goo-c', onBg)
  c.style.setProperty('--goo-off', offBg)
}

/** In a scrolling row the layer spans the whole scroll area, not just the visible part. */
function fit(c: HTMLElement, layer: HTMLElement) {
  const wide = c.scrollWidth > c.clientWidth + 1
  const tall = c.scrollHeight > c.clientHeight + 1
  layer.style.right = wide ? 'auto' : ''
  layer.style.width = wide ? `${c.scrollWidth}px` : ''
  layer.style.bottom = tall ? 'auto' : ''
  layer.style.height = tall ? `${c.scrollHeight}px` : ''
}

function initGroup(c: HTMLElement) {
  // a screen's copy fading out during a screen change (router.ts) is a picture, not a control
  if (groups.has(c) || c.closest('.screen-ghost')) return
  const layer = document.createElement('span')
  layer.setAttribute('aria-hidden', 'true')
  c.prepend(layer)
  fit(c, layer)
  const track = new GooTrack(layer)
  const on = c.querySelector<HTMLElement>(':scope > .on')
  paint(c, on)
  track.snap(on ? rectOf(on) : null)
  const ro = new ResizeObserver(() => {
    const g = groups.get(c)
    if (!g) return
    if (!c.isConnected) return dropGroup(c)
    fit(c, g.track.layer)
    g.track.settle(g.on && g.on.isConnected ? rectOf(g.on) : null)
  })
  ro.observe(c)
  groups.set(c, { track, on, picked: null, ro })
}

function dropGroup(c: HTMLElement) {
  const g = groups.get(c)
  if (!g) return
  g.ro.disconnect()
  g.track.kill()
  groups.delete(c)
}

function updateGroup(c: HTMLElement) {
  const g = groups.get(c)
  if (!g) return initGroup(c)
  const on = c.querySelector<HTMLElement>(':scope > .on')
  if (on === g.on) return
  g.on = on
  fit(c, g.track.layer)
  paint(c, on)
  if (g.picked && on === g.picked) return void (g.picked = null) // already on its way
  g.picked = null
  if (on) g.track.move(rectOf(on))
  else g.track.hide()
}

/** A tap on option `opt`: move the goo there straight away (the class change catches up). */
function gooPick(c: HTMLElement, opt: HTMLElement) {
  // tapped before its idle-time setup (see `later`): set it up now
  if (!groups.has(c) && waiting.has(c)) {
    waiting.delete(c)
    initGroup(c)
  }
  const g = groups.get(c)
  if (!g || opt.classList.contains('on') || g.picked === opt) return
  g.picked = opt
  // take the colour from the option being left (or the last one used); the real one is read on re-render
  g.track.move(rectOf(opt))
}

/** Re-read every goo group's colours (after a theme or accent change). */
export function repaintGoo() {
  groups.forEach((g, c) => paint(c, g.on))
}

// A new screen's groups are set up once the screen change is over (when the browser is idle):
// setting one up reads styles and layout, which would add to the frame that draws the screen.
// Until then each option shows its own selected background, which looks the same at rest.
const waiting = new Set<HTMLElement>()
let waitHandle = 0
function later(c: HTMLElement) {
  waiting.add(c)
  if (waitHandle) return
  const run = () => {
    waitHandle = 0
    const list = Array.from(waiting)
    waiting.clear()
    list.forEach((x) => x.isConnected && !groups.has(x) && !x.closest('.screen-ghost') && initGroup(x))
  }
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  waitHandle = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 700 }) : window.setTimeout(run, 300)
}

function watchGroups() {
  document.querySelectorAll<HTMLElement>('[data-goo]').forEach(initGroup)
  const mo = new MutationObserver((list) => {
    const touched = new Set<HTMLElement>()
    for (const m of list) {
      if (m.type === 'attributes') {
        const p = (m.target as HTMLElement).parentElement
        if (p?.hasAttribute('data-goo')) touched.add(p)
      } else {
        const t = m.target as HTMLElement
        if (t.hasAttribute?.('data-goo')) touched.add(t)
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return
          if (n.hasAttribute('data-goo')) touched.add(n)
          n.querySelectorAll<HTMLElement>('[data-goo]').forEach((x) => touched.add(x))
        })
        m.removedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return
          for (const c of groups.keys()) if (!c.isConnected && (n === c || n.contains(c))) dropGroup(c)
        })
      }
    }
    touched.forEach((c) => {
      if (!c.isConnected || c.closest('.screen-ghost')) return
      if (groups.has(c)) updateGroup(c)
      else later(c)
    })
  })
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  // colours follow the theme
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const repaint = repaintGoo
  mq.addEventListener?.('change', repaint)
  return () => {
    mo.disconnect()
    mq.removeEventListener?.('change', repaint)
    groups.forEach((_, c) => dropGroup(c))
  }
}

// Fixed per index so motes don't jump when the tab bar re-renders.
const MOTES = [
  { x: 14, sz: 4, dur: 3.2, delay: 0, drift: -6, rise: 22 },
  { x: 38, sz: 5.5, dur: 4.1, delay: 1.3, drift: 5, rise: 30 },
  { x: 62, sz: 3.5, dur: 2.8, delay: 0.6, drift: -3, rise: 18 },
  { x: 83, sz: 5, dur: 3.7, delay: 2.1, drift: 7, rise: 26 },
  { x: 50, sz: 3, dur: 3.4, delay: 2.9, drift: 2, rise: 34 },
]

/** Tiny particles that keep rising off the top of the active tab's pill. */
export function Motes() {
  return (
    <span class="motes" aria-hidden="true">
      {MOTES.map((m) => (
        <i style={{ '--x': `${m.x}%`, '--sz': `${m.sz}px`, '--dur': `${m.dur}s`, '--delay': `${m.delay}s`, '--drift': `${m.drift}px`, '--rise': `${m.rise}px` }} />
      ))}
    </span>
  )
}

const EDGE = 60 // where the sheet's top edge is inside the jelly layer

/**
 * A sheet's top edge as jelly: as it lands, blobs well up out of the edge (the strip under
 * them is the sheet's own top, so they bridge to it like liquid) and wobble back in.
 */
export function SheetJelly({ go }: { go: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !go || gooReduced() || goo.lumps <= 0.02) return
    const W = el.offsetWidth
    const blobs = Array.from(el.querySelectorAll<HTMLElement>('i'))
    const w = wobbleEase()
    const L = goo.lumps
    const tl = gsap.timeline({ delay: gt(0.16) })
    blobs.forEach((b, i) => {
      const x = W * (0.12 + i * 0.19) + (Math.random() - 0.5) * 24
      const s = (40 + Math.random() * 30) * Math.min(1.4, 0.5 + 0.5 * L)
      const up = (12 + Math.random() * 14) * L
      tl.set(b, { x, y: EDGE + s * 0.3, width: s, height: s, xPercent: -50, yPercent: -50, scale: 0.5, autoAlpha: 1 }, 0)
        .to(b, { y: EDGE - up, scale: 1, duration: gt(0.34), ease: 'sine.out' }, gt(i * 0.05))
        .to(b, { y: EDGE + s * 0.55, scale: 0.6, duration: w.duration, ease: w.ease }, gt(0.34 + i * 0.05))
        .set(b, { autoAlpha: 0 })
    })
    return () => {
      tl.kill()
      gsap.set(blobs, { autoAlpha: 0 })
    }
  }, [go])
  return (
    <span class="sheet-jelly" ref={ref} aria-hidden="true">
      <b />
      {[0, 1, 2, 3, 4].map(() => (
        <i />
      ))}
    </span>
  )
}
