// Seeds body weights, fasts and a few cardio workouts with heart rate via the sync API.
const day = 86400000
const now = Date.now()
const changes = []
for (let i = 40; i >= 1; i--) {
  if (i % 3 === 1) continue
  const kg = 84 - (40 - i) * 0.06 + Math.sin(i) * 0.4
  changes.push({ store: 'body', id: 'b' + i, updatedAt: now - i * day, deleted: false, data: { id: 'b' + i, date: now - i * day - 6 * 3600e3, kg: Math.round(kg * 10) / 10 } })
}
for (let i = 7; i >= 1; i--) {
  const start = now - i * day - 10 * 3600e3
  const len = (14 + (i % 4)) * 3600e3
  changes.push({ store: 'fasts', id: 'f' + i, updatedAt: now - i * day, deleted: false, data: { id: 'f' + i, start, end: start + len, goal: 16 } })
}
for (let k = 0; k < 10; k++) {
  const d = 70 - k * 7
  const start = now - d * day
  const hr = []
  for (let t = 0; t <= 2400; t += 5) {
    const warm = Math.min(1, t / 400)
    hr.push([t, Math.round(95 + warm * (35 + k) + Math.sin(t / 90) * 8 + (t > 2000 ? 15 : 0))])
  }
  changes.push({ store: 'workouts', id: 'cardio' + k, updatedAt: start, deleted: false, data: { id: 'cardio' + k, name: 'Zone 2 Cardio', routineId: null, start, end: start + 2400e3, notes: '', exercises: [], hr, targetZone: 2 } })
}
fetch('http://localhost:3000/api/sync', { method: 'POST', headers: { authorization: 'Bearer testkey', 'content-type': 'application/json' }, body: JSON.stringify({ since: 0, changes }) })
  .then((r) => r.json()).then((b) => console.log('seeded', b.seq))
