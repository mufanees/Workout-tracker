import { signal } from '@preact/signals'
import * as db from './db'
import type { Rec, StoreName } from './types'
import { reloadFromDb } from './store'

export type SyncStatus = 'checking' | 'syncing' | 'synced' | 'offline' | 'locked' | 'local' | 'error'
export const syncState = signal<{ status: SyncStatus; at?: number; message?: string }>({ status: 'checking' })

const TOKEN_KEY = 'reps-token'
export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}
export function setToken(t: string) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage blocked */
  }
}

let running: Promise<void> | null = null
let again = false
let timer: ReturnType<typeof setTimeout> | null = null

export function scheduleSync(delay = 1200) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = run()
    .catch((e) => {
      syncState.value = { status: navigator.onLine ? 'error' : 'offline', message: String(e?.message || e) }
    })
    .finally(() => {
      running = null
      if (again) {
        again = false
        scheduleSync(300)
      }
    })
  return running
}

interface Change {
  store: StoreName
  id: string
  updatedAt: number
  deleted: boolean
  data: unknown
}

async function run() {
  if (!navigator.onLine) {
    syncState.value = { ...syncState.value, status: 'offline' }
    return
  }
  syncState.value = { ...syncState.value, status: 'syncing' }

  const dirty = await db.getAll<{ store: StoreName; id: string }>('dirty')
  const changes: Change[] = []
  for (const d of dirty) {
    const rec = await db.get<Rec>(d.store, d.id)
    if (!rec) continue
    changes.push({ store: d.store, id: d.id, updatedAt: rec.updatedAt, deleted: !!rec.deleted, data: rec.deleted ? null : rec })
  }
  const since = (await db.get<number>('meta', 'syncSeq')) || 0

  let res: Response
  try {
    res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ since, changes }),
    })
  } catch {
    syncState.value = { ...syncState.value, status: 'offline' }
    return
  }
  if (res.status === 401) {
    syncState.value = { status: 'locked' }
    return
  }
  const type = res.headers.get('content-type') || ''
  if (res.status === 404 || !type.includes('json')) {
    // No sync server behind this app (e.g. opened from a static host or dev server).
    syncState.value = { status: 'local' }
    return
  }
  if (!res.ok) throw new Error(`Sync failed (${res.status})`)
  const body = (await res.json()) as { seq: number; changes: Change[] }

  // Clear dirty flags for records that haven't changed again since we sent them.
  const sent = new Map(changes.map((c) => [`${c.store}:${c.id}`, c.updatedAt]))
  const stillDirty = new Set<string>()
  for (const [key, at] of sent) {
    const [store, id] = splitKey(key)
    const rec = await db.get<Rec>(store, id)
    if (rec && rec.updatedAt !== at) stillDirty.add(key)
    else await db.del('dirty', key)
  }

  // Apply remote changes, last write wins.
  const writes: { store: db.Store; key: string; value: unknown }[] = []
  for (const c of body.changes) {
    const key = `${c.store}:${c.id}`
    if (stillDirty.has(key)) continue
    const local = await db.get<Rec>(c.store, c.id)
    if (local && local.updatedAt >= c.updatedAt) continue
    const value = c.deleted ? { id: c.id, deleted: true, updatedAt: c.updatedAt } : { ...(c.data as object), id: c.id, updatedAt: c.updatedAt }
    writes.push({ store: c.store, key: c.id, value })
  }
  writes.push({ store: 'meta', key: 'syncSeq', value: body.seq })
  await db.putMany(writes)
  if (writes.length > 1) await reloadFromDb()
  syncState.value = { status: 'synced', at: Date.now() }
}

function splitKey(key: string): [StoreName, string] {
  const i = key.indexOf(':')
  return [key.slice(0, i) as StoreName, key.slice(i + 1)]
}

export function startAutoSync() {
  void syncNow()
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 60_000)
}
