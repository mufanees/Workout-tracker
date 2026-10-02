// Seeds a stalled exercise (Hammer Curl at 10 kg x3 sessions) and rising shoulder ratings.
const day = 86400000
const now = Date.now()
const changes = []
for (const [i, d] of [[0, 10], [1, 6], [2, 3]]) {
  const start = now - d * day
  changes.push({ store: 'workouts', id: 'stall' + i, updatedAt: start, deleted: false, data: { id: 'stall' + i, name: 'Arms', routineId: null, start, end: start + 1800e3, notes: '', exercises: [{ id: 'se' + i, exerciseId: 'x-hammer-curl', notes: '', target: '10-12', rest: 60, superset: null, sets: [0, 1, 2].map((j) => ({ id: `ss${i}${j}`, kind: 'normal', weight: 10, reps: 10, seconds: null, done: true })) }], shoulder: [2, 3, 4][i] } })
}
for (let k = 0; k < 6; k++) {
  const start = now - (26 - k * 2) * day
  changes.push({ store: 'workouts', id: 'sh' + k, updatedAt: start, deleted: false, data: { id: 'sh' + k, name: 'Mobility', routineId: null, start, end: start + 900e3, notes: '', exercises: [{ id: 'she' + k, exerciseId: 'x-plank', notes: '', target: '', rest: 0, superset: null, sets: [{ id: 'shs' + k, kind: 'normal', weight: null, reps: null, seconds: 45, done: true }] }], shoulder: [1, 2, 1, 2, 2, 1][k] } })
}
for (let k = 1; k <= 6; k++) {
  const d = now - k * day
  changes.push({ store: 'readings', id: 'rd' + k, updatedAt: d, deleted: false, data: { id: 'rd' + k, date: d, rhr: 54 + (k % 3), hrv: 62 + ((k * 7) % 11) } })
}
fetch('http://localhost:3000/api/sync', { method: 'POST', headers: { authorization: 'Bearer testkey', 'content-type': 'application/json' }, body: JSON.stringify({ since: 0, changes }) })
  .then((r) => r.json()).then((b) => console.log('seeded', b.seq))
