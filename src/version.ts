// Which build is running, and whether the server has a newer one (it reports its build from /api/health).
import { signal } from '@preact/signals'

export const BUILD = __BUILD__

/** 'latest', 'update' (the server serves a newer build), or 'unknown' (offline, or no server). */
export const buildState = signal<'checking' | 'latest' | 'update' | 'unknown'>('checking')

export async function checkBuild(): Promise<void> {
  buildState.value = 'checking'
  try {
    const res = await fetch('/api/health', { cache: 'no-store' })
    const server = ((await res.json()) as { build?: { id: string } | null }).build
    buildState.value = !server ? 'unknown' : server.id === BUILD.id ? 'latest' : 'update'
  } catch {
    buildState.value = 'unknown'
  }
}

/** Fetch the new service worker (it takes over straight away), then reload onto the new build. */
export async function updateApp(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
    const next = reg?.installing || reg?.waiting
    if (next && next.state !== 'activated')
      await new Promise<void>((done) => {
        next.addEventListener('statechange', () => next.state === 'activated' && done())
        setTimeout(done, 5000)
      })
  } catch {
    // reload anyway
  }
  location.reload()
}

export const versionLabel = `${BUILD.version}${BUILD.commit ? ` · ${BUILD.commit}` : ''}`
