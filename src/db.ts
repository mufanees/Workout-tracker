// Tiny promise wrapper around IndexedDB. Everything lives on the device first.
const DB_NAME = 'reps'
const VERSION = 5
export const STORES = ['exercises', 'routines', 'workouts', 'settings', 'body', 'fasts', 'readings', 'coach', 'days', 'meta', 'dirty'] as const
export type Store = (typeof STORES)[number]

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAll<T>(store: Store): Promise<T[]> {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>
}

export async function getAllKeys(store: Store): Promise<string[]> {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).getAllKeys()) as Promise<string[]>
}

export async function get<T>(store: Store, key: string): Promise<T | undefined> {
  const db = await open()
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>
}

export async function put(store: Store, key: string, value: unknown): Promise<void> {
  const db = await open()
  await wrap(db.transaction(store, 'readwrite').objectStore(store).put(value, key))
}

export async function del(store: Store, key: string): Promise<void> {
  const db = await open()
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key))
}

/** Write several records across stores in one transaction. */
export async function putMany(items: { store: Store; key: string; value: unknown }[]): Promise<void> {
  if (!items.length) return
  const db = await open()
  const stores = [...new Set(items.map((i) => i.store))]
  const tx = db.transaction(stores, 'readwrite')
  for (const i of items) tx.objectStore(i.store).put(i.value, i.key)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function clearAll(): Promise<void> {
  const db = await open()
  const tx = db.transaction([...STORES], 'readwrite')
  for (const s of STORES) tx.objectStore(s).clear()
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Run several reads/writes atomically. Only await IDB requests (via `req`) inside `fn`. */
export async function transaction<T>(stores: Store[], fn: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await open()
  const tx = db.transaction(stores, 'readwrite')
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  const result = await fn(tx)
  await done
  return result
}

export const req = wrap
