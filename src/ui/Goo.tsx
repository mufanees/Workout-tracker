// The gooey layer: an SVG "metaball" filter (blur, then a hard alpha cut, so nearby blobs melt
// into one liquid shape) and the small pieces that use it. Everything here is decoration:
// it's hidden from screen readers and switched off for people who prefer reduced motion.
import { gsap } from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
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
        <filter id="goo-merge-sm" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
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
const SKIP = '.check, [data-no-goo], input, textarea, select'
let live = 0

function onTap(e: MouseEvent) {
  // An option in a goo group: start its goo now rather than after the app re-renders. It has
  // its own goo, so no droplets.
  const opt = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-goo] > :is(button, .chip, .proto-custom)') : null
  if (opt && !(opt as HTMLButtonElement).disabled && opt.parentElement) return gooPick(opt.parentElement, opt)
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
  if (reduced() || live >= 4) return
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
  if (!el || !host || reduced()) return
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
    if (!drops.length || reduced()) return
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
// The tab pill's curves. A short ramp-up (so it doesn't jerk off the mark) into a long, soft
// deceleration. The move overshoots ~5% and eases back so the pill settles instead of stopping
// dead; its size doesn't overshoot, so the shape stays a pill.
const GOO_MOVE = CustomEase.create('goo-move', 'M0,0 C0.3,0 0.1,1.08 0.62,1.045 0.86,1.028 0.9,1 1,1')
const GOO_SIZE = CustomEase.create('goo-size', 'M0,0 C0.3,0 0.12,1 1,1')
export const gooEase = { move: GOO_MOVE, size: GOO_SIZE }
export const gooReduced = () => reduced()

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

/**
 * The gooey move, for anything that marks one selected thing in a row or grid (the tab pill,
 * chip groups, AM / PM, the clock's hour and minute boxes). It lives in a `layer` under a goo
 * filter and is a highlight shape plus blobs. On a move the highlight launches at once and
 * glides (CustomEase with a small overshoot); the place it leaves swells into lumps that are
 * pulled after it and thin away; a puddle there is sucked thin; drops string out behind and
 * catch up; and it lands lumpy, blobs bulging past its edges and wobbling back in. Sizes scale
 * with the highlight's height (designed at 48px), and it works in any direction.
 */
export class GooTrack {
  readonly layer: HTMLElement
  private head: HTMLElement
  private origin: HTMLElement
  private lumps: HTMLElement[]
  private trail: HTMLElement[]
  private bulges: HTMLElement[]
  cur: GooRect | null = null
  private raf = 0

  constructor(layer: HTMLElement) {
    this.layer = layer
    layer.classList.add('goo-track')
    const mk = (cls: string) => {
      const e = document.createElement('i')
      e.className = cls
      layer.appendChild(e)
      return e
    }
    this.origin = mk('gt-origin')
    this.lumps = LUMP.map(() => mk('gt-blob'))
    this.head = mk('gt-head')
    this.trail = TRAIL.map(() => mk('gt-blob'))
    this.bulges = BULGE.map(() => mk('gt-blob'))
    gsap.set([this.origin, this.head, ...this.lumps, ...this.trail, ...this.bulges], { autoAlpha: 0 })
    gsap.set([...this.lumps, ...this.trail, ...this.bulges], { xPercent: -50, yPercent: -50 })
  }

  private all() {
    return [this.head, this.origin, ...this.lumps, ...this.trail, ...this.bulges]
  }

  private sizes(list: number[], r: GooRect) {
    const k = Math.min(1.2, r.h / 48)
    const cap = Math.min(r.w, r.h)
    return list.map((s) => Math.min(cap, s * k))
  }

  /** Put the highlight on `r` without animating (null hides it). */
  snap(r: GooRect | null) {
    cancelAnimationFrame(this.raf)
    gsap.killTweensOf(this.all())
    this.cur = r
    gsap.set([this.origin, ...this.lumps, ...this.bulges], { autoAlpha: 0 })
    if (!r) return gsap.set([this.head, ...this.trail], { autoAlpha: 0 })
    gsap.set(this.head, { x: r.x, y: r.y, width: r.w, height: r.h, borderRadius: r.r ?? r.h / 2, scale: 1, autoAlpha: 1 })
    const ts = this.sizes(TRAIL, r)
    this.trail.forEach((el, i) => gsap.set(el, { x: r.x + r.w / 2, y: r.y + r.h / 2, width: ts[i], height: ts[i], scale: 1, autoAlpha: 1 }))
  }

