// Coach-built mobility: stretches and rehab moves built into today or the week, sized to how hard
// each day is. Add-ons join the warm-up and cool-down of whatever workout starts that day; easy and
// rest days can carry a standalone session started from the Train card.
import { computed } from '@preact/signals'
import { coachItems, workouts } from './store'
import { dayKey } from './fasting'
import type { CoachItem, MobilityDay, MobilityMove, MobilitySpec } from './types'

const INTENSITIES: MobilityDay['intensity'][] = ['hard', 'moderate', 'easy', 'rest']

/** The open plan (one at a time; a new one replaces it). */
export const activeMobility = computed<CoachItem | null>(
  () =>
    coachItems.value
      .filter((x) => x.kind === 'mobility' && (x.status || 'open') === 'open' && x.mobility)
      .sort((a, b) => (b.created || 0) - (a.created || 0))[0] || null,
)

export function mobilityDay(t = Date.now()): MobilityDay | null {
  const key = dayKey(t)
  return activeMobility.value?.mobility?.days.find((d) => d.date === key) || null
}

export const todayMobility = computed(() => mobilityDay())

/** A finished workout started from this day's standalone session. */
export const sessionDone = (date: string) => workouts.value.some((w) => w.mobility === date && w.end)

const lines = (x: unknown, max = 8) =>
  Array.isArray(x)
    ? x
        .map((t) => String(t ?? '').trim().slice(0, 140))
        .filter(Boolean)
        .slice(0, max)
    : []
const num = (x: unknown, lo: number, hi: number) => (Number.isFinite(Number(x)) && Number(x) >= lo && Number(x) <= hi ? Math.round(Number(x)) : undefined)

/** A plan from propose_mobility_plan's arguments, with anything malformed dropped. */
export function mobilityFrom(a: Record<string, any>, now = Date.now()): MobilitySpec {
  const scope = a.scope === 'week' ? 'week' : 'today'
  const today = dayKey(now)
  const days: MobilityDay[] = []
  for (const d of Array.isArray(a.days) ? a.days : []) {
    const date = scope === 'today' ? today : /^\d{4}-\d{2}-\d{2}$/.test(String(d?.date)) ? String(d.date) : ''
    if (!date || date < today || days.some((x) => x.date === date)) continue
    const moves: MobilityMove[] = (Array.isArray(d?.session?.moves) ? d.session.moves : [])
      .filter((m: any) => m && typeof m.name === 'string' && m.name.trim())
      .slice(0, 12)
      .map((m: any) => ({ name: String(m.name).trim().slice(0, 80), sets: num(m.sets, 1, 6), reps: num(m.reps, 1, 50), seconds: num(m.seconds, 5, 600), cue: m.cue ? String(m.cue).slice(0, 160) : undefined }))
    days.push({
      date,
      intensity: INTENSITIES.includes(d?.intensity) ? d.intensity : 'moderate',
      focus: d?.focus ? String(d.focus).slice(0, 120) : undefined,
      warmup: lines(d?.warmup),
      cooldown: lines(d?.cooldown),
      session: moves.length ? { name: String(d.session.name || 'Mobility').slice(0, 60), minutes: num(d.session.minutes, 1, 90), moves } : undefined,
    })
    if (scope === 'today' || days.length >= 8) break
  }
  days.sort((x, y) => x.date.localeCompare(y.date))
  return { scope, summary: a.summary ? String(a.summary).slice(0, 400) : undefined, days }
}

export const moveDose = (m: MobilityMove) => {
  const each = m.seconds ? `${m.seconds} s` : m.reps ? `${m.reps}${m.sets && m.sets > 1 ? '' : ' reps'}` : ''
  return m.sets && m.sets > 1 && each ? `${m.sets} × ${each}` : each
}

const key = (line: string) => line.toLowerCase().split(/\s*[·×(:]\s*|\s+x\s+|\s+\d/)[0].replace(/[^a-z]/g, '').replace(/s$/, '')

/**
 * A routine's warm-up or cool-down with the day's add-ons merged in (no repeats). Warm-up add-ons go
 * before the ramp-up sets, which stay last.
 */
export function mergeLines(base: string[] | undefined, extra: string[] | undefined): string[] | undefined {
  const out = [...(base || [])]
  const add = (extra || []).filter((l) => !out.some((b) => key(b) && key(b) === key(l)))
  const ramp = out.findIndex((l) => /ramp-?up/i.test(l))
  out.splice(ramp >= 0 ? ramp : out.length, 0, ...add)
  return out.length ? out : undefined
}

const DOW = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export function describeDay(d: MobilityDay): string {
  const parts = [`${DOW(d.date)} · ${d.intensity}${d.focus ? ` · ${d.focus}` : ''}`]
  if (d.warmup?.length) parts.push(`warm-up + ${d.warmup.join('; ')}`)
  if (d.cooldown?.length) parts.push(`cool-down + ${d.cooldown.join('; ')}`)
  if (d.session) parts.push(`${d.session.name}${d.session.minutes ? ` (${d.session.minutes} min)` : ''}: ${d.session.moves.map((m) => `${m.name} ${moveDose(m)}`.trim()).join('; ')}`)
  return parts.join(' — ')
}

/** For the coach: the plan, day by day, with what actually happened. */
export function mobilityText(now = Date.now()): string {
  const item = activeMobility.value
  if (!item?.mobility?.days.length) return 'None. Build stretches and rehab into today or the week with propose_mobility_plan when it would help.'
  const today = dayKey(now)
  const L = [`[${item.id}] ${item.text || 'Mobility plan'} (${item.mobility.scope})${item.mobility.summary ? `: ${item.mobility.summary}` : ''}`]
  for (const d of item.mobility.days) {
    const trained = workouts.value.some((w) => w.end && dayKey(w.start) === d.date && w.mobility !== d.date)
    const status = d.date > today ? 'upcoming' : [d.date === today ? 'TODAY' : 'past', trained ? 'trained' : d.date < today ? 'no workout' : '', d.session ? (sessionDone(d.date) ? 'session done' : 'session not done') : ''].filter(Boolean).join(', ')
    L.push(`  ${describeDay(d)} [${status}]`)
  }
  return L.join('\n')
}
