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
// Uses the View Transitions API where available (Chrome on Android, Safari 18+): the browser
// snapshots the old screen and animates to the new one, and the tab bar's lime pill glides between
// tabs. `data-nav` on <html> picks the animation: a tab switch fades, going deeper slides in from
// the right, going back slides the other way.
type Nav = 'tab' | 'forward' | 'back'
const TOP = new Set(['', 'train', 'history', 'exercises', 'body', 'coach'])
const top = (path: string) => TOP.has(path.split('/').filter(Boolean)[0] || '') && path.split('?')[0].split('/').filter(Boolean).length <= 1

let pending = 0
/** True while a navigation is waiting for its view transition to apply it. */
export const navPending = () => pending > 0

function transition(update: () => void, nav: Nav) {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void> | void) => unknown }
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition || reduce) return update()
  document.documentElement.dataset.nav = nav
  pending++
  let done = false
  const apply = () => {
    if (done) return
    done = true
    pending--
    update()
  }
  const root = document.documentElement
  root.classList.add('vt')
  try {
    const t = doc.startViewTransition(() => {
      apply()
      // Preact re-renders on the next microtask; let it finish before the new snapshot.
      return new Promise<void>((r) => setTimeout(r, 0))
    }) as { finished?: Promise<void> }
    void Promise.resolve(t?.finished)
      .catch(() => {})
      .finally(() => !pending && root.classList.remove('vt'))
  } catch {
    root.classList.remove('vt')
    apply()
  }
  // If the browser skips the transition callback for any reason, still navigate.
  setTimeout(apply, 1000)
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
