import { signal } from '@preact/signals'

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
// underneath, and the copy fades and slides away on top. Nothing freezes, and every frame is a
// blend of two solid pictures, so it can't flash. A tab switch fades; going deeper slides in from
// the right; going back slides the other way. The tab bar's tabs glide to their new places on the
// same beat. All of it is Web Animations on opacity and transform, which the browser runs on the
// compositor: once started, it stays smooth even while the main thread is busy.
type Nav = 'tab' | 'forward' | 'back'
const TOP = new Set(['', 'train', 'history', 'exercises', 'body', 'coach'])
const top = (path: string) => TOP.has(path.split('/').filter(Boolean)[0] || '') && path.split('?')[0].split('/').filter(Boolean).length <= 1

let pending = 0
/** True while a navigation is still settling (its new screen not drawn yet). */
export const navPending = () => pending > 0

const SCREEN = ':scope > :is(.screen, .live):not(.screen-ghost)'
// GSAP's power3.out, sine.inOut and power3.inOut as CSS curves
const OUT3 = 'cubic-bezier(0.215, 0.61, 0.355, 1)'
const SINE = 'cubic-bezier(0.37, 0, 0.63, 1)'
const INOUT3 = 'cubic-bezier(0.65, 0, 0.35, 1)'

function transition(update: () => void, nav: Nav) {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const app = document.querySelector<HTMLElement>('.app')
  if (reduce || !app || !app.querySelector(SCREEN)) return update()
  pending++
  // A tab switch: the tab pill has just started gliding (gooTab, on the tap). Let one frame
  // reach the screen first, so its animations are on the compositor before the heavy work
  // (copying this screen, rendering the next) holds up the main thread: the pill then keeps
  // gliding through it instead of waiting for it. Costs one frame (~16ms) before the screen
  // changes. rAF runs just before that frame is drawn; the timeout, right after.
  if (nav === 'tab') requestAnimationFrame(() => setTimeout(() => swap(app, update, nav)))
  else swap(app, update, nav)
}

/** Drop the parts of `copy` whose originals (in `orig`) are wholly below `bottom`. */
function trim(orig: Element, copy: Element, bottom: number, depth: number) {
  const o = orig.children
  const c = copy.children
  if (o.length !== c.length) return
  for (let i = o.length - 1; i >= 0; i--) {
    const r = o[i].getBoundingClientRect()
    if (r.top >= bottom) c[i].remove()
    else if (depth > 0 && r.bottom > bottom) trim(o[i], c[i], bottom, depth - 1)
  }
}

function swap(app: HTMLElement, update: () => void, nav: Nav) {
  const cur = app.querySelector<HTMLElement>(SCREEN)
  if (!cur || !app.isConnected) {
    pending--
    return update()
  }
  // the screen as it looks right now
  const r = cur.getBoundingClientRect()
  const ghost = cur.cloneNode(true) as HTMLElement
  // only what's on screen: the parts below the fold would just add to the style and layout work
  // of this frame (removing them doesn't move anything above them)
  trim(cur, ghost, innerHeight, 3)
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
    next?.animate([{ transform: `translate(${dir * 28}px, ${dir ? 0 : 8}px)` }, { transform: 'none' }], { duration: 500, easing: OUT3 })
    const fade = ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 20}px)` }], { duration: 380, easing: SINE, fill: 'forwards' })
    fade.onfinish = cleanup
    const bar2 = app.querySelector<HTMLElement>('.tabbar')
    if (bar2 && tabsBefore) {
      Array.from(bar2.querySelectorAll<HTMLElement>('.tab')).forEach((t, i) => {
        const d = (tabsBefore[i] ?? 0) - t.getBoundingClientRect().left
        if (Math.abs(d) > 0.5) t.animate([{ transform: `translateX(${d}px)` }, { transform: 'none' }], { duration: 700, easing: INOUT3 })
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
