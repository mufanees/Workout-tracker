// The accent colour (Settings → Appearance). Lime by default; any colour works: the text on it
// (--accent-ink) and the accent used as text (--accent-text) are worked out for contrast.

export const ACCENTS: [string, string][] = [
  ['#c6f432', 'Lime'],
  ['#3ee6a8', 'Mint'],
  ['#4cc2ff', 'Sky'],
  ['#a78bfa', 'Violet'],
  ['#ff6fb5', 'Pink'],
  ['#ff7a59', 'Coral'],
  ['#ffc23a', 'Amber'],
]
export const DEFAULT_ACCENT = ACCENTS[0][0]

type RGB = [number, number, number]
const hex = (h: string): RGB | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: RGB) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')
const lum = (c: RGB) => {
  const f = (v: number) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Mix toward black or white until the colour reads on `bg` (WCAG 4.5:1). */
function readable(c: RGB, bg: RGB): RGB {
  const toward: RGB = lum(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255]
  for (let t = 0; t <= 1; t += 0.05) {
    const x = mix(c, toward, t)
    if (contrast(x, bg) >= 4.5) return x
  }
  return toward
}

/** Apply `color` (null = the default lime) for the dark or light theme. */
export function applyAccent(color: string | null | undefined, dark: boolean) {
  const root = document.documentElement.style
  const c = color ? hex(color) : null
  if (!c || color!.toLowerCase() === DEFAULT_ACCENT) {
    for (const p of ['--accent', '--accent-ink', '--accent-text', '--accent-soft']) root.removeProperty(p)
    return
  }
  const bg: RGB = dark ? [11, 12, 15] : [242, 241, 236]
  const ink: RGB = contrast(c, [11, 12, 15]) >= contrast(c, [255, 255, 255]) ? [11, 12, 15] : [255, 255, 255]
  root.setProperty('--accent', toHex(c))
  root.setProperty('--accent-ink', toHex(ink))
  root.setProperty('--accent-text', toHex(readable(c, bg)))
  root.setProperty('--accent-soft', `rgba(${c.join(', ')}, ${dark ? 0.12 : 0.16})`)
}
