// Bluetooth heart rate (standard BLE Heart Rate Service 0x180D, which the Garmin HRM-Dual broadcasts).
// Uses Web Bluetooth: Chrome on Android, desktop Chrome/Edge. Not available in iOS browsers.
import { signal, computed } from '@preact/signals'
import { active, settings, updateActive } from './store'
import { haptic } from './util'
import { cardioPhase, PHASE_NAMES } from './cardio'
import type { Workout } from './types'
import { liveHR, zoneAlert as notifyZone, type LiveHRState } from './liveNotify'

/* Minimal Web Bluetooth typings (not in TypeScript's DOM lib). */
interface BTChar extends EventTarget {
  value?: DataView
  startNotifications(): Promise<BTChar>
}
interface BTServer {
  connected: boolean
  connect(): Promise<BTServer>
  disconnect(): void
  getPrimaryService(s: string): Promise<{ getCharacteristic(c: string): Promise<BTChar> }>
}
interface BTDevice extends EventTarget {
  id: string
  name?: string
  gatt?: BTServer
  watchAdvertisements?: () => Promise<void>
}
interface BT {
  requestDevice(o: unknown): Promise<BTDevice>
  getDevices?: () => Promise<BTDevice[]>
}
const bt = (): BT | undefined => (navigator as unknown as { bluetooth?: BT }).bluetooth

export const hrSupported = typeof navigator !== 'undefined' && !!bt()

export type HRStatus = 'off' | 'connecting' | 'connected' | 'reconnecting'
export const hrStatus = signal<HRStatus>('off')
export const hrName = signal<string>('')
export const bpm = signal<number | null>(null)
let lastBeatAt = 0

const DEVICE_KEY = 'reps-hr-device'
let device: BTDevice | null = null
let wantConnected = false
let retry: ReturnType<typeof setTimeout> | null = null
let retries = 0

// ---- zones ------------------------------------------------------------------

export const ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Max']
export const ZONE_COLORS = ['#7f8ba3', '#c6f432', '#ffd23f', '#ff9a3d', '#ff5a5a']

/** Zone number 1-5 for a heart rate. */
export function zoneOf(hr: number, bounds = settings.value.hrZones): number {
  for (let i = 0; i < 4; i++) if (hr <= bounds[i]) return i + 1
  return 5
}

/** bpm range text for a zone, e.g. "120–145". */
export function zoneRange(z: number, bounds = settings.value.hrZones): string {
  if (z === 1) return `≤${bounds[0]}`
  if (z === 5) return `${bounds[3] + 1}+`
  return `${bounds[z - 2] + 1}–${bounds[z - 1]}`
}

export const zone = computed(() => (bpm.value ? zoneOf(bpm.value) : null))

// ---- connection ---------------------------------------------------------------

/** Heart Rate Measurement: flags, bpm (8 or 16 bit), optional energy, optional R-R intervals (1/1024 s). */
export function parseMeasurement(v: DataView): { hr: number; rr: number[] } {
  const flags = v.getUint8(0)
  let i = 1
  const hr = flags & 0x01 ? v.getUint16(i, true) : v.getUint8(i)
  i += flags & 0x01 ? 2 : 1
  if (flags & 0x08) i += 2 // energy expended
  const rr: number[] = []
  if (flags & 0x10) for (; i + 1 < v.byteLength; i += 2) rr.push((v.getUint16(i, true) / 1024) * 1000)
  return { hr, rr }
}

/** Listeners for raw beat-to-beat intervals (ms), used by the morning HRV reading. */
export const rrListeners = new Set<(rr: number[], hr: number) => void>()

function onMeasurement(e: Event) {
  const v = (e.target as BTChar).value
  if (!v) return
  const { hr, rr } = parseMeasurement(v)
  if (hr > 0 && hr < 250) {
    bpm.value = hr
    lastBeatAt = Date.now()
    for (const fn of rrListeners) fn(rr, hr)
    // Timers are throttled to about once a minute in the background; the strap's own events
    // keep the recording and the notification going (both are paced to 5 s inside).
    if (Date.now() - lastTick >= SAMPLE_MS - 250) tick()
    else pushLiveHR()
  }
}

