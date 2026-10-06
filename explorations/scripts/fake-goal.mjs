// Stand-in Gemini for the goal flow: round 1 proposes the 100 kg goal, round 2 answers. Logs requests.
import http from 'node:http'
import fs from 'node:fs'
const LOG = process.argv[2]
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
    fs.appendFileSync(LOG, JSON.stringify({ url: req.url, body: j }) + '\n')
    const last = j.contents.at(-1)
    if (req.url.includes(':generateContent')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ takeaway: 'ok', met: [], missed: [], focus: 'x', targets: [], notes: [] }) }] } }] }))
    }
    if (last.parts.some((p) => p.functionResponse)) return sse(res, [{ text: 'I set it up: **100 kg total × 3**. Your closest lift is the Romanian deadlift.' }])
    sse(res, [{ functionCall: { name: 'propose_goal', args: { text: '100 kg total for 3 reps with dumbbells', metric: 'lift', target: 100, exercise: 'any', reps: 3, equipment_max_kg: 24, milestones: [{ value: 48, label: '2 × 24 kg × 3' }, { value: 60 }, { value: 70 }, { value: 80 }, { value: 90 }, { value: 100 }] } } }])
  })
}).listen(Number(process.argv[3] || 8787))
