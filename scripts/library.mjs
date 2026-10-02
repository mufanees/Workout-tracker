// Builds src/data/library.json from free-exercise-db (public domain, https://github.com/yuhonas/free-exercise-db).
// Usage: node scripts/library.mjs path/to/exercises.json
import { readFileSync, writeFileSync } from 'node:fs'

const src = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const MUSCLE = {
  abdominals: 'Core', hamstrings: 'Legs', quadriceps: 'Legs', adductors: 'Legs', abductors: 'Legs', calves: 'Legs',
  glutes: 'Glutes', biceps: 'Arms', triceps: 'Arms', forearms: 'Arms', shoulders: 'Shoulders', neck: 'Shoulders',
  chest: 'Chest', 'middle back': 'Back', lats: 'Back', 'lower back': 'Back', traps: 'Back',
}
const EQUIP = {
  'body only': 'Bodyweight', dumbbell: 'Dumbbell', barbell: 'Barbell', 'e-z curl bar': 'Barbell', kettlebells: 'Kettlebell',
  cable: 'Cable', machine: 'Machine', bands: 'Band', 'foam roll': 'Other', 'medicine ball': 'Other', 'exercise ball': 'Other', other: 'Other',
}
const out = []
for (const e of src) {
  const name = e.name.replace(/\s+/g, ' ').trim()
  let muscle = MUSCLE[e.primaryMuscles?.[0]] || 'Full Body'
  if (e.category === 'stretching') muscle = 'Mobility'
  if (e.category === 'cardio') muscle = 'Cardio'
  const equipment = EQUIP[e.equipment] || (e.equipment == null ? 'Bodyweight' : 'Other')
  let type = 'weight_reps'
  if (e.category === 'stretching' || e.category === 'cardio' || /(^|\s)plank$|hold$|carry|farmer/i.test(name)) type = 'duration'
  else if (equipment === 'Bodyweight') type = 'reps'
  out.push([name, muscle, equipment, type])
}
out.sort((a, b) => a[0].localeCompare(b[0]))
writeFileSync(new URL('../src/data/library.json', import.meta.url), JSON.stringify(out))
console.log(out.length, 'exercises')
