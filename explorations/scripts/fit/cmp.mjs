import { parseFit, fitToWorkout } from './fit.mjs'
import fs from 'fs'
const b = fs.readFileSync(process.argv[2])
const a = parseFit(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
const ref = JSON.parse(fs.readFileSync('hr.json'))
console.log({ ...a, hr: a.hr.length }, new Date(a.start).toISOString(), new Date(a.end).toISOString())
let diff = 0; a.hr.forEach(([t, h], i) => { if (h !== ref[i][1] || t !== (Date.parse(ref[i][0]) - a.start) / 1000) diff++ })
console.log('samples vs SDK mismatches:', diff, 'of', ref.length)
const w = fitToWorkout(a); console.log(w.id, w.name, w.notes, 'hr5s', w.hr.length, 'max', Math.max(...w.hr.map(x=>x[1])))
fs.writeFileSync('workout.json', JSON.stringify(w))
