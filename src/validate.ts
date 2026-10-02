// Guards against malformed records (bad imports, old clients) crashing the app.
import type { StoreName } from './types'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

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
    return { ...rec, updatedAt, name: String(rec.name ?? 'Workout'), start, end: num(rec.end), notes: String(rec.notes ?? ''), routineId: typeof rec.routineId === 'string' ? rec.routineId : null, exercises: cleanExercises(rec.exercises) }
  }
  if (store === 'routines') {
    return { ...rec, updatedAt, name: String(rec.name ?? 'Routine'), folder: String(rec.folder ?? ''), notes: String(rec.notes ?? ''), order: num(rec.order) ?? 0, exercises: cleanExercises(rec.exercises) }
  }
  if (store === 'exercises') {
    if (typeof rec.name !== 'string' || !rec.name) return null
    const type = ['weight_reps', 'reps', 'duration'].includes(rec.type as string) ? rec.type : 'weight_reps'
    return { ...rec, updatedAt, muscle: String(rec.muscle ?? 'Other'), equipment: String(rec.equipment ?? 'Other'), type }
  }
  if (store === 'settings') return { ...rec, updatedAt }
  return null
}
