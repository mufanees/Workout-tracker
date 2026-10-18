// The coach on the Claude API (your ANTHROPIC_API_KEY), next to Gemini: the same tools, proposals
// and streaming, plus what each request cost so the server can keep everyone within budget.
import Anthropic from '@anthropic-ai/sdk'
import { COACH_TOOLS } from '../shared/coachSpec.mjs'

export const claudeEnabled = () => !!process.env.ANTHROPIC_API_KEY

/** The models the coach can use, cheapest first. Prices in USD per million tokens. */
export const MODELS = {
  haiku: { id: 'claude-haiku-5-5', label: 'Haiku', input: 0.1, output: 0.5, cacheRead: 0.01 },
  sonnet: { id: 'claude-sonnet-5-5', label: 'Sonnet', input: 2, output: 10, cacheRead: 0.2 },
  opus: { id: 'claude-opus-5-5', label: 'Opus', input: 4, output: 20, cacheRead: 0.2 },
}
export const CHEAPEST = 'haiku'
export const EFFORTS = ['low', 'medium']

let client = null
const api = () => (client ||= new Anthropic({ maxRetries: 2 }))

const byId = (id) => Object.values(MODELS).find((m) => m.id === id || String(id || '').startsWith(m.id))

/** USD for one response's usage; priced at the model that actually served it. */
export function costOf(usage, servedBy, asked) {
  const m = byId(servedBy) || asked
  if (!usage || !m) return 0
  const write = usage.cache_creation_input_tokens || 0 // 5-minute cache writes cost 1.25× input
  return ((usage.input_tokens || 0) * m.input + write * m.input * 1.25 + (usage.cache_read_input_tokens || 0) * m.cacheRead + (usage.output_tokens || 0) * m.output) / 1e6
}

const TOOLS = COACH_TOOLS.map(({ name, description, parameters }) => ({ name, description, input_schema: parameters }))

function request(key, effort, extra) {
  const m = MODELS[key]
  return {
    model: m.id,
    output_config: { effort: EFFORTS.includes(effort) ? effort : 'low' },
    // Caches the instructions and training data, re-read on every tool round of the same answer.
    cache_control: { type: 'ephemeral' },
    // Opus and Sonnet: if a safety check declines, the API retries on a suitable model in the same call.
    ...(key === 'haiku' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
    ...extra,
  }
}

/**
 * One chat answer with tool rounds (max 6). Streams text through `send({ t })`, runs tools through
 * `runTool(name, input)`, reports each round's cost through `onCost(usd, model)` as it happens (so a
 * stopped answer is still charged for the rounds that ran). Resolves with the total and the model.
 */
export async function claudeChat({ system, messages, key, effort, send, runTool, onCost, signal }) {
  const msgs = messages.map((m) => ({ role: m.role, content: m.content }))
  let usd = 0
  let served = MODELS[key].id
  for (let round = 0; round < 6; round++) {
    const stream = api().beta.messages.stream(request(key, effort, { max_tokens: 16000, system, tools: TOOLS, messages: msgs }), { signal })
    stream.on('text', (t) => send({ t }))
    const msg = await stream.finalMessage()
    const cost = costOf(msg.usage, msg.model, MODELS[key])
    usd += cost
    served = msg.model || served
    onCost?.(cost, served)
    if (msg.stop_reason === 'refusal') {
      send({ t: '\n\nThe coach can’t help with that one. Try asking about your training a different way.' })
      break
    }
    const calls = msg.content.filter((b) => b.type === 'tool_use')
    if (msg.stop_reason === 'max_tokens') {
      send({ t: '\n\n(Answer cut short.)' })
      break
    }
    if (msg.stop_reason === 'pause_turn') {
      msgs.push({ role: 'assistant', content: msg.content })
      continue
    }
    if (!calls.length) break
    msgs.push({ role: 'assistant', content: msg.content })
    const results = []
    for (const c of calls) {
      send({ tool: c.name })
      let out
      try {
        out = await runTool(c.name, c.input)
      } catch (e) {
        out = { error: String(e?.message || e) }
      }
      results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out).slice(0, 60000), ...(out?.error ? { is_error: true } : {}) })
    }
    msgs.push({ role: 'user', content: results })
  }
  return { usd, model: served }
}

/** A single JSON answer that follows `schema` (JSON Schema). Resolves with { out, usd }. */
export async function claudeJson({ system, prompt, schema, key, effort, signal }) {
  const msg = await api()
    .beta.messages.stream(
      request(key, effort, {
        max_tokens: 8000,
        system,
        messages: [{ role: 'user', content: `${prompt}\n\nReply with only one JSON object that follows this JSON Schema, no other text:\n${JSON.stringify(schema)}` }],
      }),
      { signal },
    )
    .finalMessage()
  const usd = costOf(msg.usage, msg.model, MODELS[key])
  if (msg.stop_reason === 'refusal') throw Object.assign(new Error('The coach declined that request.'), { usd })
  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  try {
    return { out: JSON.parse(json), usd }
  } catch {
    throw Object.assign(new Error('The coach’s answer wasn’t readable. Try again.'), { usd })
  }
}

export function claudeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'The server’s ANTHROPIC_API_KEY was rejected.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'The server’s ANTHROPIC_API_KEY can’t use this model.'
  if (e instanceof Anthropic.RateLimitError) return 'The coach is busy right now. Try again in a minute.'
  if (e instanceof Anthropic.APIError && e.status === 529) return 'Claude is overloaded right now. Try again in a minute.'
  if (e instanceof Anthropic.APIError) return `Claude: ${e.message}`
  return null
}