/** RMSSD in ms from R-R intervals, dropping artefacts (implausible or >20% jumps). */
export function rmssd(rr: number[]): number | null {
  const clean: number[] = []
  for (const x of rr) {
    if (x < 300 || x > 2000) continue
    const prev = clean[clean.length - 1]
    if (prev && Math.abs(x - prev) / prev > 0.2) continue
    clean.push(x)
  }
  if (clean.length < 20) return null
  let sum = 0
  for (let k = 1; k < clean.length; k++) sum += (clean[k] - clean[k - 1]) ** 2
  return Math.round(Math.sqrt(sum / (clean.length - 1)))
}

async function attach(d: BTDevice) {
  device = d
  hrName.value = d.name || 'Heart rate monitor'
  d.removeEventListener('gattserverdisconnected', onDisconnect)
  d.addEventListener('gattserverdisconnected', onDisconnect)
  const server = await d.gatt!.connect()
  const service = await server.getPrimaryService('heart_rate')
  const ch = await service.getCharacteristic('heart_rate_measurement')
  ch.addEventListener('characteristicvaluechanged', onMeasurement)
  await ch.startNotifications()
  hrStatus.value = 'connected'
  retries = 0
  try {
    localStorage.setItem(DEVICE_KEY, d.id)
  } catch {
    /* storage blocked */
  }
}

function onDisconnect() {
  bpm.value = null
  if (!wantConnected || !device) {
    hrStatus.value = 'off'
    return
  }
  // Straps drop out when you take them off or move away; keep trying quietly.
  hrStatus.value = 'reconnecting'
  scheduleRetry()
}

function scheduleRetry() {
  if (retry) clearTimeout(retry)
  const delay = Math.min(30000, 1000 * 2 ** Math.min(retries++, 5))
  retry = setTimeout(async () => {
    if (!wantConnected || !device) return
    try {
      await attach(device)
    } catch {
      scheduleRetry()
    }
  }, delay)
}

/** Ask the user to pick a strap (must be called from a tap). */
export async function connectHR(): Promise<boolean> {
  const b = bt()
  if (!b) return false
  wantConnected = true
  hrStatus.value = 'connecting'
  try {
    const d = await b.requestDevice({ filters: [{ services: ['heart_rate'] }] })
    await attach(d)
    return true
  } catch (e) {
    hrStatus.value = device?.gatt?.connected ? 'connected' : 'off'
    if ((e as Error)?.name !== 'NotFoundError') console.warn(e)
    return false
  }
}

export function disconnectHR() {
  wantConnected = false
  if (retry) clearTimeout(retry)
  device?.gatt?.disconnect()
  device = null
  bpm.value = null
  hrStatus.value = 'off'
  try {
    localStorage.removeItem(DEVICE_KEY)
  } catch {
    /* storage blocked */
  }
}

/** Reconnect to the last strap without the picker, where the browser allows it. */
export async function reconnectSaved() {
  const b = bt()
  let id: string | null = null
  try {
    id = localStorage.getItem(DEVICE_KEY)
  } catch {
    /* storage blocked */
  }
  if (!b?.getDevices || !id) return
  try {
    const d = (await b.getDevices()).find((x) => x.id === id)
    if (!d) return
    wantConnected = true
    hrStatus.value = 'reconnecting'
    hrName.value = d.name || 'Heart rate monitor'
    device = d
    try {
      await d.watchAdvertisements?.()
    } catch {
      /* not supported; try a direct connect */
    }
    await attach(d).catch(() => scheduleRetry())
  } catch {
    hrStatus.value = 'off'
  }
}

// ---- recording + target zone alerts -------------------------------------------

const SAMPLE_MS = 5000
/** Zone alerts stay quiet this long into a workout with a target zone: nobody starts in zone 2. */
export const GRACE_MS = 5 * 60000
let outSince = 0
export const zoneAlert = signal<'above' | 'below' | null>(null)

/**
 * Why zone alerts are paused right now, if they are: the warm-up (a cardio session's warm-up phase,
 * else the first 5 minutes of any workout with a target zone; `until` = when alerts start) or a
 * cardio session's cool-down. Null when alerts are live (or there's no target to hold).
 */
