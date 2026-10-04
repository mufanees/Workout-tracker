// Builds shared/stretches.json, the coach's stretch catalogue, from free-exercise-db
// (public domain, https://github.com/yuhonas/free-exercise-db): every stretch with its body
// areas, equipment and step-by-step instructions. Names match the exercise library.
// Usage: node scripts/stretches.mjs path/to/exercises.json
import { readFileSync, writeFileSync } from 'node:fs'

const src = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const AREA = {
  neck: 'neck', shoulders: 'shoulders', chest: 'chest', lats: 'upper back', 'middle back': 'upper back', traps: 'upper back',
  'lower back': 'lower back', abdominals: 'core', glutes: 'hips', abductors: 'hips', adductors: 'groin', hamstrings: 'hamstrings',
  quadriceps: 'quads', calves: 'calves', biceps: 'arms', triceps: 'arms', forearms: 'wrists',
}
const EQUIP = { 'body only': 'none', bands: 'band', 'foam roll': 'foam roller', 'exercise ball': 'exercise ball', other: 'other', machine: 'machine', cable: 'cable', barbell: 'barbell' }
const clean = (s) => s.replace(/\s+/g, ' ').trim()
const out = src
  .filter((e) => e.category === 'stretching')
  .map((e) => {
    const steps = e.instructions.map(clean).filter(Boolean)
    const text = (e.name + ' ' + steps.join(' ')).toLowerCase()
    return {
      name: clean(e.name),
      areas: [...new Set([...e.primaryMuscles, ...e.secondaryMuscles].map((m) => AREA[m]).filter(Boolean))],
      equipment: EQUIP[e.equipment] || (e.equipment == null ? 'none' : e.equipment),
      partner: /partner/.test(text),
      level: e.level,
      // how it's done: held, moved through (circles, swings, hops) or rolled (SMR = foam roller)
      kind: /smr|roll/i.test(e.name) || e.equipment === 'foam roll' ? 'roll' : /circle|swing|hop|dynamic|rotation|crossover reverse|walk|kip|squat|lunge|leg pull|shrug/i.test(e.name) ? 'moving' : 'hold',
      steps,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))
writeFileSync(new URL('../shared/stretches.json', import.meta.url), JSON.stringify(out, null, 0) + '\n')
console.log(out.length, 'stretches')
