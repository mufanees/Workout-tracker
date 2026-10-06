// Stand-in Gemini for the coach upgrade QA. Logs every request with its URL (model).
// The first chat request gets a 503 so the server's retry is exercised.
import http from 'node:http'
import fs from 'node:fs'
const LOG = process.argv[2]
let failedOnce = false
const sse = (res, parts) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.write(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', index: 0 }] })}\r\n\r\n`)
  res.end()
}
http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const j = JSON.parse(body)
    if (req.url.includes('streamGenerateContent') && !failedOnce) {
      failedOnce = true
      fs.appendFileSync(LOG, JSON.stringify({ url: req.url, status: 503 }) + '\n')
      res.writeHead(503, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: { message: 'overloaded' } }))
    }
    fs.appendFileSync(LOG, JSON.stringify({ url: req.url, body: j }) + '\n')
    const last = j.contents.at(-1)
    if (req.url.includes(':generateContent')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ takeaway: 'Solid session.', met: [], missed: [], focus: 'Smooth reps', targets: [], notes: [], headline: 'A good week', review: '- 3 sessions\n- RDL up again' }) }] } }] }))
    }
    if (last.parts.some((p) => p.functionResponse)) return sse(res, [{ text: 'Done. Week 1 starts today.' }])
    const q = last.parts.map((p) => p.text || '').join(' ')
    if (/block/i.test(q))
      return sse(res, [{ functionCall: { name: 'propose_training_block', args: { name: 'Strength base · 6 weeks', start_date: new Date().toISOString().slice(0, 10), weeks: 6, summary: 'Build volume on the RDL and rows, then go heavier.', phases: [{ from_week: 1, to_week: 3, focus: 'Build', reps: '8-12', sets: 3, effort: '2-3 reps left' }, { from_week: 4, to_week: 5, focus: 'Heavier', reps: '5-8', sets: 3, effort: '1-2 reps left' }], deload_week: 6, key_lifts: [{ exercise: 'Dumbbell Romanian Deadlift', progression: 'Add 2 reps a week, then 2 kg' }] } } }])
    sse(res, [{ text: 'Here is how you are tracking.' }])
  })
}).listen(Number(process.argv[3] || 8788))