export function alertPause(w: Workout | null, now = Date.now()): { reason: 'warmup'; until: number } | { reason: 'cooldown' } | null {
  if (!w) return null
  const target = w.targetZone ?? (w.cardio ? null : settings.value.targetZone)
  if (!target) return null
  const phase = cardioPhase(w, now)
  if (phase === 'cooldown') return { reason: 'cooldown' }
  if (phase === 'warmup') return { reason: 'warmup', until: w.start + w.cardio!.warmupMin * 60000 }
  if (phase === 'main') return null
  return now - w.start < GRACE_MS ? { reason: 'warmup', until: w.start + GRACE_MS } : null
}

/** The zone a workout holds: its own, else (outside cardio sessions) the one in Settings. */
export const targetOf = (w: Workout) => w.targetZone ?? (w.cardio ? null : settings.value.targetZone) ?? null

export const alertText = (dir: 'above' | 'below', target: number) => (dir === 'above' ? `Above zone ${target}. Ease off a little.` : `Below zone ${target}. Pick it up a little.`)

let liveSent = false
/** Tell the live notification where heart rate is (every sample, zone change, phase change); null once it's over. */
export function pushLiveHR() {
  const w = active.value
  if (!w || hrStatus.value === 'off') {
    if (liveSent) liveHR(null)
    liveSent = false
    return
  }
  const fresh = bpm.value != null && Date.now() - lastBeatAt < 6000
  const hr = fresh ? bpm.value : null
  const z = hr ? zoneOf(hr) : null
  const target = targetOf(w)
  const phase = cardioPhase(w)
  const state: LiveHRState = {
    bpm: hr,
    zone: z,
    inZone: target && z ? z === target : null,
    elapsedSec: Math.round((Date.now() - w.start) / 1000),
    phase: phase ? PHASE_NAMES[phase] : alertPause(w)?.reason === 'warmup' ? 'Warm-up' : undefined,
    target,
  }
  liveSent = true
  liveHR(state)
}

let lastTick = 0
/** One 5 s step: record a sample into the active workout, update the notification, check the zone. */
function tick() {
  lastTick = Date.now()
  const w = active.value
  const hr = bpm.value
  const fresh = hr != null && Date.now() - lastBeatAt < 6000
  pushLiveHR()
  if (!w || !fresh) {
    zoneAlert.value = null
    return
  }
  updateActive((x) => {
    x.hr = x.hr || []
    x.hr.push([Math.round((Date.now() - x.start) / 1000), hr!])
  })
  const target = targetOf(w)
  // no target, or still warming up / cooling down: never nag
  if (!target || alertPause(w)) {
    outSince = 0
    zoneAlert.value = null
    return
  }
  const z = zoneOf(hr!)
  if (z === target) {
    outSince = 0
    zoneAlert.value = null
    return
  }
  outSince ||= Date.now()
  // Only nudge after 15 s out of zone, so brief spikes don't nag.
  if (Date.now() - outSince >= 15000) {
    const next = z > target ? 'above' : 'below'
    if (zoneAlert.value !== next) {
      haptic(300)
      notifyZone(alertText(next, target))
    }
    zoneAlert.value = next
  }
}
setInterval(() => {
  if (Date.now() - lastTick >= SAMPLE_MS - 250) tick()
}, 1000)

// a zone change shows on the notification at once, not at the next sample
let lastZone: number | null = null
zone.subscribe((z) => {
  if (z === lastZone) return
  lastZone = z
  if (active.value) pushLiveHR()
})

// ---- summaries ------------------------------------------------------------------

export interface HRSummary {
  avg: number
  max: number
  zoneSeconds: number[] // index 0 = zone 1
}

export function summarizeHR(samples: [number, number][] | undefined, bounds = settings.value.hrZones): HRSummary | null {
  if (!samples || samples.length < 2) return null
  const zoneSeconds = [0, 0, 0, 0, 0]
  let sum = 0
  let max = 0
  for (let i = 0; i < samples.length; i++) {
    const [t, hr] = samples[i]
    sum += hr
    max = Math.max(max, hr)
    const next = samples[i + 1]
    // Credit each sample with the time until the next one, capped so a dropout doesn't count.
    const dt = next ? Math.min(next[0] - t, 15) : 5
    zoneSeconds[zoneOf(hr, bounds) - 1] += Math.max(0, dt)
  }
  return { avg: Math.round(sum / samples.length), max, zoneSeconds }
}
