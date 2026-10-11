// What the coach costs: every AI call's tokens, priced from list prices, kept per day, person, model and
// kind of call in DATA_DIR/coach-usage.db (one ledger for the server, since there's one API key).
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// USD per million tokens: [input, output, cache read]. Cache writes bill at 1.25 × input (5-minute cache).
// List prices; the provider's console is the bill. COACH_PRICES='{"model-id":[in,out,cacheRead]}' adds or overrides.
const PRICES = {
  'claude-haiku-5-5': [0.1, 0.5, 0.01],
  'claude-sonnet-5-5': [2, 10, 0.2],
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-fable-5-1': [10, 50, 0.25],
  'claude-sonnet-5': [2, 10, 0.2],
  'claude-opus-5': [5, 25, 0.5],
  'claude-opus-4-8': [5, 25, 0.5],
  'claude-sonnet-4-6': [3, 15, 0.3],
  'claude-haiku-4-5': [1, 5, 0.1],
}
try {
  Object.assign(PRICES, JSON.parse(process.env.COACH_PRICES || '{}'))
} catch {
  console.warn('COACH_PRICES isn’t valid JSON; using the built-in prices')
}

/** The price row for a model id (a dated or prefixed id finds its family). */
export function priceOf(model) {
  const id = String(model || '').toLowerCase()
  if (PRICES[id]) return PRICES[id]
  const hit = Object.keys(PRICES)
    .sort((a, b) => b.length - a.length)
    .find((k) => id.includes(k))
  return hit ? PRICES[hit] : null
}

/**
 * Dollars for one call. `input` is uncached input (Claude reports it that way; OpenAI-style and Gemini counts
 * include the cached part, so pass `inputIncludesCache`). Claude Haiku 5.5 bills prompts over 100K at 5×.
 */
export function costOf(model, { input = 0, output = 0, cacheRead = 0, cacheWrite = 0 }, inputIncludesCache = false) {
  const p = priceOf(model)
  if (!p) return null
  const fresh = inputIncludesCache ? Math.max(0, input - cacheRead) : input
  const long = /haiku-5-5/.test(String(model)) && fresh + cacheRead + cacheWrite > 100000 ? 5 : 1
  const [inP, outP, readP] = p.map((x) => x * long)
  return (fresh * inP + output * outP + cacheRead * readP + cacheWrite * inP * 1.25) / 1e6
}

let db = null
function open() {
  if (db) return db
  const dir = path.resolve(process.env.DATA_DIR || 'data')
  fs.mkdirSync(dir, { recursive: true })
  db = new DatabaseSync(path.join(dir, 'coach-usage.db'))
  db.exec(`CREATE TABLE IF NOT EXISTS usage (
    day TEXT NOT NULL, who TEXT NOT NULL, model TEXT NOT NULL, kind TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0, input INTEGER NOT NULL DEFAULT 0, output INTEGER NOT NULL DEFAULT 0,
    cache_read INTEGER NOT NULL DEFAULT 0, cache_write INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0, unpriced INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, who, model, kind))`)
  return db
}

/** Add one call to the ledger. Never throws: a ledger problem mustn't break the coach. */
export function recordUsage({ who = '', model = '', kind = 'chat', usage, inputIncludesCache = false }) {
  if (!usage) return
  try {
    const cost = costOf(model, usage, inputIncludesCache)
    open()
      .prepare(
        `INSERT INTO usage (day, who, model, kind, calls, input, output, cache_read, cache_write, cost, unpriced)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (day, who, model, kind) DO UPDATE SET calls = calls + 1, input = input + excluded.input,
           output = output + excluded.output, cache_read = cache_read + excluded.cache_read,
           cache_write = cache_write + excluded.cache_write, cost = cost + excluded.cost, unpriced = unpriced + excluded.unpriced`,
      )
      .run(new Date().toISOString().slice(0, 10), String(who), String(model), String(kind), usage.input || 0, usage.output || 0, usage.cacheRead || 0, usage.cacheWrite || 0, cost ?? 0, cost == null ? 1 : 0)
  } catch (e) {
    console.warn('coach usage not recorded:', e?.message || e)
  }
}

/**
 * Spend for Settings. A person sees only their own calls; the admin (`all`) sees the whole server, with their
 * own share and how many people used the coach. Today, this month, by model and by kind, and the last 30 days.
 */
export function spendReport(who = '', all = false) {
  try {
    const d = open()
    const today = new Date().toISOString().slice(0, 10)
    const month = today.slice(0, 7)
    // a person's view is filtered to their own rows; the admin's isn't
    const scope = all ? '' : ' AND who = ?'
    const args = all ? [] : [String(who)]
    const sum = (where, ...a) =>
      d.prepare(`SELECT COALESCE(SUM(cost),0) cost, COALESCE(SUM(calls),0) calls, COALESCE(SUM(input+cache_read+cache_write),0) input, COALESCE(SUM(output),0) output, COALESCE(SUM(unpriced),0) unpriced FROM usage WHERE ${where}${scope}`).get(...a, ...args)
    const group = (col) =>
      d.prepare(`SELECT ${col} name, SUM(cost) cost, SUM(calls) calls, SUM(input+cache_read+cache_write) input, SUM(output) output, SUM(unpriced) unpriced FROM usage WHERE day LIKE ?${scope} GROUP BY ${col} ORDER BY SUM(cost) DESC, SUM(calls) DESC`).all(`${month}%`, ...args)
    const mineMonth = d.prepare(`SELECT COALESCE(SUM(cost),0) cost, COALESCE(SUM(calls),0) calls, COALESCE(SUM(input+cache_read+cache_write),0) input, COALESCE(SUM(output),0) output, COALESCE(SUM(unpriced),0) unpriced FROM usage WHERE day LIKE ? AND who = ?`).get(`${month}%`, String(who))
    return {
      scope: all ? 'server' : 'mine',
      today: sum('day = ?', today),
      month: sum('day LIKE ?', `${month}%`),
      monthMine: mineMonth,
      total: sum('1 = 1'),
      byModel: group('model'),
      byKind: group('kind'),
      days: d.prepare(`SELECT day, SUM(cost) cost, SUM(calls) calls FROM usage WHERE day >= ?${scope} GROUP BY day ORDER BY day`).all(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), ...args),
      people: all ? d.prepare(`SELECT COUNT(DISTINCT who) n FROM usage WHERE day LIKE ?`).get(`${month}%`).n : 1,
    }
  } catch (e) {
    return { error: String(e?.message || e) }
  }
}
