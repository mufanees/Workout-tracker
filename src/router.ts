import { signal } from '@preact/signals'
import { gsap } from 'gsap'

export interface Route {
  path: string
  parts: string[]
  query: URLSearchParams
}

let inMemoryDepth = 0

function parseRaw(raw: string): Route {
  const [path, qs] = (raw || '/train').split('?')
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs || '') }
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/train'
  const [path, qs] = raw.split('?')
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs || '') }
}

export const route = signal<Route>(parse())

// ---- motion between screens ----
// Done by hand, not with the View Transitions API: that freezes drawing while it snapshots the
// page, and inside some web views (like the Claude app's) the result flashed or cut abruptly.
// Here the current screen is copied and laid over the app, the new screen renders solid
// underneath, and the copy fades and slides away on top (GSAP). Nothing freezes, and every
// frame is a blend of two solid pictures, so it can't flash. A tab switch fades; going deeper
// slides in from the right; going back slides the other way. The tab bar's tabs glide to their
// new places on the same beat.
type Nav = 'tab' | 'forward' | 'back'
const TOP = new Set(['', 'train', 'history', 'exercises', 'body', 'coach'])
const top = (path: string) => TOP.has(path.split('/').filter(Boolean)[0] || '') && path.split('?')[0].split('/').filter(Boolean).length <= 1

let pending = 0
/** True while a navigation is still settling (its new screen not drawn yet). */
export const navPending = () => pending > 0

const SCREEN = ':scope > :is(.screen, .live):not(.screen-ghost)'

function transition(update: () => void, nav: Nav) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const app = document.querySelector<HTMLElement>('.app')
  const cur = app?.querySelector<HTMLElement>(SCREEN)
  if (reduce || !app || !cur) return update()
  pending++

  // the screen as it looks right now
  const r = cur.getBoundingClientRect()
  const ghost = cur.cloneNode(true) as HTMLElement
  ghost.querySelectorAll('[id]').forEach((e) => e instanceof SVGElement || e.removeAttribute('id'))
  ghost.classList.add('screen-ghost')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('inert', '')
  Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0' })
  const bar = app.querySelector<HTMLElement>('.tabbar')
  const tabsBefore = bar ? Array.from(bar.querySelectorAll<HTMLElement>('.tab')).map((t) => t.getBoundingClientRect().left) : null
  app.appendChild(ghost)

  update()
  const cleanup = () => ghost.isConnected && ghost.remove()
  // Preact has drawn the new screen by the next frame
  requestAnimationFrame(() => {
    pending--
    const next = app.querySelector<HTMLElement>(SCREEN)
    const dir = nav === 'forward' ? 1 : nav === 'back' ? -1 : 0
    if (next) gsap.fromTo(next, { x: dir * 28, y: dir ? 0 : 8 }, { x: 0, y: 0, duration: 0.5, ease: 'power3.out', clearProps: 'transform' })
    gsap.to(ghost, { x: -dir * 20, opacity: 0, duration: 0.38, ease: 'sine.inOut', onComplete: cleanup })
    const bar2 = app.querySelector<HTMLElement>('.tabbar')
    if (bar2 && tabsBefore) {
      Array.from(bar2.querySelectorAll<HTMLElement>('.tab')).forEach((t, i) => {
        const d = (tabsBefore[i] ?? 0) - t.getBoundingClientRect().left
        if (Math.abs(d) > 0.5) gsap.fromTo(t, { x: d }, { x: 0, duration: 0.7, ease: 'power3.inOut', clearProps: 'transform' })
      })
    }
  })
  setTimeout(cleanup, 1500)
}

window.addEventListener('hashchange', () => {
  transition(() => {
    route.value = parse()
  }, 'back')
})

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const from = route.value.path
  const nav: Nav = top(path) && top(from) ? 'tab' : opts.replace ? 'tab' : 'forward'
  transition(() => go(path, opts), nav)
}

function go(path: string, opts: { replace?: boolean }) {
  const url = '#' + path
  try {
    if (opts.replace) history.replaceState({ depth: history.state?.depth || 0 }, '', url)
    else history.pushState({ depth: (history.state?.depth || 0) + 1 }, '', url)
  } catch {
    // Some embedded frames refuse history changes; navigation still works in memory.
    inMemoryDepth += opts.replace ? 0 : 1
    route.value = parseRaw(path)
    window.scrollTo(0, 0)
    return
  }
  route.value = parse()
  window.scrollTo(0, 0)
}

/** Go back within the app, or to a sensible parent if we were deep-linked. */
export function back(fallback: string) {
  if (inMemoryDepth > 0) {
    inMemoryDepth--
    transition(() => go(fallback, { replace: true }), 'back')
  } else if ((history.state?.depth || 0) > 0) {
    // Inside some embedded frames (like Claude's) history.back() is silently ignored.
    // If the screen hasn't changed shortly after, go to the parent screen ourselves.
    const from = route.value.path
    history.back()
    setTimeout(() => {
      if (route.value.path === from && !navPending()) transition(() => go(fallback, { replace: true }), 'back')
    }, 400)
  } else transition(() => go(fallback, { replace: true }), 'back')
}
