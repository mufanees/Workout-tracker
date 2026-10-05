// Warm-up and cool-down lines stay free text ("Cat–cow × 8", "Doorway pec stretch · 30 s / side",
// "World's greatest stretch x4 each side (slow)"), but each line is read as a move + a dose + an
// optional note or link, and linked to a library exercise so it gets that exercise's video. Links
// you set by hand are remembered by move name, so they hold in every routine.
import { matchExercise, type LibExercise } from '../shared/planImport.mjs'
import { exercises, exMap, saveSettings, settings } from './store'
import { findUrl, searchUrl, videoFor } from './videos'
import type { Exercise } from './types'

export interface Move {
  raw: string
  name: string // the movement, e.g. "Cat–cow"
  dose: string // e.g. "× 8", "30 s / side", "2 × 10"; '' if none
  note: string // e.g. "slow", from "(slow)" or after " — "
  url: string | null // a link written on the line
  ramp: boolean // "Ramp-up set…" lines aren't movements
  combo: boolean // "Glute bridge + bodyweight squat × 10 each"
}

const DOSE = String.raw`(?:\d+\s*[×x*]\s*)?\d+(?:[–-]\d+)?\s*(?:s|sec|secs|seconds?|min|mins|minutes?|reps?|breaths?|m)?\b(?:\s*(?:\/\s*side|each side|per side|each|\/\s*leg|\/\s*arm|each way))?`

/** Read one line. Tolerant: separators ×, x, ·, :, – and a trailing dose all work. */
export function parseMove(line: string): Move {
  const raw = line.trim()
  const url = findUrl(raw)
  let text = raw.replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim()
  let note = ''
  const paren = text.match(/\s*\(([^)]*)\)\s*$/)
  if (paren) (note = paren[1].trim()), (text = text.slice(0, paren.index).trim())
  const dash = text.match(/\s+[—–]\s+(?!\d)(.+)$/) // "Bird dog × 8 — keep hips level"
  if (dash) (note = note || dash[1].trim()), (text = text.slice(0, dash.index).trim())
  let name = text
  let dose = ''
  const times = text.match(/^(.*?)\s*[×]\s*(.+)$/) || text.match(/^(.*?\S)\s+x\s*(\d.*)$/i)
  const dot = text.match(/^(.*?)\s*[·:]\s*(.+)$/)
  const tail = text.match(new RegExp(String.raw`^(.*?\S)\s*[–-]?\s+(${DOSE})$`, 'i'))
  if (times && times[1]) (name = times[1]), (dose = '× ' + times[2].trim())
  else if (dot && dot[1]) (name = dot[1]), (dose = dot[2].trim())
  else if (tail && tail[1] && !/\d$/.test(tail[1].trim())) (name = tail[1]), (dose = tail[2].trim())
  else {
    const lead = text.match(/^(\d+\s*(?:s|sec|secs|seconds?|min|mins|minutes?))\s+(.+)$/i) // "5 min easy bike"
    if (lead) (name = lead[2]), (dose = lead[1])
  }
  dose = dose
    .replace(/(\d)\s*[x*×]\s*(\d)/gi, '$1 × $2')
    .replace(/(\d)(s|sec|min)\b/gi, '$1 $2')
    .trim()
  name = name.trim().replace(/[\s,–-]+$/, '')
  return { raw, name: name || raw, dose, note, url, ramp: /^ramp-?up/i.test(raw), combo: /\s\+\s/.test(name) }
}

/** Remembered by name: lower-case letters only, so "Cat-cow" and "Cat–Cow" are the same move. */
export const moveKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '').replace(/s$/, '')

const words = (s: string) => s.toLowerCase().replace(/['’]/g, '').match(/[a-z0-9]+/g) || []

/**
 * The library exercise a move is linked to: one you picked by hand, else a confident match (every
 * word of the move in the exercise name, and the exercise not much longer than the move). Null for
 * text-only lines.
 */
export function moveExercise(m: Move): Exercise | null {
  if (m.ramp || m.combo) return null
  const links = settings.value.moveLinks || {}
  const k = moveKey(m.name)
  if (k in links) return links[k] ? exMap.value.get(links[k]) || null : null
  const hit = matchExercise(m.name, exercises.value as LibExercise[]) as Exercise | null
  if (hit && words(hit.name).length <= words(m.name).length + 1) return hit
  return coveredMatch(m.name)
}

// Words that describe how or where, not what: "Supine hamstring stretch" is still a hamstring stretch.
const MODIFIERS = new Set(['supine', 'prone', 'standing', 'seated', 'sitting', 'lying', 'kneeling', 'half', 'side', 'with', 'reach', 'gentle', 'slow', 'easy', 'light', 'each', 'the', 'a', 'and', 'on', 'to', 'your', 'both', 'single', 'alternating', 'active', 'static', 'dynamic', 'quick', 'deep'])
const sing = (w: string) => (w.length > 3 ? w.replace(/(ies)$/, 'y').replace(/s$/, '') : w)

/**
 * Second try: the longest library name whose every word is in the move, when that covers every
 * telling word of the move ("Child's pose with side reach" → Child's Pose; "Scap push-ups" is not a Push Up).
 */
function coveredMatch(name: string): Exercise | null {
  const mw = words(name).map(sing)
  const telling = mw.filter((w) => !MODIFIERS.has(w))
  if (!telling.length) return null
  let best: Exercise | null = null
  let bestLen = 0
  for (const e of exercises.value) {
    if (e.deleted) continue
    const ew = words(e.name).map(sing)
    if (ew.length < 2 && telling.length > 1) continue
    if (!ew.every((w) => mw.includes(w))) continue
    if (!telling.every((w) => ew.includes(w))) continue
    if (ew.length > bestLen) (best = e), (bestLen = ew.length)
  }
  return best
}

/** Link a move to an exercise everywhere (or to nothing: text only). */
export async function linkMove(name: string, exerciseId: string | null) {
  await saveSettings({ moveLinks: { ...(settings.value.moveLinks || {}), [moveKey(name)]: exerciseId || '' } })
}

/** Where a line's video button goes: a link written on the line, the linked exercise's video, or a search. */
export function moveVideo(m: Move, ex = moveExercise(m)): string | null {
  if (m.ramp) return null
  if (m.url) return m.url
  if (ex) return videoFor(ex)
  return m.name ? searchUrl(m.name + ' how to') : null
}

/** A line for an exercise picked from the library, with a sensible starting dose. */
export const lineFor = (ex: Exercise) => (ex.type === 'duration' ? `${ex.name} · 30 s` : `${ex.name} × 10`)
