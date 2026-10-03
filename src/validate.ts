// Guards against malformed records (bad imports, old clients) crashing the app.
import type { StoreName } from './types'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map(String) : undefined)

function cleanExercises(list: unknown) {
  if (!Array.isArray(list)) return []
  return list.filter(isObj).filter((e) => typeof e.exerciseId === 'string').map((e) => ({
    id: typeof e.id === 'string' ? e.id : Math.random().toString(36).slice(2),
    exerciseId: e.exerciseId as string,
    notes: typeof e.notes === 'string' ? e.notes : '',
    target: typeof e.target === 'string' ? e.target : '',
    rest: num(e.rest) ?? 0,
    superset: typeof e.superset === 'string' ? e.superset : null,
    sets: (Array.isArray(e.sets) ? e.sets : []).filter(isObj).map((s) => ({
      ...s,
      id: typeof s.id === 'string' ? s.id : Math.random().toString(36).slice(2),
      kind: ['normal', 'warmup', 'failure', 'drop'].includes(s.kind as string) ? s.kind : 'normal',
      weight: num(s.weight),
      reps: num(s.reps),
      seconds: num(s.seconds),
      done: !!s.done,
    })),
  }))
}

/** Returns a safe copy of a record, or null if it can't be used. Tombstones pass through. */
export function sanitize(store: StoreName, rec: unknown): Record<string, unknown> | null {
  if (!isObj(rec) || typeof rec.id !== 'string') return null
  if (rec.deleted) return { id: rec.id, deleted: true, updatedAt: num(rec.updatedAt) ?? 0 }
  const updatedAt = num(rec.updatedAt) ?? 0
  if (store === 'workouts') {
    const start = num(rec.start)
    if (start == null) return null
    const hr = Array.isArray(rec.hr) ? rec.hr.filter((p) => Array.isArray(p) && num(p[0]) != null && num(p[1]) != null) : undefined
    return { ...rec, updatedAt, name: String(rec.name ?? 'Workout'), start, end: num(rec.end), notes: String(rec.notes ?? ''), routineId: typeof rec.routineId === 'string' ? rec.routineId : null, exercises: cleanExercises(rec.exercises), hr, warmup: strs(rec.warmup), cooldown: strs(rec.cooldown), shoulder: num(rec.shoulder) }
  }
  if (store === 'routines') {
    return { ...rec, updatedAt, name: String(rec.name ?? 'Routine'), folder: String(rec.folder ?? ''), notes: String(rec.notes ?? ''), order: num(rec.order) ?? 0, exercises: cleanExercises(rec.exercises), warmup: strs(rec.warmup), cooldown: strs(rec.cooldown) }
  }
  if (store === 'exercises') {
    if (typeof rec.name !== 'string' || !rec.name) return null
    const type = ['weight_reps', 'reps', 'duration'].includes(rec.type as string) ? rec.type : 'weight_reps'
    return { ...rec, updatedAt, muscle: String(rec.muscle ?? 'Other'), equipment: String(rec.equipment ?? 'Other'), type }
  }
  if (store === 'settings') return { ...rec, updatedAt }
  if (store === 'body') {
    const date = num(rec.date)
    const kg = num(rec.kg)
    return date != null && kg != null && kg > 0 ? { ...rec, updatedAt, date, kg } : null
  }
  if (store === 'coach') {
    const kinds = ['profile', 'note', 'goal', 'commitment', 'insight', 'snapshot', 'block', 'source']
    return kinds.includes(rec.kind as string) ? { ...rec, updatedAt } : null
  }
  if (store === 'readings') {
    const date = num(rec.date)
    const rhr = num(rec.rhr)
    return date != null && rhr != null ? { ...rec, updatedAt, date, rhr, hrv: num(rec.hrv) } : null
  }
  if (store === 'fasts') {
    const start = num(rec.start)
    return start != null ? { ...rec, updatedAt, start, end: num(rec.end), goal: num(rec.goal) ?? 16, note: typeof rec.note === 'string' ? rec.note : undefined } : null
  }
  if (store === 'days') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.id)) return null
    const lvl = (v: unknown) => ([1, 2, 3].includes(Number(v)) ? Number(v) : null)
    return { ...rec, updatedAt, text: String(rec.text ?? ''), sleep: lvl(rec.sleep), energy: lvl(rec.energy), stress: lvl(rec.stress) }
  }
  return null
}
