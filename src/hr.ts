// Bluetooth heart rate (standard BLE Heart Rate Service 0x180D, which the Garmin HRM-Dual broadcasts).
// Uses Web Bluetooth: Chrome on Android, desktop Chrome/Edge. Not available in iOS browsers.
import { signal, computed } from '@preact/signals'
import { active, settings, updateActive } from './store'
import { haptic } from './util'

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

function parse(v: DataView): number {
  const flags = v.getUint8(0)
  return flags & 0x01 ? v.getUint16(1, true) : v.getUint8(1)
}

function onMeasurement(e: Event) {
  const v = (e.target as BTChar).value
  if (!v) return
  const hr = parse(v)
  if (hr > 0 && hr < 250) {
    bpm.value = hr
    lastBeatAt = Date.now()
  }
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
let outSince = 0
export const zoneAlert = signal<'above' | 'below' | null>(null)

setInterval(() => {
  const w = active.value
  const hr = bpm.value
  const fresh = hr != null && Date.now() - lastBeatAt < 6000
  if (!w || !fresh) {
    zoneAlert.value = null
    return
  }
  updateActive((x) => {
    x.hr = x.hr || []
    x.hr.push([Math.round((Date.now() - x.start) / 1000), hr!])
  })
  const target = w.targetZone ?? settings.value.targetZone
  if (!target) return
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
    if (zoneAlert.value !== next) haptic(300)
    zoneAlert.value = next
  }
}, SAMPLE_MS)

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
