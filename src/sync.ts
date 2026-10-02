import { signal } from '@preact/signals'
import * as db from './db'
import type { Rec, StoreName } from './types'
import { reloadFromDb } from './store'
import { sanitize } from './validate'

export type SyncStatus = 'checking' | 'syncing' | 'synced' | 'offline' | 'locked' | 'local' | 'error'
export const syncState = signal<{ status: SyncStatus; at?: number; message?: string }>({ status: 'checking' })

const TOKEN_KEY = 'reps-token'
const SYNCED: StoreName[] = ['exercises', 'routines', 'workouts', 'settings']

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

/** Sync now. If a sync is already running, another one runs right after it (and this resolves then). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running.then(() => running || undefined)
  }
  running = run()
    .catch((e) => {
      syncState.value = { status: navigator.onLine ? 'error' : 'offline', message: String(e?.message || e) }
    })
    .finally(() => {
      running = null
      if (again) {
        again = false
        void syncNow()
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

type SettingsRec = Rec & { ft?: Record<string, number>; [k: string]: unknown }

/** Field-by-field merge so a change on one device doesn't reset unrelated settings from another. */
function mergeSettings(local: SettingsRec, remote: SettingsRec): { value: SettingsRec; localWins: boolean } {
  const lt = local.ft || {}
  const rt = remote.ft || {}
  const value: SettingsRec = { ...remote, ft: { ...rt } }
  let localWins = false
  for (const k of new Set([...Object.keys(lt), ...Object.keys(rt)])) {
    if ((lt[k] || 0) > (rt[k] || 0)) {
      value[k] = local[k]
      value.ft![k] = lt[k]
      localWins = true
    }
  }
  value.updatedAt = localWins ? Math.max(local.updatedAt, remote.updatedAt) + 1 : remote.updatedAt
  return { value, localWins }
}

async function markAllDirty() {
  await db.transaction([...SYNCED, 'dirty', 'meta'], async (tx) => {
    for (const store of SYNCED) {
      const keys = (await db.req(tx.objectStore(store).getAllKeys())) as string[]
      for (const id of keys) tx.objectStore('dirty').put({ store, id }, `${store}:${id}`)
    }
    tx.objectStore('meta').put(0, 'syncSeq')
  })
}

async function run() {
  if (!navigator.onLine) {
    syncState.value = { ...syncState.value, status: 'offline' }
    return
  }
  if (syncState.value.status !== 'synced') syncState.value = { ...syncState.value, status: 'syncing' }

  const dirty = await db.getAll<{ store: StoreName; id: string }>('dirty')
  const changes: Change[] = []
  for (const d of dirty) {
    const rec = await db.get<Rec>(d.store, d.id)
    if (!rec) continue
    changes.push({ store: d.store, id: d.id, updatedAt: rec.updatedAt, deleted: !!rec.deleted, data: rec.deleted ? null : rec })
  }
  const since = (await db.get<number>('meta', 'syncSeq')) || 0
  const knownDb = await db.get<string>('meta', 'serverId')

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
  const body = (await res.json()) as { seq: number; dbId?: string; changes: Change[] }

  // The server's database was replaced (restored, or a container lost its volume):
  // re-upload everything so nothing on this device is silently missing there.
  if ((knownDb && body.dbId && knownDb !== body.dbId) || body.seq < since) {
    await markAllDirty()
    await db.put('meta', 'serverId', body.dbId || '')
    again = true
    return
  }

  const sent = new Map(changes.map((c) => [`${c.store}:${c.id}`, c.updatedAt]))
  let applied = 0
  let pushBack = false

  // One transaction: clearing dirty flags and applying remote changes can't interleave with local edits.
  await db.transaction([...SYNCED, 'dirty', 'meta'], async (tx) => {
    const dirtyStore = tx.objectStore('dirty')
    for (const [key, at] of sent) {
      const [store, id] = splitKey(key)
      const rec = (await db.req(tx.objectStore(store).get(id))) as Rec | undefined
      if (!rec || rec.updatedAt === at) dirtyStore.delete(key)
    }
    for (const c of body.changes) {
      if (!SYNCED.includes(c.store)) continue
      const key = `${c.store}:${c.id}`
      const os = tx.objectStore(c.store)
      const local = (await db.req(os.get(c.id))) as Rec | undefined
      const remote = sanitize(c.store, c.deleted ? { id: c.id, deleted: true, updatedAt: c.updatedAt } : { ...(c.data as object), id: c.id, updatedAt: c.updatedAt })
      if (!remote) continue
      if (c.store === 'settings' && local && !local.deleted && !remote.deleted) {
        const { value, localWins } = mergeSettings(local as SettingsRec, remote as SettingsRec)
        os.put(value, c.id)
        applied++
        if (localWins) {
          dirtyStore.put({ store: c.store, id: c.id }, key)
          pushBack = true
        }
        continue
      }
      if (local && local.updatedAt >= c.updatedAt) {
        // Ours is newer: make sure it gets (re)sent rather than silently diverging.
        if (local.updatedAt > c.updatedAt) {
          dirtyStore.put({ store: c.store, id: c.id }, key)
          pushBack = true
        }
        continue
      }
      os.put(remote, c.id)
      dirtyStore.delete(key)
      applied++
    }
    tx.objectStore('meta').put(body.seq, 'syncSeq')
    if (body.dbId) tx.objectStore('meta').put(body.dbId, 'serverId')
  })
  if (applied) await reloadFromDb()
  if (pushBack) again = true
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
