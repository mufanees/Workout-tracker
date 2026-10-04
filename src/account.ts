// Signing in with Google, for a Gloop server with accounts (server/accounts.mjs).
//
// The server gives back a session token, which the app uses exactly like the old sync key (same
// storage, same Bearer header), so sync, the coach and reminders don't need to know about accounts.
// A device only ever holds one person's data: signing in as someone else, or signing out, clears
// this device's copy first (everything is safe on the server).
import { signal } from '@preact/signals'
import * as db from './db'
import { getToken, setToken, syncNow } from './sync'

export interface Me {
  id: string
  email: string
  name: string
  picture: string
  role: 'admin' | 'member'
  mcpToken?: string
}

/** The server's Google client id; null when the server has no accounts (or there's no server). */
export const googleClientId = signal<string | null>(null)
export const me = signal<Me | null>(null)

const ACCOUNT_KEY = 'gloop-account'
const store = {
  get: () => {
    try {
      return localStorage.getItem(ACCOUNT_KEY) || ''
    } catch {
      return ''
    }
  },
  set: (v: string) => {
    try {
      if (v) localStorage.setItem(ACCOUNT_KEY, v)
      else localStorage.removeItem(ACCOUNT_KEY)
    } catch {
      /* storage blocked */
    }
  },
}

const auth = () => ({ authorization: `Bearer ${getToken()}` })

/** Find out whether this server has accounts, and who's signed in here. */
export async function loadAccount() {
  try {
    const r = await fetch('/api/auth/config')
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) googleClientId.value = (await r.json()).googleClientId || null
  } catch {
    /* offline or no server */
  }
  if (!getToken()) return
  try {
    const r = await fetch('/api/auth/me', { headers: auth() })
    if (r.ok) {
      me.value = (await r.json()).user
      store.set(me.value!.id)
    }
  } catch {
    /* offline: keep going with what's on the device */
  }
}

// ---- Google's button (Google Identity Services) ----
type Gsi = {
  accounts: {
    id: {
      initialize(o: Record<string, unknown>): void
      renderButton(el: HTMLElement, o: Record<string, unknown>): void
    }
  }
}
let gsi: Promise<Gsi> | null = null
function loadGsi(): Promise<Gsi> {
  const w = window as unknown as { google?: Gsi }
  if (w.google?.accounts?.id) return Promise.resolve(w.google)
  gsi ||= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error('Google sign-in didn’t load')))
    s.onerror = () => {
      gsi = null
      reject(new Error('Couldn’t reach Google. Check your connection.'))
    }
    document.head.appendChild(s)
  })
  return gsi
}

/** Draw Google's "Continue with Google" button into `el`; `onCredential` gets the ID token. */
export async function renderGoogleButton(el: HTMLElement, onCredential: (credential: string) => void, dark: boolean) {
  const clientId = googleClientId.value
  if (!clientId) return
  const g = await loadGsi()
  g.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => onCredential(r.credential), ux_mode: 'popup', auto_select: false, itp_support: true })
  el.innerHTML = ''
  g.accounts.id.renderButton(el, { theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width: Math.min(400, Math.max(220, el.offsetWidth || 300)) })
}

/** Exchange Google's ID token for a Gloop session. Throws with a readable message (and `code: 'invite'` when one is needed). */
export async function signIn(credential: string, invite?: string): Promise<Me> {
  const r = await fetch('/api/auth/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential, invite }) })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(body.error || 'Sign-in failed'), { code: body.code })
  const user = body.user as Me
  // Whose data is on this device now: the last account, or the owner if it used the old sync key.
  const before = store.get() || (getToken() ? 'owner' : '')
  const switching = !!before && before !== user.id
  if (switching) await db.clearAll()
  setToken(body.token)
  store.set(user.id)
  if (switching) {
    location.reload()
    return user
  }
  me.value = user
  await loadAccount()
  void syncNow()
  return user
}

/** How many local changes haven't reached the server yet. */
export async function unsynced(): Promise<number> {
  return (await db.getAllKeys('dirty')).length
}

/** Sign out on this device: sync first, then end the session and clear this device's copy. */
export async function signOut() {
  await syncNow()
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: '{}' })
  } catch {
    /* the session ends anyway once the token is gone */
  }
  setToken('')
  store.set('')
  me.value = null
  await db.clearAll()
  location.replace(location.pathname + '#/train')
  location.reload()
}

// ---- the owner's tools ----
export interface People {
  users: (Me & { created: number; coachToday: number; disabled: boolean })[]
  invites: { code: string; created: number; expires: number; note: string }[]
  coachLimit: number
}
async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { ...auth(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Failed (${r.status})`)
  return j as T
}
export const people = () => call<People>('/api/admin/people')
export const createInvite = (note?: string) => call<{ code: string; expires: number }>('/api/admin/invite', { note })
export const revokeInvite = (code: string) => call('/api/admin/invite/revoke', { code })
export const setAccess = (id: string, disabled: boolean) => call('/api/admin/access', { id, disabled })
export const newConnectorLink = () => call<{ mcpToken: string }>('/api/auth/mcp-token', {})
export const inviteUrl = (code: string) => `${location.origin}/#/join/${code}`
export const checkInvite = (code: string) => fetch(`/api/auth/invite?code=${encodeURIComponent(code)}`).then((r) => r.json() as Promise<{ ok: boolean; reason?: string }>)
