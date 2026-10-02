import { signal } from '@preact/signals'

export interface Route {
  path: string
  parts: string[]
  query: URLSearchParams
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
  if (opts.replace) history.replaceState({ depth: history.state?.depth || 0 }, '', url)
  else history.pushState({ depth: (history.state?.depth || 0) + 1 }, '', url)
  route.value = parse()
  window.scrollTo(0, 0)
}

/** Go back within the app, or to a sensible parent if we were deep-linked. */
export function back(fallback: string) {
  if ((history.state?.depth || 0) > 0) history.back()
  else navigate(fallback, { replace: true })
}
