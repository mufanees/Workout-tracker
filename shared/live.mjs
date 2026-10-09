// Text and images for Gloop's "live" notifications (fasting timer, heart rate). Plain JS with no
// imports, used by three places: the app (src/liveNotify.ts), the server (server/push.mjs, which
// writes the text when the service worker fetches it) and the service worker (vite.config.js
// pastes this file into dist/sw.js with the `export` keywords removed).

const LIVE_H = 3600000

/** "14h 05m" */
export function liveHm(ms) {
  const m = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

function liveClock(t, now, tz, locale) {
  const opt = tz ? { timeZone: tz } : {}
  let loc = locale || undefined
  let time
  try {
    time = new Intl.DateTimeFormat(loc, {
      hour: 'numeric',
      minute: '2-digit',
      ...opt,
    }).format(t)
  } catch {
    loc = undefined
    time = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(t)
  }
  // another day: say which
  let day
  try {
    const d = (x) =>
      new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        ...opt,
      }).format(x)
    if (d(t) !== d(now)) day = new Intl.DateTimeFormat(loc, { weekday: 'short', ...opt }).format(t)
  } catch {
    /* keep the time alone */
  }
  return day ? `${day} ${time}` : time
}

/**
 * The fasting notification for a running fast.
 * @param {{start: number, goal: number, label?: string, tz?: string, locale?: string}} f
 */
export function fastLiveText(f, now = Date.now()) {
  const el = Math.max(0, now - f.start)
  const goalAt = f.start + f.goal * LIVE_H
  const label = f.label || `${f.goal} h`
  const title = `Fasting ${liveHm(el)} · ${label}`
  const at = liveClock(goalAt, now, f.tz, f.locale)
  const body = now < goalAt ? `Goal at ${at} · ${liveHm(goalAt - now)} to go` : `Goal reached at ${at} · +${liveHm(now - goalAt)}`
  return {
    title,
    body,
    hours: Math.floor(el / LIVE_H),
    progress: Math.min(1, el / (f.goal * LIVE_H)),
    done: now >= goalAt,
  }
}

function liveCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  return null
}

const LIVE_FONT = `"Space Grotesk Variable", "sans-serif-condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif`

/** Draws `text` as large as fits in the box (centred at cx, cy), squeezing it sideways if needed. */
function liveFit(ctx, text, cx, cy, maxW, maxH, weight = 700) {
  // size by digit height (cap height of digits is about 0.72 em in most fonts)
  const size = maxH / 0.72
  ctx.font = `${weight} ${size}px ${LIVE_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const m = ctx.measureText(text)
  const asc = m.actualBoundingBoxAscent || size * 0.72
  const desc = m.actualBoundingBoxDescent || 0
  const w = m.width || maxW
  const sx = Math.min(1, maxW / w)
  ctx.save()
  ctx.translate(cx, cy + (asc - desc) / 2)
  ctx.scale(sx, 1)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/**
 * Status-bar badge: white digits on transparent, 96×96 (Android masks it to one colour, shown at
 * about 24 dp). Returns a canvas or null.
 */
export function liveBadgeCanvas(text) {
  const c = liveCanvas(96, 96)
  if (!c) return null
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  const t = String(text)
  // fewer characters can stand taller; 3 digits are squeezed to the full width
  liveFit(ctx, t, 48, 48, 96, t.length <= 2 ? 80 : 74, 800)
  return c
}

/**
 * The large icon: a dark disc with a coloured ring (progress 0..1, or a full ring), the number in
 * white and a small label under it. 192×192.
 */
export function liveIconCanvas(text, label, color, progress = 1) {
  const c = liveCanvas(192, 192)
  if (!c) return null
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#121418'
  ctx.beginPath()
  ctx.arc(96, 96, 96, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 16
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.beginPath()
  ctx.arc(96, 96, 80, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.beginPath()
  const p = Math.max(0.001, Math.min(1, progress))
  ctx.arc(96, 96, 80, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  liveFit(ctx, String(text), 96, 86, 112, 54, 700)
  if (label) {
    ctx.fillStyle = color
    liveFit(ctx, String(label), 96, 136, 96, 18, 700)
  }
  return c
}

/** A canvas as a data: URL (works for both canvas kinds). Resolves null on failure. */
export async function liveDataUrl(c) {
  try {
    if (!c) return null
    if (typeof c.toDataURL === 'function') return c.toDataURL('image/png')
    const blob = await c.convertToBlob({ type: 'image/png' })
    if (typeof FileReader !== 'undefined') {
      return await new Promise((res) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result))
        r.onerror = () => res(null)
        r.readAsDataURL(blob)
      })
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return 'data:image/png;base64,' + btoa(s)
  } catch {
    return null
  }
}

export const LIVE_FAST_COLOR = '#6aa8ff'
