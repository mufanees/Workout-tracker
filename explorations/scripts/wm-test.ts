import { weightModel, weightModelText } from '../../../../../home/user/Workout-tracker/src/weightModel'
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd())
const DAY = 86400000
const now = new Date(2026, 9, 3, 9).getTime()
function sim(days: number, ratePerWeek: number, opts: { mon?: number; fast?: number; plateauFrom?: number } = {}) {
  const list: any[] = [], fasts: any[] = []
  for (let i = days; i >= 0; i--) {
    const t = now - i * DAY
    const d = new Date(t)
    const elapsed = days - i
    const r = opts.plateauFrom != null && elapsed > opts.plateauFrom ? 0 : ratePerWeek
    const trueW = 90 + (ratePerWeek * Math.min(elapsed, opts.plateauFrom ?? 1e9) + r * Math.max(0, elapsed - (opts.plateauFrom ?? 1e9))) / 7
    const fasted = i % 3 === 0
    if (fasted) fasts.push({ id: 'f' + i, start: t - 18 * 3600000, end: t + 3600000, goal: 16, updatedAt: 0 })
    if (rnd() < 0.25) continue
    let kg = trueW + 0.6 * gauss()
    if (opts.mon && d.getDay() === 1) kg += opts.mon
    if (opts.fast && fasted) kg += opts.fast
    list.push({ id: 'b' + i, date: t, kg: Math.round(kg * 10) / 10, updatedAt: 0 })
  }
  return { list, fasts }
}
const a = sim(60, -0.5, { mon: 0.6, fast: -0.7 })
const m = weightModel({ list: a.list, fasts: a.fasts, target: 85, now })!
console.log('== losing 0.5/wk, Monday +0.6, fasted -0.7, target 85')
console.log(weightModelText(m))
console.log('rate', m.rate.toFixed(2), '±', m.rateSd.toFixed(2), '| noise', m.noise.toFixed(2), '| true trend now', (90 - 0.5 * 60 / 7).toFixed(2))
const b = sim(70, -0.6, { plateauFrom: 45 })
console.log('\n== plateau after day 45, target 80')
console.log(weightModelText(weightModel({ list: b.list, fasts: [], target: 80, now })))
console.log('\n== 4 weigh-ins only')
console.log(weightModelText(weightModel({ list: a.list.slice(-4), fasts: [], target: 85, now })))
console.log('\n== flat, noisy')
console.log(weightModelText(weightModel({ list: sim(40, 0).list, now })))
