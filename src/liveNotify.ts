// "Live" notifications in the Android notification shade: the running fast (time fasted, goal) and
// heart rate during a cardio session, plus zone alerts when Gloop isn't on screen.
//
// What a web app can and can't do here: it can't post a truly ongoing (non-dismissible)
// notification or write text into the status bar. It can keep replacing one silent notification
// with a fixed tag, and on Chrome for Android the status-bar icon is the notification's `badge`
// (a one-colour mask), which we draw with the number on it. Updates come from this page while it
// runs (also in the background, until Android freezes it) and, for the fast, from server pushes
// every 15 minutes (server/push.mjs, job key `fast-live`), whose text the service worker refreshes.
// Without a service worker or notification permission (the Claude app's web view) everything here
// quietly does nothing.
import { effect } from '@preact/signals'
import { activeFast, settings } from './store'
import { protocolLabel } from './fasting'
import { cancelPush, pushOn, schedulePush } from './push'
import { ZONE_COLORS } from './hr'
import { navigate } from './router'
import { fastLiveText, liveBadgeCanvas, liveIconCanvas, liveDataUrl, LIVE_FAST_COLOR } from '../shared/live.mjs'

const TAG_FAST = 'gloop-fast'
const TAG_HR = 'gloop-live-hr'
const TAG_ALERT = 'gloop-zone-alert'
const STATIC_BADGE = 'badge-96.png'
const STATIC_ICON = 'icon-192.png'
const MIN = 60000
const LIVE_EVERY = 15 * MIN

type Opts = NotificationOptions & {
  renotify?: boolean
  vibrate?: number[]
  badge?: string
  icon?: string
  silent?: boolean
}

// ---- plumbing ------------------------------------------------------------------------

/** True when this page may show notifications at all (permission given, a service worker exists). */
export function notifyAllowed() {
  try {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator
  } catch {
    return false
  }
}

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (!notifyAllowed()) return null
    const reg = await navigator.serviceWorker.getRegistration()
    return reg && reg.active ? reg : null
  } catch {
    return null
  }
}

async function show(title: string, opts: Opts) {
  try {
    const reg = await registration()
    if (reg) await reg.showNotification(title, opts)
  } catch {
    /* blocked or unsupported: nothing to do */
  }
}

async function closeTag(tag: string) {
  try {
    const reg = await registration()
    if (!reg) return
    for (const n of await reg.getNotifications({ tag })) n.close()
  } catch {
    /* ignore */
  }
}

// A drawn image per text, reused (the bpm repeats a lot). Falls back to the static files.
const images = new Map<string, Promise<string | null>>()
function drawn(key: string, make: () => HTMLCanvasElement | OffscreenCanvas | null): Promise<string | null> {
  let p = images.get(key)
  if (!p) {
    p = (async () => {
      try {
        return await liveDataUrl(make())
      } catch {
        return null
      }
    })()
    if (images.size > 400) images.clear()
    images.set(key, p)
  }
  return p
}
/** The status-bar badge with a number on it, as a data: URL (null when drawing failed). */
export const badgeFor = (text: string | number) => drawn('b' + text, () => liveBadgeCanvas(text))
/** The large icon: number, label, coloured progress ring. */
export const iconFor = (text: string | number, label: string, color: string, progress = 1) =>
  drawn(`i${text}|${label}|${color}|${Math.round(progress * 100)}`, () => liveIconCanvas(text, label, color, progress))

// ---- swipe-away memory (shared with the service worker through the Cache API) ---------

const LIVE_CACHE = 'gloop-live'
const DISMISSED = '/__live/dismissed'
let fastDismissedStart: number | true | null | undefined // undefined = not read yet
let hrDismissed = false

async function readFastDismissed() {
  if (fastDismissedStart !== undefined) return fastDismissedStart
  try {
    const r = await (await caches.open(LIVE_CACHE)).match(DISMISSED)
    fastDismissedStart = r ? ((await r.json()).fast ?? null) : null
  } catch {
    fastDismissedStart = null
  }
  return fastDismissedStart
}

/** Forget swipe-aways (turning a switch back on shows the notification again). */
export async function resetLiveDismissed() {
  fastDismissedStart = null
  hrDismissed = false
  try {
    await (await caches.open(LIVE_CACHE)).delete(DISMISSED)
  } catch {
    /* ignore */
  }
  fastSig = ''
  syncFastNotification()
}

