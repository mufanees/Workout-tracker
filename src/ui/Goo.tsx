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
    return () => document.removeEventListener('click', onTap, true)
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

/** Starts the tab pill moving the moment a tab is tapped (set by TabGoo). */
let tabGooTo: ((index: number) => void) | null = null
export const gooTab = (index: number) => tabGooTo?.(index)

// Blobs that make the goo lumpy: three at the tab being left, three that bulge out of the pill
// where it lands. Sizes in px.
const ORIGIN = [30, 24, 18]
const BULGE = [30, 24, 20]

/**
 * The lime pill under the tab bar: a pill plus blobs inside one goo filter (blur, alpha cut,
 * crisp shapes merged back on top), moved by GSAP. On a switch the pill launches at once; the
 * tab it leaves bulges into lumps that are pulled after it, drops string out behind and get
 * absorbed, and the pill lands lumpy and wobbles back into shape.
 */
export function TabGoo({ index }: { index: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)
  const heading = useRef(-1)
  useLayoutEffect(() => {
    const layer = ref.current
    const nav = layer?.parentElement
    if (!layer || !nav) return
    const q = <T extends Element>(sel: string) => Array.from(layer.querySelectorAll<HTMLElement>(sel)) as unknown as T[]
    const head = layer.querySelector<HTMLElement>('.tg-head')!
    const origin = layer.querySelector<HTMLElement>('.tg-origin')!
    const trail = q<HTMLElement>('.tg-trail')
    const lumps = q<HTMLElement>('.tg-lump')
    const bulges = q<HTMLElement>('.tg-bulge')
    const tabs = () => Array.from(nav.querySelectorAll<HTMLElement>('.tab'))
    const measured = (i: number) => {
      const tab = tabs()[i]
      return tab ? { x: tab.offsetLeft, w: tab.offsetWidth } : null
    }
    // Where tab `to` will sit once it's the active one, worked out before the app re-renders:
    // the active tab loses its label and 4px of padding each side, the new one gains them.
    const predicted = (to: number) => {
      const ts = tabs()
      const cur = ts.findIndex((t) => t.classList.contains('on'))
      if (cur < 0 || !ts[to]) return measured(to)
      const gap = parseFloat(getComputedStyle(nav).columnGap) || 0
      const label = (t: HTMLElement) => (t.querySelector<HTMLElement>('.tab-label')?.scrollWidth || 0) + 16
      const widths = ts.map((t, i) => t.offsetWidth - (i === cur ? label(t) : 0) + (i === to ? label(t) : 0))
      let x = ts[0].offsetLeft
      for (let i = 0; i < to; i++) x += widths[i] + gap
      return { x, w: widths[to] }
    }
    const hideExtras = () => gsap.set([origin, ...lumps, ...bulges], { autoAlpha: 0, scale: 0 })
    const snap = (t: { x: number; w: number }) => {
      gsap.killTweensOf([head, origin, ...trail, ...lumps, ...bulges])
      gsap.set(head, { x: t.x, width: t.w })
      gsap.set(trail, { x: t.x + t.w / 2, scale: 1 })
      hideExtras()
    }
    const go = (to: number) => {
      const t = predicted(to)
      if (!t) return
      heading.current = to
      if (reduced()) return snap(t)
      const fx = Number(gsap.getProperty(head, 'x'))
      const fw = Number(gsap.getProperty(head, 'width'))
      const fcx = fx + fw / 2
      const tcx = t.x + t.w / 2
      const dir = Math.sign(tcx - fcx) || 1
      gsap.killTweensOf([origin, ...lumps, ...bulges])

      // 1. The pill launches at once, ramps up briefly, glides, overshoots a touch and settles.
      gsap.to(head, { x: t.x, duration: 0.75, ease: GOO_MOVE, overwrite: 'auto' })
      gsap.to(head, { width: t.w, duration: 0.6, ease: GOO_SIZE })
      // 2. A puddle stays where it was and is sucked thin after it, shrinking away smoothly.
      gsap.set(origin, { x: fx, width: fw, scale: 1, scaleY: 1, autoAlpha: 1 })
      gsap.to(origin, { x: dir > 0 ? fx + fw - 22 : fx, width: 22, duration: 0.4, ease: 'power2.inOut' })
      gsap.to(origin, { scaleY: 0, scaleX: 0.4, duration: 0.42, delay: 0.08, ease: 'sine.in' })
      // 3. The tab it leaves swells into lumps, which are drawn after the pill and melt away.
      lumps.forEach((el, i) => {
        const ox = (i - 1) * fw * 0.28 + (Math.random() - 0.5) * 8
        const oy = (i % 2 ? 1 : -1) * (6 + Math.random() * 5)
        gsap
          .timeline()
          .set(el, { x: fcx, y: 0, scale: 0.5, autoAlpha: 1 })
          .to(el, { x: fcx + ox, y: oy, scale: 1.1, duration: 0.22, ease: 'sine.out' })
          .to(el, { x: tcx, y: 0, duration: 0.5 + i * 0.05, ease: 'power2.inOut' }, 0.14 + i * 0.04)
          .to(el, { scale: 0, duration: 0.42 + i * 0.05, ease: 'sine.inOut' }, 0.2 + i * 0.04)
          .set(el, { autoAlpha: 0 })
      })
      // 4. Drops string out behind the pill on the same curve and catch up.
      trail.forEach((el, i) => {
        gsap.to(el, { x: tcx, duration: 0.75 + i * 0.05, delay: 0.03 + i * 0.03, ease: GOO_MOVE, overwrite: 'auto' })
        gsap.fromTo(el, { scale: 1 }, { scale: 0.75 - i * 0.1, duration: 0.35, delay: i * 0.03, ease: 'sine.inOut', yoyo: true, repeat: 1 })
      })
      // 5. It lands lumpy: blobs swell past its edges, then wobble softly back in as it settles.
      bulges.forEach((el, i) => {
        const ox = (i - 1) * t.w * 0.3 + dir * 6
        const oy = (i % 2 ? 1 : -1) * (19 + Math.random() * 5)
        gsap
          .timeline({ delay: 0.16 + i * 0.05 })
          .set(el, { x: tcx - dir * 18, y: 0, scale: 0.4, autoAlpha: 1 })
          .to(el, { x: tcx + ox, y: oy, scale: 1.1, duration: 0.24, ease: 'sine.out' })
          .to(el, { x: tcx + ox * 0.35, y: 0, scale: 0.65, duration: 1.1, ease: 'elastic.out(0.9, 0.55)' })
          .set(el, { autoAlpha: 0 })
      })
    }
    tabGooTo = (to: number) => to !== heading.current && go(to)
    if (!placed.current) {
      const t = measured(index)
      if (t) snap(t)
      heading.current = index
      placed.current = true
    } else if (heading.current !== index) go(index)

    // Tabs settle into their final sizes after a switch (and on resize): once the pill's glide
    // ends, slide it onto the tab's real size.
    let raf = 0
    const follow = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const t = measured(index)
        if (!t) return
        if (reduced()) return snap(t)
        if (gsap.isTweening(head)) return follow()
        const dx = Math.abs(Number(gsap.getProperty(head, 'x')) - t.x) + Math.abs(Number(gsap.getProperty(head, 'width')) - t.w)
        if (dx < 0.5) return
        gsap.to(head, { x: t.x, width: t.w, duration: 0.22, ease: 'power2.out', overwrite: 'auto' })
        trail.forEach((el) => !gsap.isTweening(el) && gsap.to(el, { x: t.x + t.w / 2, duration: 0.22, ease: 'power2.out' }))
      })
    }
    follow()
    const ro = new ResizeObserver(follow)
    ro.observe(nav)
    tabs().forEach((el) => ro.observe(el))
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [index])
  useEffect(
    () => () => {
      tabGooTo = null
      gsap.killTweensOf(ref.current ? Array.from(ref.current.children) : [])
    },
    [],
  )
  return (
    <span class="tab-goo" aria-hidden="true" ref={ref}>
      <i class="tg-origin" />
      {ORIGIN.map((s) => (
        <i class="tg-lump tg-blob" style={{ '--s': `${s}px` }} />
      ))}
      <b class="tg-head" />
      {[40, 24, 24, 16, 11].map((s) => (
        <i class="tg-trail tg-blob" style={{ '--s': `${s}px` }} />
      ))}
      {BULGE.map((s) => (
        <i class="tg-bulge tg-blob" style={{ '--s': `${s}px` }} />
      ))}
    </span>
  )
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
