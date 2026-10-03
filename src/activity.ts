// What kind of session a workout was, for its icon: strength, or a cardio type from its name
// (imported FIT files are named after the sport: "Elliptical", "Indoor ride", "Run"…).
import type { Workout } from './types'

export interface Activity {
  icon: string
  kind: 'strength' | 'cardio'
  label: string
}

const CARDIO: [RegExp, string, string][] = [
  [/ellip|cross.?trainer/i, 'footprints', 'Elliptical'],
  [/run|jog|treadmill|walk|stair/i, 'footprints', 'Run or walk'],
  [/ride|cycl|bike|spin/i, 'bike', 'Ride'],
  [/swim/i, 'swim', 'Swim'],
  [/row(ing)?$|indoor row|erg/i, 'row', 'Row'],
  [/hike/i, 'mountain', 'Hike'],
  [/yoga|stretch|mobility|pilates/i, 'stretch', 'Mobility'],
]

export function activityOf(w: Pick<Workout, 'name' | 'exercises' | 'hr' | 'targetZone'>): Activity {
  if (!w.exercises.length) {
    for (const [re, icon, label] of CARDIO) if (re.test(w.name)) return { icon, kind: 'cardio', label }
    if (w.targetZone || w.hr?.length || /cardio|zone/i.test(w.name)) return { icon: 'cardio', kind: 'cardio', label: 'Cardio' }
  }
  return { icon: 'dumbbell', kind: 'strength', label: 'Strength' }
}
