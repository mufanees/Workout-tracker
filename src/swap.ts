// Swapping an exercise mid-workout ("Can't do this?"): instant alternatives ranked on the phone
// (shared/liveCoach.mjs alternatives: shared main muscles, same movement, kit they have and don't lack,
// not fatigued), one tap replaces it in the active workout keeping its sets, targets, superset and
// rest, with Undo; optionally the routine too, and optionally remember what kit they lack.
import { signal } from '@preact/signals'
import { alternatives, lackedTerms, type Alternative } from '../shared/liveCoach.mjs'
import { kindOf } from '../shared/budget.mjs'
import { matchExercise, type LibExercise } from '../shared/planImport.mjs'
import { active, coachItems, exercises, exMap, routines, saveCoachItem, saveRoutine, updateActive } from './store'
import { sessionsByExercise } from './stats'
import { musclesOf, muscleStatusAt } from './fatigue'
import { clone, uid } from './util'
import type { CoachItem, Exercise, WExercise } from './types'

/** The live exercise the swap sheet is open for (its workout-exercise id), or null. */
export const swapFor = signal<string | null>(null)
export const openSwap = (weId: string) => (swapFor.value = weId)

const profileOf = (): CoachItem => coachItems.value.find((x) => x.kind === 'profile') || { id: 'profile', kind: 'profile', updatedAt: 0 }

/** Kit they can use: dumbbells, bodyweight and bands, plus anything they've logged or name in their profile. */
function haveKit(): string[] {
  const have = new Set(['Dumbbell', 'Bodyweight', 'Band'])
  for (const id of sessionsByExercise.value.keys()) {
    const e = exMap.value.get(id)?.equipment
    if (e && e !== 'Other' && e !== 'Machine' && e !== 'Cable') have.add(e)
  }
  const text = (profileOf().equipment || '').toLowerCase()
  for (const k of ['Barbell', 'Kettlebell', 'Cable', 'Machine']) if (new RegExp(`(?<!no |without )${k.toLowerCase()}`).test(text)) have.add(k)
  return [...have]
}

/** What they've said they lack: profile equipment, injuries/preferences and coach notes. */
function lackWords(): string[] {
  const p = profileOf()
  const notes = coachItems.value.filter((x) => x.kind === 'note').map((x) => x.text || '')
  return lackedTerms([p.equipment, p.preferences, ...notes].filter(Boolean).join('. '))
}

const cand = (e: Exercise) => ({ id: e.id, name: e.name, equipment: e.equipment, type: e.type, muscle: e.muscle, regions: musclesOf(e.id), pattern: kindOf({ name: e.name, muscle: e.muscle }).pattern })

/** Alternatives for an exercise (by its library id), best first. */
export function alternativesFor(exerciseId: string, limit = 5): Alternative[] {
  const ex = exMap.value.get(exerciseId)
  if (!ex) return []
  const st = muscleStatusAt()
  const fatigue: Record<string, number> = {}
  for (const [id, r] of Object.entries(st)) fatigue[id] = r.fatigue
  return alternatives(cand(ex), exercises.value.filter((e) => e.type !== 'duration' || ex.type === 'duration').map(cand), { have: haveKit(), lack: lackWords(), fatigue, logged: new Set(sessionsByExercise.value.keys()), limit })
}

/** Put another exercise in a workout exercise's place: same sets, rep targets, superset and rest; weights start fresh. */
export function swapIn(we: WExercise, exerciseId: string) {
  we.exerciseId = exerciseId
  we.notes = ''
  for (const s of we.sets) {
    s.tw = null
    s.cw = null
    s.cl = undefined
  }
}

/** Swap in the active workout. Returns undo, or null if it can't. */
export function swapActive(weId: string, exerciseId: string): (() => void) | null {
  const w = active.value
  const we = w?.exercises.find((e) => e.id === weId)
  if (!w || !we || we.exerciseId === exerciseId) return null
  const before = clone(we)
  updateActive((x) => {
    const t = x.exercises.find((e) => e.id === weId)
    if (t) swapIn(t, exerciseId)
  })
  return () =>
    updateActive((x) => {
      const t = x.exercises.find((e) => e.id === weId)
      if (!t) return
      t.exerciseId = before.exerciseId
      t.notes = before.notes
      for (const st of t.sets) {
        const b0 = before.sets.find((y) => y.id === st.id)
        if (b0) Object.assign(st, { tw: b0.tw, cw: b0.cw, cl: b0.cl })
      }
    })
}

