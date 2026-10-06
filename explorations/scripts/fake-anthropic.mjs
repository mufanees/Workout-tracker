import http from 'node:http'
import fs from 'node:fs'
http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', async () => {
    const j = JSON.parse(body)
    fs.writeFileSync(process.argv[2], JSON.stringify({ path: req.url, headers: req.headers, body: j }, null, 2))
    const ctx = j.system?.[1]?.text || ''
    const lastQ = j.messages.at(-1).content
    const weeks = (ctx.match(/WEEKLY TOTALS/g) || []).length
    const reply = `## Quick read\n**${lastQ}**: here's what I see.\n- Context received: ${ctx.length} characters, weekly totals section: ${weeks ? 'yes' : 'no'}\n- Hammer Curl has been stuck at **10 kg**, so take the lighter week.\n- Zone 2 is low this week.\n\n1. Next session: add 1 kg on goblet squat\n2. Do 30 min of zone 2`
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
    ev('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: j.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } })
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    for (const chunk of reply.match(/[\s\S]{1,12}/g)) {
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: chunk } })
      await new Promise((r) => setTimeout(r, 15))
    }
    ev('content_block_stop', { index: 0 })
    ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 80 } })
    ev('message_stop', {})
    res.end()
  })
}).listen(3999)
