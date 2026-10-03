// What kind of session a workout was, for its icon: strength (it has exercises) or cardio.
import type { Workout } from './types'

export interface Activity {
  icon: string
  kind: 'strength' | 'cardio'
  label: string
}

export function activityOf(w: Pick<Workout, 'exercises'>): Activity {
  return w.exercises.length ? { icon: 'dumbbell', kind: 'strength', label: 'Strength' } : { icon: 'cardio', kind: 'cardio', label: 'Cardio' }
}
