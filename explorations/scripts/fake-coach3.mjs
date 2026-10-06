// Stand-in Gemini: blends the plan via library + knowledge lookups, then proposes a program.
import http from 'node:http'
import fs from 'node:fs'
const LOG = process.argv[2]
const sse = (res, parts) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.write(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', index: 0 }] })}\r\n\r\n`)
  res.end()
}
const ex = (name, sets, reps, extra = {}) => ({ name, sets, reps, equipment: /band/i.test(name) ? 'Band' : 'Dumbbell', rest: 75, ...extra })
const PROGRAM = {
  name: 'Comeback Minimalist 3×30',
  summary: 'Three hard 30-minute full-body days built from the Comeback lifts with minimalist methods: top + back-off sets, antagonist supersets, drop sets.',
  days_per_week: 3,
  minutes: 30,
  routines: [
    { name: 'Day 1 · Heavy lower', warmup: ['Band pull-aparts × 15', 'Goblet squat ramp-up × 8'], exercises: [ex('Goblet Squat', 2, '6-8', { notes: 'top set 6-8, back-off 10-12' }), ex('Dumbbell Floor Press', 2, '8-10', { superset: '1' }), ex('Bent-Over Dumbbell Row', 2, '10-12', { superset: '1' }), ex('Lateral Raise', 1, '12-15', { notes: 'last set + drop set' })] },
    { name: 'Day 2 · Heavy upper', exercises: [ex('Half-Kneeling One-Arm Press', 2, '6-8'), ex('Dumbbell Romanian Deadlift', 2, '8-10', { superset: '1' }), ex('Band Lat Pulldown', 2, '10-12', { superset: '1' }), ex('Hammer Curl', 1, '12-15', { notes: 'myo-reps' })] },
    { name: 'Day 3 · Full body', exercises: [ex('Dumbbell Romanian Deadlift', 2, '5-8', { notes: 'top set + back-off' }), ex('Dumbbell Split Squat', 2, '10-12 / side', { superset: '1' }), ex('One-Arm Dumbbell Row', 2, '10-12', { superset: '1' })] },
  ],
}
http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const j = JSON.parse(body)
    fs.appendFileSync(LOG, JSON.stringify({ url: req.url, body: j }) + '\n')
    if (req.url.includes(':generateContent')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ takeaway: 'ok', met: [], missed: [], focus: 'x', targets: [], notes: [] }) }] } }] }))
    }
    const userTurns = j.contents.filter((c) => c.role === 'user' && c.parts.some((p) => p.text))
    const q = userTurns.at(-1).parts.map((p) => p.text || '').join(' ')
    const responses = j.contents.filter((c) => c.parts.some((p) => p.functionResponse)).length
    const sinceQ = j.contents.slice(j.contents.lastIndexOf(userTurns.at(-1)) + 1).filter((c) => c.parts.some((p) => p.functionResponse)).length
    if (/save this/i.test(q)) {
      if (sinceQ === 0) return sse(res, [{ functionCall: { name: 'save_to_library', args: { title: 'Band training notes', text: 'Bands add resistance at the top of a movement. Anchor high for pulldowns.' } } }])
      return sse(res, [{ text: 'Saved to your library.' }])
    }
    if (sinceQ === 0) return sse(res, [{ functionCall: { name: 'search_library', args: { query: 'minimalist 3 day split drop sets' } } }, { functionCall: { name: 'training_knowledge', args: { topic: 'dumbbells' } } }])
    if (sinceQ === 1) return sse(res, [{ functionCall: { name: 'propose_program', args: PROGRAM } }])
    sse(res, [{ text: 'Here is your blended program: three 30-minute days.' }])
  })
}).listen(Number(process.argv[3] || 8789))
