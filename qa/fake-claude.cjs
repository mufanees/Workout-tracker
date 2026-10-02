// A stand-in for the claude.ai artifact runtime (window.claude.use) for walkthroughs:
// `db` and `user` backed by a store on the test side (survives closing the page), and `sample`
// answered by a scripted function. Usage: await installFakeClaude(context, { store, sample })
module.exports.installFakeClaude = async function installFakeClaude(ctx, { store, sample }) {
  await ctx.exposeBinding('__fcDb', async (_src, op, path, body) => {
    if (op === 'set') store.set(path, JSON.parse(JSON.stringify(body)))
    if (op === 'get') return store.get(path) || null
    if (op === 'list') return [...store.entries()].filter(([k]) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(([k, v]) => ({ id: k.slice(path.length + 1), data: v }))
    return null
  })
  await ctx.exposeBinding('__fcSample', async (_src, input, toolNames) => sample(input, toolNames))
  await ctx.addInitScript(() => {
    const listeners = []
    const snapDoc = (id, data) => ({ id, exists: !!data, data: () => data || undefined, metadata: { fromCache: false, hasPendingWrites: false } })
    const db = {
      collection(path) {
        return {
          doc(id) {
            const full = path + '/' + id
            return {
              async get() { return snapDoc(id, await window.__fcDb('get', full)) },
              async set(body) {
                await window.__fcDb('set', full, body)
                for (const l of listeners) if (l.path === path) l.push([{ type: 'modified', doc: snapDoc(id, body) }])
              },
            }
          },
          onSnapshot(next) {
            const l = { path, push: (changes) => next({ docs: changes.map((c) => c.doc), docChanges: () => changes }) }
            window.__fcDb('list', path).then((rows) => {
              const docs = rows.map((r) => snapDoc(r.id, r.data))
              next({ docs, docChanges: () => docs.map((doc) => ({ type: 'added', doc })) })
              listeners.push(l)
            })
            return () => {}
          },
        }
      },
    }
    const user = { id: async () => 'u_test' }
    const sample = async (input, opts = {}) => {
      const tools = opts.tools || []
      // scripted: the test side returns {calls:[{name,input}], text}
      let round = await window.__fcSample(input, tools.map((t) => t.name))
      for (const c of round.calls || []) {
        const t = tools.find((x) => x.name === c.name)
        if (t) await t.execute(c.input, { signal: new AbortController().signal })
      }
      const text = round.text || 'OK'
      opts.onText?.({ text, delta: text })
      return { text, truncated: false, modelTierApplied: 'default' }
    }
    sample.json = async (input, opts) => JSON.parse((await sample(input, opts)).text)
    sample.limits = async () => ({ maxPromptBytes: 262144, tools: { maxCount: 16 } })
    const caps = { db, user, sample }
    window.claude = { use: async (name) => caps[name] || null }
  })
}
