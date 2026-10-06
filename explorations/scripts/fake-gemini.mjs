import http from 'node:http'
import fs from 'node:fs'
http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', async () => {
    const j = JSON.parse(body)
    fs.writeFileSync(process.argv[2], JSON.stringify({ url: req.url, key: req.headers['x-goog-api-key'], body: j }, null, 2))
    if (req.headers['x-goog-api-key'] === 'limit') {
      res.writeHead(429, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } }))
    }
    const q = j.contents.at(-1).parts[0].text
    const ctx = j.systemInstruction.parts[1].text
    const reply = `**${q}**: looking at your log (${ctx.length} chars of data).\n- Hammer Curl stuck at **10 kg**: take the lighter week.\n- Zone 2 is low this week.\n\n1. Add 1 kg on goblet squat\n2. Do 30 min of zone 2`
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const chunks = reply.match(/[\s\S]{1,20}/g)
    res.write(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'thinking...', thought: true }] } }] })}\r\n\r\n`)
    for (const [i, c] of chunks.entries()) {
      const cand = { content: { role: 'model', parts: [{ text: c }] }, index: 0 }
      if (i === chunks.length - 1) cand.finishReason = 'STOP'
      res.write(`data: ${JSON.stringify({ candidates: [cand], modelVersion: 'gemini-3.5-flash' })}\r\n\r\n`)
      await new Promise((r) => setTimeout(r, 15))
    }
    res.end()
  })
}).listen(3998)
