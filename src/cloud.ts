// Saving to the viewer's Claude account when the app runs as a Claude artifact (no sync server).
// Every changed record and the workout in progress are written to the artifact's private,
// per-person store (`data/users/<id>`), and read back when the page opens, so closing the
// drawer never loses anything.
import { signal } from '@preact/signals'
import type { Rec, StoreName, Workout } from './types'

/* Minimal shapes of the runtime capabilities we use (see the artifact runtime contract). */
interface DocSnap {
  id: string
  exists: boolean
  data(): Record<string, unknown> | undefined
}
interface DocRef {
  get(): Promise<DocSnap>
  set(data: Record<string, unknown>): Promise<void>
}
interface QuerySnap {
  docs: DocSnap[]
  docChanges(): { type: 'added' | 'modified' | 'removed'; doc: DocSnap }[]
}
interface CollRef {
  doc(id: string): DocRef
  onSnapshot(next: (s: QuerySnap) => void, error?: (e: { code: string }) => void): () => void
}
interface Db {
  collection(path: string): CollRef
}
interface UserNs {
  id(): Promise<string | null>
}
export type SampleFn = ((input: string | { role: 'user' | 'assistant'; content: string }[], opts?: Record<string, unknown>) => Promise<{ text: string; truncated: boolean }>) & {
  json<T = unknown>(input: string | { role: 'user' | 'assistant'; content: string }[], opts?: Record<string, unknown>): Promise<T>
  limits(): Promise<{ tools?: { maxCount: number } }>
}
type ClaudeWindow = { claude?: { use(name: string): Promise<unknown> } }

export interface RemoteChange {
  store: StoreName
  id: string
  updatedAt: number
  deleted: boolean
  data: unknown
}

/** 'off' outside Claude, 'connecting' while the runtime answers, 'on' once saving to the account works. */
export const cloudState = signal<'off' | 'connecting' | 'on'>('off')
export const sampleFn = signal<SampleFn | null>(null)

let coll: CollRef | null = null
const inClaude = () => typeof window !== 'undefined' && typeof (window as ClaudeWindow).claude?.use === 'function'

/** Document ids allow letters, digits and `_ - . ~ : @ +`. */
const docId = (store: string, id: string) => `${store}~${id.replace(/[^A-Za-z0-9_\-.:@+]/g, '_')}`.slice(0, 190)

/**
 * Connects to the Claude account store. `onRemote` receives every saved record (first all of
 * them, then any change made on another device); `onActive` the saved workout in progress.
 */
export async function initCloud(onRemote: (c: RemoteChange[]) => void | Promise<void>, onActive: (w: Workout | null, at: number) => void | Promise<void>) {
  if (!inClaude()) return
  cloudState.value = 'connecting'
  const claude = (window as ClaudeWindow).claude!
  void claude.use('sample').then((s) => (sampleFn.value = (s as SampleFn) || null))
  const [db, user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [Db | null, UserNs | null]
  const uid = db && user ? await user.id() : null
  if (!db || !uid) {
    cloudState.value = 'off'
    return
  }
  coll = db.collection(`data/users/${uid}`)
  let first = true
  coll.onSnapshot(
    (snap) => {
      const changes: RemoteChange[] = []
      let active: { w: Workout | null; at: number } | null = null
      const docs = first ? snap.docs : snap.docChanges().filter((c) => c.type !== 'removed').map((c) => c.doc)
      for (const d of docs) {
        const body = d.data() as Record<string, unknown> | undefined
        if (!body) continue
        if (d.id === 'active') active = { w: (body.w as Workout) || null, at: Number(body.at) || 0 }
        else if (typeof body.store === 'string' && typeof body.id === 'string') changes.push(body as unknown as RemoteChange)
      }
      const wasFirst = first
      first = false
      void (async () => {
        if (changes.length) await onRemote(changes)
        if (active && (wasFirst || active.at > lastActiveAt)) await onActive(active.w, active.at)
        cloudState.value = 'on'
      })()
    },
    () => (cloudState.value = 'off'),
  )
}

export const cloudReady = () => coll != null

/** Write changed records, one at a time (the store wants one write per document at a time). */
export async function cloudPush(changes: RemoteChange[]) {
  if (!coll) throw new Error('Not connected to your Claude account')
  for (const c of changes) await coll.doc(docId(c.store, c.id)).set({ store: c.store, id: c.id, updatedAt: c.updatedAt, deleted: c.deleted, data: c.deleted ? null : (c.data as Rec) })
}

// ---- the workout in progress: saved at most every 2 s, and right away when the page hides ----

let lastActiveAt = 0
let pending: Workout | null | undefined
let writing = false
let activeTimer: ReturnType<typeof setTimeout> | null = null

export function cloudSaveActive(w: Workout | null, now = false) {
  if (!coll) return
  pending = w
  lastActiveAt = Date.now()
  if (activeTimer) clearTimeout(activeTimer)
  activeTimer = setTimeout(() => void writeActive(), now ? 0 : 2000)
}

async function writeActive() {
  if (!coll || pending === undefined || writing) return
  writing = true
  const w = pending
  pending = undefined
  try {
    await coll.doc('active').set({ w: w ? JSON.parse(JSON.stringify(w)) : null, at: lastActiveAt })
  } catch {
    if (pending === undefined) pending = w // try again with the next change
  } finally {
    writing = false
    if (pending !== undefined) void writeActive()
  }
}
