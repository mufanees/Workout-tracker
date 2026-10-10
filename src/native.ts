// Native powers when Gloop runs inside its Android app (Capacitor; android/, capacitor.config.ts).
// The app loads the same site, and Capacitor injects `window.Capacitor` before any script runs,
// so this module can tell at load time. On the web everything here is a no-op: `@capacitor/core`
// is only imported (lazily, as its own chunk) when native, and the web paths stay as they were.
//
// Plugins (Kotlin, android/app/src/main/java/my/novas/gloop/): HeartRate (BLE strap in a
// foreground service), LiveNotification (ongoing notifications with a native clock and the
// number in the status bar), Timers (exact alarms for rest / set timers), Phone (keep the screen
// on, permissions, system settings pages), OnDeviceAI (Gemini Nano through ML Kit, optional).

type Handle = { remove(): Promise<void> }

export interface NativeHRSample {
  seq: number
  at: number
  bpm: number
  rr: number[]
}
export type NativeHRState = 'off' | 'connecting' | 'connected' | 'reconnecting'
export interface NativeHRStatus {
  state: NativeHRState
  running: boolean
  deviceId?: string
  name?: string
  bpm?: number
  at?: number
  seq?: number
}
export interface NativeHRConfig {
  zones: number[]
  target: number | null
  startedAt: number | null
  quietUntil: number | null
  quietFrom: number | null
  alerts: boolean
}

interface HeartRatePlugin {
  pick(): Promise<{ id: string; name: string }>
  connect(o: { deviceId: string; name?: string }): Promise<{ deviceId: string }>
  disconnect(): Promise<void>
  status(): Promise<NativeHRStatus>
  drain(o: { after: number }): Promise<{ samples: NativeHRSample[] }>
  configure(o: Partial<NativeHRConfig>): Promise<void>
  addListener(e: 'hr', fn: (s: NativeHRSample) => void): Promise<Handle>
  addListener(e: 'hrBatch', fn: (b: { samples: NativeHRSample[] }) => void): Promise<Handle>
  addListener(e: 'status', fn: (s: NativeHRStatus) => void): Promise<Handle>
}

export interface LiveSpec {
  kind: 'hr' | 'fast' | 'timer'
  title: string
  text: string
  /** Epoch ms the notification's clock counts up from (or down to, with `countdown`). */
  chronometerBase?: number
  countdown?: boolean
  /** Drawn into the status bar icon. */
  number?: string
  progress?: number
  color?: string
  goalAt?: number
  doneTitle?: string
  doneText?: string
  /** Fast: the app keeps the hours in the status bar current itself. */
  hourly?: boolean
  path?: string
}

interface LiveNotificationPlugin {
  show(o: LiveSpec): Promise<void>
  clear(o: { kind: LiveSpec['kind'] }): Promise<void>
  alert(o: { title: string; text: string; number?: string }): Promise<void>
  takeOpened(): Promise<{ path?: string }>
  addListener(e: 'open', fn: (o: { path: string }) => void): Promise<Handle>
}

interface TimersPlugin {
  schedule(o: { id: string; at: number; title: string; text: string; path?: string; clearsLive?: boolean }): Promise<{ exact: boolean }>
  cancel(o: { id: string }): Promise<void>
  status(): Promise<{ exact: boolean; sdk: number }>
}

export type Perm = 'granted' | 'denied' | 'prompt'
export interface PhoneStatus {
  bluetooth: Perm
  bluetoothOn: boolean
  notifications: Perm
  exactAlarms: boolean
  batteryUnrestricted: boolean
  sdk: number
  model: string
}
interface PhonePlugin {
  keepAwake(o: { on: boolean }): Promise<void>
  status(): Promise<PhoneStatus>
  request(o: { what: 'bluetooth' | 'notifications' }): Promise<PhoneStatus>
  open(o: { what: 'battery' | 'notifications' | 'exactAlarms' | 'bluetooth' | 'app' }): Promise<void>
}

export type AIStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable'
interface OnDeviceAIPlugin {
  status(): Promise<{ status: AIStatus; error?: string }>
  download(): Promise<{ status: AIStatus }>
  prompt(o: { system?: string; text: string; maxTokens?: number; timeoutMs?: number }): Promise<{ text: string }>
  addListener(e: 'aiDownload', fn: (o: { state: 'started' | 'progress' | 'done' | 'failed'; bytes?: number; error?: string }) => void): Promise<Handle>
}

