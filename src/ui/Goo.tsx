// The gooey layer: an SVG "metaball" filter (blur, then a hard alpha cut, so nearby blobs melt
// into one liquid shape) and the small pieces that use it. Everything here is decoration:
// it's hidden from screen readers and switched off for people who prefer reduced motion.
import { gsap } from 'gsap'
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

/**
 * The lime pill under the tab bar. It's a pill and three blobs inside one goo filter: when the
 * tab changes, the pill races ahead and the blobs follow on slower curves, so a liquid neck
 * stretches out behind it, snaps, and the drops catch up and melt back in.
 */
export function TabGoo({ index }: { index: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)
  useLayoutEffect(() => {
    const layer = ref.current
    const nav = layer?.parentElement
    if (!layer || !nav) return
    const [origin, head, ...trail] = Array.from(layer.children) as HTMLElement[]
    const target = () => {
      const tab = nav.querySelectorAll<HTMLElement>('.tab')[index]
      return tab ? { x: tab.offsetLeft, w: tab.offsetWidth, cx: tab.offsetLeft + tab.offsetWidth / 2 } : null
    }
    const place = (animate: boolean) => {
      const t = target()
      if (!t) return
      if (!animate || reduced()) {
        gsap.set(origin, { autoAlpha: 0 })
        gsap.set(head, { x: t.x, width: t.w })
        gsap.set(trail, { x: t.cx, scale: 1 })
        return
      }
      // Where the pill is leaving from: a puddle stays there and is sucked thin after it, so a
      // liquid neck stretches across the bar before it tears.
      const fromX = Number(gsap.getProperty(head, 'x'))
      const fromW = Number(gsap.getProperty(head, 'width'))
      const dir = Math.sign(t.x - fromX) || 1
      gsap.killTweensOf(origin)
      gsap.set(origin, { x: fromX, width: fromW, scaleY: 1, autoAlpha: 1 })
      gsap.to(origin, { x: dir > 0 ? fromX + fromW - 24 : fromX, width: 24, scaleY: 0.55, duration: 0.42, ease: 'power2.in' })
      gsap.to(origin, { scaleY: 0, autoAlpha: 0, duration: 0.16, delay: 0.42, ease: 'power1.in' })
      // The pill and its drops share one curve, each a beat behind the one ahead: close enough for
      // the filter to bridge, far enough apart to read as a tail that pinches into drops.
      gsap.to(head, { x: t.x, width: t.w, duration: 0.7, ease: 'power3.inOut', overwrite: 'auto' })
      trail.forEach((el, i) => {
        gsap.to(el, { x: t.cx, duration: 0.72 + i * 0.05, delay: 0.03 + i * 0.03, ease: 'power3.inOut', overwrite: 'auto' })
        // the drops thin out as they're pulled along, then plump back up once they land
        gsap.fromTo(el, { scale: 1 }, { scale: 0.8 - i * 0.12, duration: 0.38, delay: i * 0.03, ease: 'sine.out', yoyo: true, repeat: 1, overwrite: 'auto' })
      })
    }
    place(placed.current)
    placed.current = true
    // Tabs keep changing size after the switch (the label opens), so follow them: glide the pill
    // (and the drops' destination) to wherever the tab settles.
    let raf = 0
    const follow = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const t = target()
        if (!t) return
        if (reduced()) return place(false)
        // let a switch finish its glide (so the tail stays attached), then settle onto the tab's final size
        if (gsap.isTweening(head)) return follow()
        gsap.to(head, { x: t.x, width: t.w, duration: 0.25, ease: 'power2.out', overwrite: 'auto' })
        trail.forEach((el) => !gsap.isTweening(el) && gsap.to(el, { x: t.cx, duration: 0.25, ease: 'power2.out' }))
      })
    }
    const ro = new ResizeObserver(follow)
    ro.observe(nav)
    nav.querySelectorAll('.tab').forEach((el) => ro.observe(el))
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [index])
  useEffect(() => () => gsap.killTweensOf(ref.current ? Array.from(ref.current.children) : []), [])
  return (
    <span class="tab-goo" aria-hidden="true" ref={ref}>
      <i class="tg-origin" />
      <b class="tg-head" />
      <i class="tg-tail" />
      <i class="tg-drop" />
      <i class="tg-drop" />
      <i class="tg-drop sm" />
      <i class="tg-drop xs" />
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