  /** The highlight is gone (nothing selected): it shrinks away. */
  hide() {
    if (!this.cur) return
    this.cur = null
    if (reduced()) return this.snap(null)
    gsap.to([this.head, ...this.trail], { scale: 0, autoAlpha: 0, duration: 0.32, ease: 'sine.in', overwrite: 'auto' })
  }

  /** Something got selected where nothing was: it wells up there, lumpy, and settles. */
  appear(to: GooRect) {
    this.snap(to)
    if (reduced()) return
    gsap.fromTo(this.head, { scale: 0.55 }, { scale: 1, duration: 0.8, ease: 'elastic.out(1, 0.5)' })
    gsap.fromTo(this.trail, { scale: 0.4 }, { scale: 1, duration: 0.6, ease: 'sine.out' })
    this.land(to, { x: 0, y: -1 }, 0)
  }

  /** Glide, goo and all, from where it is to `to`. */
  move(to: GooRect) {
    const f = this.cur
    if (!f) return this.appear(to)
    if (reduced()) return this.snap(to)
    this.cur = to
    cancelAnimationFrame(this.raf)
    const fc = { x: f.x + f.w / 2, y: f.y + f.h / 2 }
    const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
    const dist = Math.hypot(tc.x - fc.x, tc.y - fc.y) || 1
    const u = { x: (tc.x - fc.x) / dist, y: (tc.y - fc.y) / dist }
    const n = { x: -u.y, y: u.x }
    const along = (r: GooRect) => Math.abs(u.x) * r.w + Math.abs(u.y) * r.h
    const k = Math.min(1.2, Math.min(f.h, to.h) / 48)
    gsap.killTweensOf([this.origin, ...this.lumps, ...this.bulges])

    // 1. The highlight launches at once, glides, overshoots a touch and settles.
    gsap.to(this.head, { x: to.x, y: to.y, duration: 0.75, ease: GOO_MOVE, overwrite: 'auto' })
    gsap.to(this.head, { width: to.w, height: to.h, borderRadius: to.r ?? to.h / 2, duration: 0.6, ease: GOO_SIZE })

    // 2. A puddle stays where it was and is sucked thin towards where it went.
    const horizontal = Math.abs(u.x) >= Math.abs(u.y)
    const stub = 22 * k
    const sw = horizontal ? stub : f.w
    const sh = horizontal ? f.h : stub
    const lead = { x: fc.x + u.x * (along(f) / 2 - stub / 2), y: fc.y + u.y * (along(f) / 2 - stub / 2) }
    gsap.set(this.origin, { x: f.x, y: f.y, width: f.w, height: f.h, borderRadius: f.r ?? f.h / 2, scale: 1, autoAlpha: 1 })
    gsap.to(this.origin, { x: lead.x - sw / 2, y: lead.y - sh / 2, width: sw, height: sh, duration: 0.4, ease: 'power2.inOut' })
    gsap.to(this.origin, { scale: 0, duration: 0.42, delay: 0.08, ease: 'sine.in' })

    // 3. The place it leaves swells into lumps, drawn after it and melting away.
    const ls = this.sizes(LUMP, f)
    this.lumps.forEach((el, i) => {
      const a = (i - 1) * along(f) * 0.28 + (Math.random() - 0.5) * 8 * k
      const b = (i % 2 ? 1 : -1) * (6 + Math.random() * 5) * k
      gsap
        .timeline()
        .set(el, { x: fc.x, y: fc.y, width: ls[i], height: ls[i], scale: 0.5, autoAlpha: 1 })
        .to(el, { x: fc.x + u.x * a + n.x * b, y: fc.y + u.y * a + n.y * b, scale: 1.1, duration: 0.22, ease: 'sine.out' })
        .to(el, { x: tc.x, y: tc.y, duration: 0.5 + i * 0.05, ease: 'power2.inOut' }, 0.14 + i * 0.04)
        .to(el, { scale: 0, duration: 0.42 + i * 0.05, ease: 'sine.inOut' }, 0.2 + i * 0.04)
        .set(el, { autoAlpha: 0 })
    })

    // 4. Drops string out behind it on the same curve and catch up.
    const ts = this.sizes(TRAIL, to)
    this.trail.forEach((el, i) => {
      gsap.to(el, { x: tc.x, y: tc.y, width: ts[i], height: ts[i], duration: 0.75 + i * 0.05, delay: 0.03 + i * 0.03, ease: GOO_MOVE, overwrite: 'auto' })
      gsap.fromTo(el, { scale: 1 }, { scale: 0.75 - i * 0.1, duration: 0.35, delay: i * 0.03, ease: 'sine.inOut', yoyo: true, repeat: 1 })
    })

    // 5. It lands lumpy.
    this.land(to, u, 0.16)
  }