/** The same swap in the routine this workout came from. Returns a message. */
export async function swapInRoutine(routineId: string | null | undefined, fromId: string, toId: string): Promise<string> {
  const r = routines.value.find((x) => x.id === routineId)
  if (!r) return 'This workout isn’t from a routine'
  const next = clone(r)
  let n = 0
  for (const we of next.exercises)
    if (we.exerciseId === fromId) {
      we.exerciseId = toId
      we.notes = ''
      for (const s of we.sets) if (s.kind !== 'warmup') s.weight = null
      n++
    }
  if (!n) return `${exMap.value.get(fromId)?.name || 'It'} isn’t in ${r.name}`
  await saveRoutine(next)
  return `${r.name} updated`
}

/** Remember a limitation: a coach note, and a line in the profile's equipment so the coach plans around it. */
export async function rememberLack(what: string, fromName?: string) {
  const text = what.trim().replace(/^no\s+/i, '')
  if (!text) return
  await saveCoachItem({ id: uid('note-'), kind: 'note', text: `Doesn’t have ${text}${fromName ? ` (swapped out ${fromName})` : ''}.`.slice(0, 300), created: Date.now(), source: 'you', updatedAt: 0 })
  const p = profileOf()
  const eq = (p.equipment || '').trim()
  if (!new RegExp(`no ${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(eq)) await saveCoachItem({ ...p, equipment: `${eq}${eq && !/[.;]$/.test(eq) ? '. ' : eq ? ' ' : ''}No ${text}.`.slice(0, 600) })
}

/** A likely thing they lack, from the exercise's name (for the "Remember" suggestion). */
export function guessLack(name: string): string {
  if (/roll-?out|ab wheel|roller/i.test(name)) return 'rollable dumbbells or an ab wheel'
  if (/bench|incline|decline/i.test(name)) return 'a bench'
  if (/pull-?up|chin-?up/i.test(name)) return 'a pull-up bar'
  if (/cable/i.test(name)) return 'a cable machine'
  if (/kettlebell/i.test(name)) return 'a kettlebell'
  if (/box|step/i.test(name)) return 'a box or step'
  if (/band/i.test(name)) return 'bands'
  return ''
}

const applied = new Set<string>()

/**
 * The coach's swap_exercise during a workout: apply it right away (they asked for it). `to` missing →
 * the top alternative. Returns { text, undo } or null when there's no active workout or no match.
 * Idempotent per proposal id (a resumed stream replays proposals).
 */
export function swapFromCoach(id: string, args: { from?: unknown; to?: unknown; update_routine?: unknown }): { text: string; undo: () => void } | null {
  const w = active.value
  if (!w || applied.has(id)) return null
  const lib = exercises.value as LibExercise[]
  const from = matchExercise(String(args.from || ''), lib)
  const we = from ? w.exercises.find((e) => e.exerciseId === from.id) : null
  if (!from || !we) return null
  const to = args.to ? matchExercise(String(args.to), lib) : null
  const toId = to?.id || alternativesFor(from.id, 1)[0]?.id
  if (!toId) return null
  const undo = swapActive(we.id, toId)
  if (!undo) return null
  applied.add(id)
  if (args.update_routine === true) void swapInRoutine(w.routineId, from.id, toId)
  return { text: `Swapped ${from.name} → ${exMap.value.get(toId)?.name}`, undo }
}

/** For the proposal card outside a workout: what the swap would be. */
export function describeSwap(args: { from?: unknown; to?: unknown }): { from: string; to: string } {
  const lib = exercises.value as LibExercise[]
  const from = matchExercise(String(args.from || ''), lib)
  const to = args.to ? matchExercise(String(args.to), lib) : from ? exMap.value.get(alternativesFor(from.id, 1)[0]?.id || '') : null
  return { from: from?.name || String(args.from || '?'), to: to?.name || String(args.to || 'the best alternative') }
}

export type { Alternative }