/** True inside the Android app. Decided once: Capacitor's bridge is injected before the page's scripts. */
export const isNative: boolean = (() => {
  try {
    return !!(globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  } catch {
    return false
  }
})()

let core: Promise<typeof import('@capacitor/core')> | null = null
const registered = new Map<string, unknown>()

/**
 * A plugin, boxed: Capacitor's plugin proxies answer every property, `then` included, so a bare
 * proxy resolved from an async function would be taken for a promise (and call a native "then").
 */
async function plugin<T>(name: string): Promise<{ p: T } | null> {
  if (!isNative) return null
  try {
    core ||= import('@capacitor/core')
    const { registerPlugin } = await core
    let p = registered.get(name) as T | undefined
    if (!p) {
      p = registerPlugin<T & object>(name) as T
      registered.set(name, p)
    }
    return { p }
  } catch {
    return null
  }
}

export const nativeHR = () => plugin<HeartRatePlugin>('HeartRate')
const live = () => plugin<LiveNotificationPlugin>('LiveNotification')
const timers = () => plugin<TimersPlugin>('Timers')
const phone = () => plugin<PhonePlugin>('Phone')
const ai = () => plugin<OnDeviceAIPlugin>('OnDeviceAI')

/** Run a native call, ignoring failures (a missing plugin in an old app build, a revoked permission). */
async function quietly<T>(fn: () => Promise<T> | undefined): Promise<T | null> {
  try {
    return (await fn()) ?? null
  } catch {
    return null
  }
}

// ---- live notifications ------------------------------------------------------------------

export const liveShow = (s: LiveSpec) => quietly(async () => (await live())?.p.show(s))
export const liveClear = (kind: LiveSpec['kind']) => quietly(async () => (await live())?.p.clear({ kind }))
export const liveAlert = (title: string, text: string, number?: string) => quietly(async () => (await live())?.p.alert({ title, text, ...(number ? { number } : {}) }))

/** Taps on Gloop's notifications ("/fast", "/live"): call once at start-up. */
export async function onNotificationOpen(go: (path: string) => void) {
  const p = (await live())?.p
  if (!p) return
  let last = ''
  let lastAt = 0
  const open = (path?: string) => {
    if (!path || !path.startsWith('/')) return
    // the same tap can arrive as a retained event and through takeOpened()
    if (path === last && Date.now() - lastAt < 3000) return
    last = path
    lastAt = Date.now()
    go(path)
  }
  await quietly(() => p.addListener('open', (o) => open(o.path)))
  const pending = await quietly(() => p.takeOpened())
  open(pending?.path)
}

// ---- timers ---------------------------------------------------------------------------------

/**
 * A timer's end as an exact alarm (fires with the screen locked: sound + vibration when Gloop isn't
 * on screen), plus a countdown in the shade while it runs. `at` null cancels both.
 */
let timerChain: Promise<unknown> = Promise.resolve()
export function nativeTimer(id: string, at: number | null, title = '', text = '', shade?: { title: string; text: string }) {
  if (!isNative) return
  // in order: a cancel right before a schedule (rest → set timer) must not land after it
  timerChain = timerChain.then(() => quietly(async () => {
    const t = (await timers())?.p
    if (!t) return
    if (at == null) {
      await t.cancel({ id })
      if (shade !== undefined || id === 'rest') await liveClear('timer')
      return
    }
    await t.schedule({ id, at, title, text, path: '/live', clearsLive: !!shade })
    if (shade) await liveShow({ kind: 'timer', title: shade.title, text: shade.text, chronometerBase: at, countdown: true, path: '/live' })
  }))
}

// ---- phone ----------------------------------------------------------------------------------

/** FLAG_KEEP_SCREEN_ON while a workout screen is open (the web Wake Lock is unreliable in the WebView). */
export const keepAwake = (on: boolean) => quietly(async () => (await phone())?.p.keepAwake({ on }))
export const phoneStatus = () => quietly(async () => (await phone())?.p.status())
export const phoneRequest = (what: 'bluetooth' | 'notifications') => quietly(async () => (await phone())?.p.request({ what }))
export const phoneOpen = (what: 'battery' | 'notifications' | 'exactAlarms' | 'bluetooth' | 'app') => quietly(async () => (await phone())?.p.open({ what }))

// ---- on-device AI ---------------------------------------------------------------------------

export async function aiStatus(): Promise<{ status: AIStatus; error?: string }> {
  const r = await quietly(async () => (await ai())?.p.status())
  return r ?? { status: 'unavailable' }
}

/** Download Gemini Nano (Settings only). `progress` gets bytes so far. */
export async function aiDownload(progress?: (bytes: number) => void): Promise<AIStatus> {
  const p = (await ai())?.p
  if (!p) return 'unavailable'
  const h = progress ? await quietly(() => p.addListener('aiDownload', (o) => o.bytes != null && progress(o.bytes))) : null
  try {
    return (await p.download()).status
  } catch {
    return (await aiStatus()).status
  } finally {
    void h?.remove()
  }
}

/** One prompt to the on-device model; null unless it's already downloaded and answers in time. Never downloads. */
export async function aiPrompt(o: { system?: string; text: string; maxTokens?: number; timeoutMs?: number }): Promise<string | null> {
  if (!isNative) return null
  const p = (await ai())?.p
  if (!p) return null
  try {
    if ((await p.status()).status !== 'available') return null
    return (await p.prompt(o)).text || null
  } catch {
    return null
  }
}

// ---- system bars ------------------------------------------------------------------------------

/** Status / navigation bar icons light on the dark theme, dark on the light one (the page decides). */
export function nativeBars(dark: boolean) {
  if (!isNative) return
  void quietly(async () => {
    core ||= import('@capacitor/core')
    const { SystemBars, SystemBarsStyle } = await core
    await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
  })
}