  /** Blobs bulge out past the highlight's edges, then wobble softly back in as it settles. */
  private land(to: GooRect, u: { x: number; y: number }, delay: number) {
    const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
    const n = { x: -u.y, y: u.x }
    const along = Math.abs(u.x) * to.w + Math.abs(u.y) * to.h
    const across = Math.abs(n.x) * to.w + Math.abs(n.y) * to.h
    const k = Math.min(1.2, to.h / 48)
    const bs = this.sizes(BULGE, to)
    this.bulges.forEach((el, i) => {
      const a = (i - 1) * along * 0.3 + 6 * k
      const b = (i % 2 ? 1 : -1) * (across * 0.4 + Math.random() * 5 * k)
      gsap
        .timeline({ delay: delay + i * 0.05 })
        .set(el, { x: tc.x - u.x * 18 * k, y: tc.y - u.y * 18 * k, width: bs[i], height: bs[i], scale: 0.4, autoAlpha: 1 })
        .to(el, { x: tc.x + u.x * a + n.x * b, y: tc.y + u.y * a + n.y * b, scale: 1.1, duration: 0.24, ease: 'sine.out' })
        .to(el, { x: tc.x + u.x * a * 0.35, y: tc.y + u.y * a * 0.35, scale: 0.65, duration: 1.1, ease: 'elastic.out(0.9, 0.55)' })
        .set(el, { autoAlpha: 0 })
    })
  }

  /** The target moved under it (layout change): slide onto it once any move has finished. */
  settle(to: GooRect | null) {
    cancelAnimationFrame(this.raf)
    if (!to) return this.snap(null)
    if (!this.cur || reduced()) return this.snap(to)
    this.cur = to
    const go = () => {
      if (gsap.isTweening(this.head)) return void (this.raf = requestAnimationFrame(go))
      const x = Number(gsap.getProperty(this.head, 'x'))
      const y = Number(gsap.getProperty(this.head, 'y'))
      const w = Number(gsap.getProperty(this.head, 'width'))
      const h = Number(gsap.getProperty(this.head, 'height'))
      if (Math.abs(x - to.x) + Math.abs(y - to.y) + Math.abs(w - to.w) + Math.abs(h - to.h) < 0.5) return
      gsap.to(this.head, { x: to.x, y: to.y, width: to.w, height: to.h, borderRadius: to.r ?? to.h / 2, duration: 0.22, ease: 'power2.out', overwrite: 'auto' })
      this.trail.forEach((el) => gsap.to(el, { x: to.x + to.w / 2, y: to.y + to.h / 2, duration: 0.22, ease: 'power2.out' }))
    }
    go()
  }

  kill() {
    cancelAnimationFrame(this.raf)
    gsap.killTweensOf(this.all())
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
    const follow = () => t.settle(measured(index))
    follow()
    const ro = new ResizeObserver(follow)
    ro.observe(nav)
    tabs().forEach((el) => ro.observe(el))
    return () => ro.disconnect()
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
const OPTION = ':scope > :is(button, .chip, .proto-custom)'

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

function initGroup(c: HTMLElement) {
  if (groups.has(c)) return
  const layer = document.createElement('span')
  layer.setAttribute('aria-hidden', 'true')
  c.prepend(layer)
  const track = new GooTrack(layer)
  const on = c.querySelector<HTMLElement>(':scope > .on')
  paint(c, on)
  track.snap(on ? rectOf(on) : null)
  const ro = new ResizeObserver(() => {
    const g = groups.get(c)
    if (!g) return
    if (!c.isConnected) return dropGroup(c)
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
  paint(c, on)
  if (g.picked && on === g.picked) return void (g.picked = null) // already on its way
  g.picked = null
  if (on) g.track.move(rectOf(on))
  else g.track.hide()
}

/** A tap on option `opt`: move the goo there straight away (the class change catches up). */
function gooPick(c: HTMLElement, opt: HTMLElement) {
  const g = groups.get(c)
  if (!g || opt.classList.contains('on') || g.picked === opt) return
  g.picked = opt
  // take the colour from the option being left (or the last one used); the real one is read on re-render
  g.track.move(rectOf(opt))
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
    touched.forEach((c) => c.isConnected && updateGroup(c))
  })
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
  // colours follow the theme
  const mq = matchMedia('(prefers-color-scheme: dark)')
  const repaint = () => groups.forEach((g, c) => paint(c, g.on))
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
