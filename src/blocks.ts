// The active training block: which week you're in, this week's phase, and the plan as text for the coach.
import { computed } from '@preact/signals'
import { coachItems } from './store'
import { startOfDay } from './util'
import type { BlockSpec, CoachItem } from './types'

const WEEK = 7 * 86400000

export interface BlockStatus {
  item: CoachItem
  spec: BlockSpec
  week: number // 1-based; 0 = not started yet; > weeks = finished
  phase: BlockSpec['phases'][number] | null
  deload: boolean
  finished: boolean
}

export function blockStatus(item: CoachItem, now = Date.now()): BlockStatus | null {
  const spec = item.block
  if (!spec) return null
  const week = now < spec.start ? 0 : Math.floor((startOfDay(new Date(now)) - spec.start) / WEEK) + 1
  const phase = spec.phases.find((p) => week >= p.from && week <= p.to) || null
  return { item, spec, week, phase, deload: spec.deloadWeek === week, finished: week > spec.weeks }
}

/** The open block, if any (only one runs at a time). */
export const activeBlock = computed<BlockStatus | null>(() => {
  const item = coachItems.value
    .filter((x) => x.kind === 'block' && (x.status || 'open') === 'open' && x.block)
    .sort((a, b) => (b.created || 0) - (a.created || 0))[0]
  return item ? blockStatus(item) : null
})

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10)

export const phaseLine = (p: BlockSpec['phases'][number]) => [p.focus, p.reps ? `${p.reps} reps` : '', p.sets ? `${p.sets} sets` : '', p.effort || ''].filter(Boolean).join(', ')

/** For the coach. */
export function blockText(): string {
  const b = activeBlock.value
  if (!b) return 'None active. Propose one (propose_training_block) when they want a plan toward a goal.'
  const s = b.spec
  const L = [`[${b.item.id}] ${b.item.text} — ${s.weeks} weeks from ${ymd(s.start)}${s.goalId ? ` (serves goal ${s.goalId})` : ''}`]
  if (s.summary) L.push(`  Aim: ${s.summary}`)
  L.push(b.week === 0 ? '  Not started yet.' : b.finished ? `  Finished (week ${b.week} after a ${s.weeks}-week block): time to review it and plan the next one.` : `  NOW: week ${b.week} of ${s.weeks}${b.deload ? ' (DELOAD week)' : ''}${b.phase ? `: ${phaseLine(b.phase)}${b.phase.notes ? ` (${b.phase.notes})` : ''}` : ''}`)
  L.push(`  Phases: ${s.phases.map((p) => `weeks ${p.from}–${p.to} ${phaseLine(p)}`).join('; ')}${s.deloadWeek ? `; deload week ${s.deloadWeek}` : ''}`)
  if (s.keyLifts?.length) L.push(`  Key lifts: ${s.keyLifts.map((k) => `${k.exercise}: ${k.progression}`).join('; ')}`)
  return L.join('\n')
}

/** A block from propose_training_block's arguments. */
export function blockFrom(a: Record<string, any>, now = Date.now()): BlockSpec {
  const weeks = Math.max(1, Math.min(16, Math.round(Number(a.weeks) || 4)))
  const parsed = a.start_date ? Date.parse(String(a.start_date) + 'T00:00:00') : NaN
  const start = startOfDay(new Date(Number.isFinite(parsed) ? parsed : now))
  const phases = (Array.isArray(a.phases) ? a.phases : [])
    .slice(0, 8)
    .map((p: any) => ({
      from: Math.max(1, Math.round(Number(p?.from_week) || 1)),
      to: Math.min(weeks, Math.max(1, Math.round(Number(p?.to_week) || weeks))),
      focus: String(p?.focus || 'Training').slice(0, 80),
      reps: p?.reps ? String(p.reps).slice(0, 20) : undefined,
      sets: Number.isFinite(Number(p?.sets)) && Number(p.sets) > 0 ? Math.round(Number(p.sets)) : undefined,
      effort: p?.effort ? String(p.effort).slice(0, 40) : undefined,
      notes: p?.notes ? String(p.notes).slice(0, 200) : undefined,
    }))
  const deload = Math.round(Number(a.deload_week))
  return {
    start,
    weeks,
    summary: a.summary ? String(a.summary).slice(0, 300) : undefined,
    goalId: a.goal_id ? String(a.goal_id) : undefined,
    phases: phases.length ? phases : [{ from: 1, to: weeks, focus: 'Training' }],
    deloadWeek: deload >= 1 && deload <= weeks ? deload : null,
    keyLifts: (Array.isArray(a.key_lifts) ? a.key_lifts : []).slice(0, 8).map((k: any) => ({ exercise: String(k?.exercise || '').slice(0, 80), progression: String(k?.progression || '').slice(0, 200) })),
  }
}
