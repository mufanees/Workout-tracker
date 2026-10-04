// A small MCP server (Streamable HTTP, JSON responses) so an assistant like Claude can
// import workout plans into Gloop and read your training history.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { PLAN_FORMAT, planPrompt, resolvePlan, slug } from '../shared/planImport.mjs'

const PROTOCOL = '2025-06-18'

export function createMcpHandler({ db, q, rootDir }) {
  const dataDir = path.join(rootDir, '..', 'src', 'data')
  const readJson = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'))
  // Same seeding rules as the app (src/seed.ts), so exercise ids line up on every device.
  const seedLibrary = (() => {
    const seen = new Set()
    const out = []
    for (const [name, muscle, equipment, type = 'weight_reps'] of [...readJson('curated.json'), ...readJson('library.json')]) {
      const id = slug(name)
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, name, muscle, equipment, type })
    }
    return out
  })()

  const rows = (store) =>
    db
      .prepare('SELECT id, data FROM records WHERE store = ? AND deleted = 0')
      .all(store)
      .map((r) => JSON.parse(r.data))
      .filter(Boolean)

  function library() {
    const map = new Map(seedLibrary.map((e) => [e.id, e]))
    for (const e of rows('exercises')) map.set(e.id, e)
    for (const r of db.prepare("SELECT id FROM records WHERE store = 'exercises' AND deleted = 1").all()) map.delete(r.id)
    return [...map.values()]
  }

  function write(store, rec) {
    const seq = q.maxSeq.get().seq + 1
    const updatedAt = Date.now()
    q.upsert.run(store, rec.id, updatedAt, 0, JSON.stringify({ ...rec, updatedAt }), seq)
  }

  const exName = () => {
    const lib = new Map(library().map((e) => [e.id, e.name]))
    return (id) => lib.get(id) || id
  }

  const fmtSet = (s) => (s.seconds != null && s.reps == null ? `${s.seconds}s` : s.weight != null ? `${+s.weight.toFixed(2)}kg×${s.reps ?? '?'}` : `${s.reps ?? '?'} reps`)

  const tools = [
    {
      name: 'get_plan_format',
      description: 'Get the JSON format and rules for importing a workout plan into Gloop. Call this before import_plan.',
      inputSchema: { type: 'object', properties: {} },
      run: () => `${planPrompt([]).split('Exercise list:')[0].trim()}\n\nUse search_exercises to find exact exercise names from the library before importing.`,
    },
    {
      name: 'search_exercises',
      description: 'Search the Gloop exercise library (about 900 exercises plus custom ones). Use exact names from here in import_plan.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words to match, e.g. "dumbbell row"' },
          muscle: { type: 'string', description: 'Chest, Back, Shoulders, Arms, Legs, Glutes, Core, Full Body, Cardio or Mobility' },
          limit: { type: 'number', description: 'Max results (default 25)' },
        },
      },
      run: ({ query = '', muscle, limit = 25 }) => {
        const words = String(query).toLowerCase().split(/\s+/).filter(Boolean)
        const hits = library()
          .filter((e) => (!muscle || e.muscle.toLowerCase() === String(muscle).toLowerCase()) && words.every((w) => `${e.name} ${e.equipment}`.toLowerCase().includes(w)))
          .sort((a, b) => a.name.length - b.name.length)
          .slice(0, Math.min(100, limit))
        return hits.length ? hits.map((e) => `${e.name} (${e.muscle}, ${e.equipment}, ${e.type})`).join('\n') : 'No matches. A new exercise is created on import if you include type, muscle and equipment.'
      },
    },
    {
      name: 'import_plan',
      description:
        'Create routines in Gloop from a workout plan. Exercise names are matched to the library; unknown ones become custom exercises. The routines appear in the app on its next sync.',
      inputSchema: {
        type: 'object',
        properties: { plan: { type: 'object', description: `A plan in this format:\n${PLAN_FORMAT}` } },
        required: ['plan'],
      },
      run: ({ plan }) => {
        const result = resolvePlan(typeof plan === 'string' ? JSON.parse(plan) : plan, library(), () => crypto.randomUUID().slice(0, 12))
        db.exec('BEGIN')
        try {
          for (const e of result.newExercises) write('exercises', e)
          for (const r of result.routines) write('routines', r)
          db.exec('COMMIT')
        } catch (err) {
          db.exec('ROLLBACK')
          throw err
        }
        const renamed = result.matches.filter((m) => !m.created && m.from.toLowerCase() !== m.to.toLowerCase())
        return [
          `Imported ${result.routines.length} routine(s)${result.folder ? ` into the "${result.folder}" folder` : ''}: ${result.routines.map((r) => r.name).join(', ')}.`,
          result.newExercises.length ? `New exercises: ${result.newExercises.map((e) => e.name).join(', ')}.` : '',
          renamed.length ? `Matched names: ${renamed.map((m) => `"${m.from}" → ${m.to}`).join('; ')}.` : '',
          'They will show up in the app the next time it syncs (on open, or within a minute).',
        ]
          .filter(Boolean)
          .join('\n')
      },
    },
    {
      name: 'list_routines',
      description: 'List the routines in Gloop with their exercises.',
      inputSchema: { type: 'object', properties: {} },
      run: () => {
        const name = exName()
        const list = rows('routines').sort((a, b) => (a.folder || '').localeCompare(b.folder || '') || a.order - b.order)
        return list.length
          ? list.map((r) => `${r.folder ? r.folder + ' / ' : ''}${r.name}: ${r.exercises.map((e) => `${name(e.exerciseId)} ${e.sets.length}×${e.target || ''}`).join(', ')}`).join('\n')
          : 'No routines synced to the server yet (the built-in Comeback plan lives in the app until edited).'
      },
    },
    {
      name: 'recent_workouts',
      description: 'Recent finished workouts with sets, duration and heart rate summary.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many (default 10, max 50)' },
          from: { type: 'string', description: 'Only workouts on or after this date, YYYY-MM-DD' },
          to: { type: 'string', description: 'Only workouts on or before this date, YYYY-MM-DD' },
        },
      },
      run: ({ limit = 10, from, to }) => {
        const name = exName()
        const lo = from ? Date.parse(from) : -Infinity
        const hi = to ? Date.parse(to) + 86400000 : Infinity
        const list = rows('workouts')
          .filter((w) => w.start >= lo && w.start < hi)
          .sort((a, b) => b.start - a.start)
          .slice(0, Math.min(50, limit))
        if (!list.length) return 'No workouts yet.'
        return list
          .map((w) => {
            const hr = w.hr?.length ? ` · HR avg ${Math.round(w.hr.reduce((a, p) => a + p[1], 0) / w.hr.length)} max ${Math.max(...w.hr.map((p) => p[1]))}` : ''
            const mins = w.end ? Math.round((w.end - w.start) / 60000) : '?'
            const ex = w.exercises.map((e) => `  ${name(e.exerciseId)}: ${e.sets.filter((s) => s.done).map(fmtSet).join(', ')}`).join('\n')
            return `${new Date(w.start).toISOString().slice(0, 16).replace('T', ' ')} ${w.name} (${mins} min${hr})${ex ? '\n' + ex : ''}`
          })
          .join('\n\n')
      },
    },
    {
      name: 'exercise_progress',
      description: 'Every logged session for one exercise, oldest first, to judge progression.',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      run: ({ name: wanted }) => {
        const lib = library()
        const needle = String(wanted).toLowerCase()
        const ex = lib.find((e) => e.name.toLowerCase() === needle) || lib.find((e) => e.name.toLowerCase().includes(needle))
        if (!ex) return `No exercise called "${wanted}".`
        const sessions = rows('workouts')
          .sort((a, b) => a.start - b.start)
          .flatMap((w) => w.exercises.filter((e) => e.exerciseId === ex.id).map((e) => `${new Date(w.start).toISOString().slice(0, 10)}: ${e.sets.filter((s) => s.done).map(fmtSet).join(', ')}`))
        return sessions.length ? `${ex.name}\n${sessions.join('\n')}` : `${ex.name} hasn't been logged yet.`
      },
    },
    {
      name: 'body_stats',
      description: 'Recent body weight, fasts, morning resting heart rate / HRV readings and shoulder stiffness ratings.',
      inputSchema: { type: 'object', properties: {} },
      run: () => {
        const weights = rows('body')
          .sort((a, b) => b.date - a.date)
          .slice(0, 30)
          .map((b) => `${new Date(b.date).toISOString().slice(0, 10)} ${b.kg} kg`)
        const fasts = rows('fasts')
          .sort((a, b) => b.start - a.start)
          .slice(0, 14)
          .map((f) => `${new Date(f.start).toISOString().slice(0, 16).replace('T', ' ')} ${f.end ? ((f.end - f.start) / 3600000).toFixed(1) + ' h' : 'in progress'} (goal ${f.goal} h)${f.note ? ` "${f.note}"` : ''}`)
        const notes = rows('days')
          .sort((a, b) => b.id.localeCompare(a.id))
          .slice(0, 21)
          .map((d) => {
            const lv = (v, words) => (v ? words[v - 1] : null)
            const ci = [lv(d.sleep, ['poor', 'ok', 'good']) && `sleep ${lv(d.sleep, ['poor', 'ok', 'good'])}`, lv(d.energy, ['low', 'ok', 'high']) && `energy ${lv(d.energy, ['low', 'ok', 'high'])}`, lv(d.stress, ['high', 'some', 'low']) && `stress ${lv(d.stress, ['high', 'some', 'low'])}`].filter(Boolean)
            return `${d.id}: ${ci.length ? `[${ci.join(', ')}] ` : ''}${String(d.text || '').slice(0, 300)}`
          })
        const reads = rows('readings')
          .sort((a, b) => b.date - a.date)
          .slice(0, 30)
          .map((r) => `${new Date(r.date).toISOString().slice(0, 10)} resting ${r.rhr} bpm${r.hrv ? `, HRV ${r.hrv} ms` : ''}`)
        const shoulder = rows('workouts')
          .filter((w) => w.shoulder != null)
          .sort((a, b) => b.start - a.start)
          .slice(0, 20)
          .map((w) => `${new Date(w.start).toISOString().slice(0, 10)} ${w.shoulder}/10`)
        return `Weight (newest first):\n${weights.join('\n') || 'none'}\n\nFasts:\n${fasts.join('\n') || 'none'}\n\nMorning readings:\n${reads.join('\n') || 'none'}\n\nShoulder stiffness after workouts (0-10):\n${shoulder.join('\n') || 'none'}\n\nDay notes:\n${notes.join('\n') || 'none'}`
      },
    },
  ]

  async function handle(msg) {
    const { id, method, params = {} } = msg || {}
    const reply = (result) => ({ jsonrpc: '2.0', id, result })
    const fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
    if (id === undefined) return null // notification
    switch (method) {
      case 'initialize':
        return reply({
          protocolVersion: params.protocolVersion || PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: 'gloop', version: '1.0.0' },
          instructions:
            'Gloop is a personal workout tracker. To import a plan: call get_plan_format, use search_exercises for exact names, then import_plan. Read tools: list_routines, recent_workouts, exercise_progress, body_stats. Weights are kg (per dumbbell for dumbbell exercises).',
        })
      case 'ping':
        return reply({})
      case 'tools/list':
        return reply({ tools: tools.map(({ run: _run, ...t }) => t) })
      case 'tools/call': {
        const tool = tools.find((t) => t.name === params.name)
        if (!tool) return fail(-32602, `Unknown tool: ${params.name}`)
        try {
          const text = await tool.run(params.arguments || {})
          return reply({ content: [{ type: 'text', text }] })
        } catch (e) {
          return reply({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true })
        }
      }
      default:
        return fail(-32601, `Method not found: ${method}`)
    }
  }

  const handler = async (body) => {
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handle))).filter(Boolean)
      return out.length ? out : null
    }
    return handle(body)
  }
  /** Run a read tool directly (the AI coach reuses these for look-ups). */
  handler.callTool = async (name, args = {}) => {
    const tool = tools.find((t) => t.name === name)
    if (!tool) throw new Error(`Unknown tool ${name}`)
    return tool.run(args)
  }
  handler.rows = rows
  handler.library = library
  return handler
}
