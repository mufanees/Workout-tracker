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

window.addEventListener('hashchange', () => {
  route.value = parse()
})

export function navigate(path: string, opts: { replace?: boolean } = {}) {
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
    navigate(fallback, { replace: true })
  } else if ((history.state?.depth || 0) > 0) history.back()
  else navigate(fallback, { replace: true })
}