// ---- fasting --------------------------------------------------------------------------

let fastTimer: ReturnType<typeof setTimeout> | null = null
let fastSig = ''

function fastOn() {
  return settings.value.liveFast !== false
}

async function renderFast() {
  const f = activeFast.value
  if (!f || !fastOn() || !notifyAllowed()) return closeTag(TAG_FAST)
  const d = await readFastDismissed()
  if (d === true || d === f.start) return closeTag(TAG_FAST)
  const t = fastLiveText({
    start: f.start,
    goal: f.goal,
    label: protocolLabel(f.goal),
  })
  const [badge, icon] = await Promise.all([badgeFor(t.hours), iconFor(t.hours, 'HOURS', LIVE_FAST_COLOR, t.progress)])
  if (activeFast.value?.id !== f.id) return // ended while drawing
  await show(t.title, {
    body: t.body,
    tag: TAG_FAST,
    renotify: false,
    silent: true,
    badge: badge || STATIC_BADGE,
    icon: icon || STATIC_ICON,
    data: { path: '/fast', kind: 'fast', start: f.start },
  })
}

/** Next update on the minute of the fast (so "14h 20m" turns over on time). */
function armFastTimer() {
  if (fastTimer) clearTimeout(fastTimer)
  fastTimer = null
  const f = activeFast.value
  if (!f || !fastOn()) return
  const wait = MIN - ((Date.now() - f.start) % MIN) + 250
  fastTimer = setTimeout(() => {
    void renderFast()
    armFastTimer()
  }, wait)
}

/** Server pushes that refresh the notification while the app isn't running. */
async function syncFastPush() {
  const f = activeFast.value
  const on = !!f && fastOn() && pushOn.value
  const d = f ? await readFastDismissed() : null
  const want = on && f && d !== true && d !== f.start
  const sig = want ? `${f.id}|${f.start}|${f.goal}` : 'off'
  if (sig === fastSig) return
  const first = fastSig === ''
  fastSig = sig
  if (!want || !f) {
    if (!first || pushOn.value) cancelPush('fast-live')
    return
  }
  const goalAt = f.start + f.goal * 3600000
  const label = protocolLabel(f.goal)
  let tz: string | undefined
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    tz = undefined
  }
  const data = {
    kind: 'fast',
    start: f.start,
    goal: f.goal,
    label,
    tz,
    locale: navigator.language,
  }
  const t = fastLiveText(data)
  schedulePush('fast-live', Date.now() + LIVE_EVERY, t.title, t.body, {
    tag: TAG_FAST,
    every: LIVE_EVERY,
    marks: [goalAt],
    until: Math.max(goalAt, Date.now()) + 24 * 3600000, // a forgotten fast stops updating a day past its goal
    data,
  })
}

/** Show, update or close the fasting notification and keep its server pushes in step. */
export function syncFastNotification() {
  void renderFast()
  armFastTimer()
  void syncFastPush()
}

// ---- heart rate -------------------------------------------------------------------------

export interface LiveHRState {
  bpm: number | null
  zone: number | null
  inZone: boolean | null
  elapsedSec: number
  phase?: string
  target?: number | null
}

const HR_EVERY = 5000
let hrState: LiveHRState | null = null
let hrShownAt = 0
let hrShownZone: number | null = null
let hrShowing = false
let hrTimer: ReturnType<typeof setTimeout> | null = null

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  return `${h ? h + ':' : ''}${mm}:${String(s % 60).padStart(2, '0')}`
}

/** Title and body for a heart-rate state (exported for tests). */
export function hrText(s: LiveHRState) {
  const title = s.bpm == null ? 'Heart rate · no signal' : `${s.bpm} bpm${s.zone ? ` · Zone ${s.zone}` : ''}`
  const time = clock(s.elapsedSec)
  const tail = [time, s.phase].filter(Boolean).join(' · ')
  let body = tail
  if (s.target && s.zone && s.bpm != null) {
    if (s.inZone || s.zone === s.target) body = `In zone · ${tail}`
    else if (s.zone < s.target) body = `Below zone ${s.target} · pick it up · ${time}`
    else body = `Above zone ${s.target} · ease off · ${time}`
  }
  return { title, body }
}

