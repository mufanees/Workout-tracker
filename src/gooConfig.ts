// Live goo settings (Settings → Goo). Everything gooey reads these at the moment it animates,
// so moving a slider changes the next motion straight away.

export interface GooTweaks {
  /** master switch: off makes every goo motion a plain cut */
  enabled: boolean
  /** filter blur: how far apart shapes still melt together (0.4–1.8) */
  intensity: number
  /** playback speed (0.5 slow – 2 fast) */
  speed: number
  /** size and reach of the lumps and bulges (0 none – 2) */
  lumps: number
  /** how much it wobbles as it settles (0 none – 2) */
  wobble: number
  /** easing: 0 soft (even glide) – 2 dramatic (slow off the mark, fast through the middle, a long slow landing) */
  drama: number
  /** how far the drops trail behind (0 none – 2) */
  trail: number
  /** droplets off any tap */
  taps: boolean
  /** motes rising off the active tab */
  motes: boolean
  /** lava blobs in the plan card */
  lava: boolean
}

export const GOO_DEFAULTS: GooTweaks = { enabled: true, intensity: 1, speed: 1, lumps: 1, wobble: 1, drama: 1.3, trail: 1, taps: true, motes: true, lava: true }

export const goo: GooTweaks = { ...GOO_DEFAULTS }

export function setGoo(t: Partial<GooTweaks> | null | undefined) {
  Object.assign(goo, GOO_DEFAULTS, t || {})
  const root = document.documentElement
  root.classList.toggle('goo-off', !goo.enabled)
  root.classList.toggle('no-motes', !goo.motes)
  root.classList.toggle('no-lava', !goo.lava)
  // filter strength: every goo filter's blur scales with intensity
  const blur: Record<string, number> = { goo: 7, 'goo-sm': 3.2, 'goo-merge': 8, 'goo-merge-sm': 3, 'goo-merge-lg': 10, 'goo-soft': 14 }
  for (const [id, base] of Object.entries(blur)) document.querySelector(`#${id} feGaussianBlur`)?.setAttribute('stdDeviation', String(base * goo.intensity))
}

/**
 * The glide curve for the current drama setting, as a cubic-bezier string for CustomEase:
 * (a, 0, b, 1). More drama = a later, harder push off and a longer, slower landing.
 */
export function glideCurve(): { move: string; size: string; seconds: number } {
  const d = Math.max(0, Math.min(2, goo.drama))
  const a = (0.25 + 0.32 * d).toFixed(3)
  const b = Math.max(0.02, 0.22 - 0.09 * d).toFixed(3)
  const as = (0.22 + 0.22 * d).toFixed(3)
  return { move: `M0,0 C${a},0 ${b},1 1,1`, size: `M0,0 C${as},0 ${(Number(b) + 0.06).toFixed(3)},1 1,1`, seconds: 0.85 + 0.25 * d }
}

/** Seconds scaled by the speed setting. */
export const gt = (s: number) => s / goo.speed

/** The settle wobble as a GSAP ease and duration, from the wobble setting. */
export function wobbleEase(): { ease: string; duration: number } {
  if (goo.wobble <= 0.05) return { ease: 'power2.out', duration: gt(0.4) }
  const period = Math.max(0.2, Math.min(1, 0.55 / goo.wobble))
  return { ease: `elastic.out(${(0.8 + goo.wobble * 0.2).toFixed(2)}, ${period.toFixed(2)})`, duration: gt(0.7 + 0.4 * Math.min(goo.wobble, 2)) }
}
