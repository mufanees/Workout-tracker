p='server/server.mjs'; s=open(p).read()
start=s.index("const db = new DatabaseSync(path.join(DATA_DIR, 'reps.db'))")
end=s.index("function authorized(req) {")
end2=s.index("function send(res, status, body, headers = {}) {")
new_ctx=open('/tmp/claude-0/-home-user-Workout-tracker/7e553bdd-1e91-54a0-9d08-274537fd6744/scratchpad/ctx.txt').read()
s=s[:start]+new_ctx+s[end2:]
# remove the old sync (new one is in new_ctx)
a=s.index("// Last write wins, decided by the client's updatedAt.", s.index("function readBody"))
b=s.index("const TYPES = {")
s=s[:a]+s[b:]
a=s.index("const mcp = createMcpHandler({ db, q, rootDir: ROOT })", s.index("function serveStatic"))
b=s.index("server.listen(PORT, () => {")
s=s[:a]+open('/tmp/claude-0/-home-user-Workout-tracker/7e553bdd-1e91-54a0-9d08-274537fd6744/scratchpad/handler.txt').read()+s[b:]
s=s.replace("""  if (!TOKEN) console.warn('APP_TOKEN is not set: anyone who can reach this server can read and change your data.')""","""  if (OPEN) console.warn('Neither APP_TOKEN nor GOOGLE_CLIENT_ID is set: anyone who can reach this server can read and change your data.')
  else if (GOOGLE_CLIENT_ID && !ADMIN_EMAIL) console.warn('GOOGLE_CLIENT_ID is set but ADMIN_EMAIL isn’t: nobody can sign in as the owner with Google (the APP_TOKEN still works).')""")
old="for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => (db.close(), process.exit(0))))"
assert old in s
s=s.replace(old,"for (const sig of ['SIGINT', 'SIGTERM'])\n  process.on(sig, () =>\n    server.close(() => {\n      for (const ctx of contexts.values()) ctx.db.close()\n      accounts.db.close()\n      process.exit(0)\n    }),\n  )")
s=s.replace("import { coachEnabled, createCoach, friendlyError } from './coach.mjs'","import { coachEnabled, createCoach, friendlyError } from './coach.mjs'\nimport { createAccounts } from './accounts.mjs'")
s=s.replace("// Gloop server: serves the built PWA and stores synced data in SQLite.","// Gloop server: serves the built PWA, signs people in, and stores each person's synced data in\n// their own SQLite file.")
open(p,'w').write(s)
print('ok')