function hrWanted() {
  return !!hrState && settings.value.liveHR !== false && notifyAllowed() && !hrDismissed && (hidden() || settings.value.liveHRVisible === true)
}

async function renderHR() {
  if (hrTimer) clearTimeout(hrTimer)
  hrTimer = null
  const s = hrState
  if (!s || !hrWanted()) {
    if (hrShowing) {
      hrShowing = false
      await closeTag(TAG_HR)
    }
    return
  }
  hrShownAt = Date.now()
  hrShownZone = s.zone
  const { title, body } = hrText(s)
  const color = s.zone ? ZONE_COLORS[s.zone - 1] || '#ffffff' : '#7f8ba3'
  const num = s.bpm == null ? '--' : s.bpm
  const [badge, icon] = await Promise.all([badgeFor(num), iconFor(num, s.zone ? `ZONE ${s.zone}` : 'BPM', color)])
  if (!hrState || !hrWanted()) return
  hrShowing = true
  await show(title, {
    body,
    tag: TAG_HR,
    renotify: false,
    silent: true,
    badge: badge || STATIC_BADGE,
    icon: icon || STATIC_ICON,
    data: { path: '/live', kind: 'hr' },
  })
}

/**
 * Show or update the heart-rate notification (at most every 5 s, at once when the zone changes);
 * `null` ends the session and closes it. By default it shows only while Gloop is in the background.
 */
export function liveHR(state: LiveHRState | null) {
  if (state === null) {
    hrState = null
    hrDismissed = false
    hrShownZone = null
    if (hrTimer) clearTimeout(hrTimer)
    hrTimer = null
    hrShowing = false
    void closeTag(TAG_HR)
    void closeTag(TAG_ALERT)
    return
  }
  hrState = state
  if (!hrWanted()) {
    if (hrShowing) void renderHR()
    return
  }
  const since = Date.now() - hrShownAt
  if (!hrShowing || state.zone !== hrShownZone || since >= HR_EVERY) void renderHR()
  else if (!hrTimer) hrTimer = setTimeout(() => void renderHR(), HR_EVERY - since)
}

let alertAt = 0
/** An alerting notification (vibrates) while Gloop is in the background, at most once a minute. */
export function zoneAlert(text: string) {
  if (!hidden() || !notifyAllowed()) return
  const now = Date.now()
  if (now - alertAt < 60000) return
  alertAt = now
  const s = hrState
  void (async () => {
    const badge = s?.bpm != null ? await badgeFor(s.bpm) : null
    await show(text, {
      body: s?.bpm != null ? `${s.bpm} bpm now${s.target ? ` · aim for zone ${s.target}` : ''}` : 'Open Gloop to see your heart rate',
      tag: TAG_ALERT,
      renotify: true,
      silent: false,
      vibrate: [300, 150, 300, 150, 300],
      badge: badge || STATIC_BADGE,
      icon: STATIC_ICON,
      data: { path: '/live', kind: 'zone' },
    })
  })()
}

// ---- start-up ---------------------------------------------------------------------------

let started = false

/** Call once after the store has loaded. */
export function startLiveNotifications() {
  if (started) return
  started = true
  // fast started, ended or edited (here or synced from another device), switch flipped, push on/off
  effect(() => {
    void activeFast.value
    void settings.value.liveFast
    void pushOn.value
    queueMicrotask(syncFastNotification)
  })
  // heart-rate switches flipped
  effect(() => {
    void settings.value.liveHR
    void settings.value.liveHRVisible
    queueMicrotask(() => hrState && void renderHR())
  })
  document.addEventListener('visibilitychange', () => {
    void renderFast()
    armFastTimer()
    if (hrState) void renderHR()
    if (!hidden()) {
      alertAt = 0
      void closeTag(TAG_ALERT) // the screen shows it now
    }
  })
  try {
    navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
      const m = e.data
      if (!m || typeof m !== 'object') return
      if (m.type === 'gloop-open' && typeof m.path === 'string') navigate(m.path)
      if (m.type === 'gloop-live-dismissed') {
        if (m.tag === TAG_FAST) {
          fastDismissedStart = typeof m.start === 'number' ? m.start : true
          fastSig = 'dismissed' // the worker already told the server
        }
        if (m.tag === TAG_HR) {
          hrDismissed = true
          hrShowing = false
        }
      }
    })
  } catch {
    /* no service worker here */
  }
}
