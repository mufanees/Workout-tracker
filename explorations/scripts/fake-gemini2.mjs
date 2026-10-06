// Stand-in Gemini: function calls in chat (2 rounds), JSON for generateContent. Logs every request.
import http from 'node:http'
import fs from 'node:fs'
const LOG = process.argv[2]
const sse = async (res, parts, finish = 'STOP') => {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.write(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'hmm', thought: true, thoughtSignature: 'sig-A' }] } }] })}\r\n\r\n`)
  for (const [i, p] of parts.entries()) {
    const cand = { content: { role: 'model', parts: [p] }, index: 0 }
    if (i === parts.length - 1) cand.finishReason = finish
    res.write(`data: ${JSON.stringify({ candidates: [cand] })}\r\n\r\n`)
    await new Promise((r) => setTimeout(r, 30))
  }
  res.end()
}
http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', async () => {
    const j = JSON.parse(body)
    fs.appendFileSync(LOG, JSON.stringify({ url: req.url, body: j }) + '\n')
    const last = j.contents.at(-1)
    if (req.url.includes(':generateContent')) {
      const prompt = last.parts[0].text
      let out
      if (prompt.includes('is starting')) {
        const names = prompt.match(/exercises: (.*)\. Using/)[1].split(', ')
        out = { focus: 'Own the eccentric today: 3 seconds down on every rep.', targets: names.slice(0, 4).map((n, i) => ({ exercise: n, weight_kg: [14, 12, 8, 10][i], reps: '8-10', note: i === 0 ? 'Up 2 kg from last time' : '' })) }
      } else if (prompt.includes('just finished')) {
        const ids = [...j.systemInstruction.parts.map((p) => p.text).join('\n').matchAll(/\[(commit-[^\]]+)\]/g)].map((m) => m[1])
        out = { takeaway: 'Goblet squat moved at **14 kg × 10**, a clean 2 kg jump. Keep it there one more session before adding weight.', met: ids.slice(0, 1), missed: [] }
      } else if (prompt.includes('older chat')) out = { notes: ['Prefers supersets to keep sessions under 35 minutes.'] }
      else if (prompt.includes('weekly review')) out = { headline: '3 sessions, 95 min zone 2. Squat is moving.', review: '**3 sessions** this week, 95 of 150 min zone 2.\n- Win: goblet squat up to 14 kg × 10.\n- Watch: shoulder rated 6/10 on Thursday.\n- Next week: add one 40 min zone 2 walk.' }
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }] }))
    }
    const fr = last.parts.filter((p) => p.functionResponse)
    if (!fr.length) {
      // round 1: look up routines and save a note
      return sse(res, [{ text: 'Let me check your plan. ' }, { functionCall: { name: 'list_routines', args: {} }, thoughtSignature: 'sig-B' }, { functionCall: { name: 'remember', args: { note: 'Left shoulder gets cranky above 10 kg on overhead press.' } } }])
    }
    if (fr.some((p) => p.functionResponse.name === 'list_routines')) {
      const routine = String(fr.find((p) => p.functionResponse.name === 'list_routines').functionResponse.response.result).split('\n')[0].split(':')[0].split(' / ').pop()
      const ex = String(fr.find((p) => p.functionResponse.name === 'list_routines').functionResponse.response.result).split('\n')[0].split(': ')[1].split(', ')[0].replace(/ \d+×.*$/, '')
      const due = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)
      return sse(res, [
        { functionCall: { name: 'set_commitment', args: { text: `${ex} 14 kg × 8–10 next session`, due_date: due } } },
        { functionCall: { name: 'propose_routine_targets', args: { routine, reason: 'You hit the top of the rep range twice.', changes: [{ exercise: ex, weight_kg: 14, reps: 8, sets: 3 }] } } },
        { functionCall: { name: 'propose_goal', args: { text: 'Goblet squat 20 kg × 10', due_date: '2026-12-15' } } },
      ])
    }
    const reply = `Here's the plan.\n- I saved a note about your shoulder.\n- **Next session:** 14 kg × 8–10, and I'll check in after.\n\nApprove the routine change below if it looks right.`
    return sse(res, reply.match(/[\s\S]{1,24}/g).map((text) => ({ text })))
  })
}).listen(3998)
