// Pushes ~5 weeks of past plan workouts to the server via the sync API.
const day = 86400000
const now = Date.now()
const mk = (i, daysAgo, routine, ex) => ({
  store: 'workouts', id: 'wseed' + i, updatedAt: now - daysAgo * day, deleted: false,
  data: { id: 'wseed' + i, name: routine === 'a' ? 'Phase 1 · Workout A' : 'Phase 1 · Workout B', routineId: 'r-comeback-1' + routine,
    start: now - daysAgo * day - 3600e3, end: now - daysAgo * day - 1800e3, notes: i === 3 ? 'Shoulder felt good today.' : '',
    exercises: ex.map(([exerciseId, sets], k) => ({ id: `e${i}${k}`, exerciseId, notes: '', target: '', rest: 60, superset: null,
      sets: sets.map(([w, r, kind = 'normal'], j) => ({ id: `s${i}${k}${j}`, kind, weight: w, reps: r, seconds: null, done: true })) })) },
})
const changes = []
let i = 0
for (let d = Number(process.argv[2] || 34); d >= 2; d -= 2) {
  const n = i
  const a = n % 2 === 0
  const bump = Math.floor(n / 3)
  changes.push(mk(i++, d, a ? 'a' : 'b', a
    ? [['x-goblet-squat', [[8, 10, 'warmup'], [12 + bump, 10], [12 + bump, 11], [12 + bump, 12]]], ['x-one-arm-dumbbell-row', [[10 + bump, 12], [10 + bump, 12], [10 + bump, 11]]], ['x-dumbbell-floor-press', [[8 + bump / 2, 12], [8 + bump / 2, 10]]], ['x-dead-bug', [[null, 8], [null, 8]]]]
    : [['x-dumbbell-romanian-deadlift', [[12 + bump, 10], [12 + bump, 10], [12 + bump, 12]]], ['x-bent-over-dumbbell-row', [[10 + bump, 10], [10 + bump, 10]]], ['x-bird-dog', [[null, 8], [null, 8]]]]))
}
fetch('http://localhost:3000/api/sync', { method: 'POST', headers: { authorization: 'Bearer testkey', 'content-type': 'application/json' }, body: JSON.stringify({ since: 0, changes }) })
  .then((r) => r.json()).then((b) => console.log('seeded', b.seq))
