// Push notifications through the self-hosted server: fast complete, rest over (with the app closed)
// and training-day reminders. Needs the installed app with its service worker (not the Claude-hosted copy).
import { signal } from '@preact/signals'
import { getToken } from './sync'

const FLAG = 'reps-push'
export const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const pushOn = signal(readFlag())

function readFlag() {
  try {
    return localStorage.getItem(FLAG) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted'
  } catch {
    return false
  }
}

const api = (path: string, body?: unknown) =>
  fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

function keyBytes(b64: string) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/** Ask permission and register this device. Returns a message for the user. */
export async function enablePush(): Promise<string> {
  if (!pushSupported) return 'This browser can’t receive notifications. Install the app from your server first.'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'Notifications are blocked for this app in your phone’s settings.'
  try {
    const reg = await navigator.serviceWorker.ready
    const res = await api('/api/push/key')
    if (!res.ok) return res.status === 401 ? 'Connect sync first (Settings → Sync key).' : 'Your server didn’t answer. Notifications need the deployed app.'
    const { key } = await res.json()
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
    const ok = await api('/api/push/subscribe', { endpoint: sub.endpoint })
    if (!ok.ok) return 'Couldn’t register for notifications.'
    localStorage.setItem(FLAG, '1')
    pushOn.value = true
    return 'Notifications on'
  } catch {
    return 'Couldn’t turn on notifications here.'
  }
}

export async function disablePush() {
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
    if (sub) {
      await api('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
      await sub.unsubscribe()
    }
    localStorage.removeItem(FLAG)
  } catch {
    /* ignore */
  }
  pushOn.value = false
}

/** Schedule (or replace) a notification by key. Fire-and-forget; quietly does nothing when off. */
export function schedulePush(key: string, at: number, title: string, body: string) {
  if (!pushOn.value) return
  void api('/api/push/schedule', { key, at, title, body, tag: key }).catch(() => {})
}

export function cancelPush(key: string) {
  if (!pushOn.value) return
  void api('/api/push/cancel', { key }).catch(() => {})
}
