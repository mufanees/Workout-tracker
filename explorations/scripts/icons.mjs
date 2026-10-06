import fs from 'node:fs'
const dir = '/home/user/Workout-tracker/node_modules/lucide-preact/dist/esm/icons/'
const want = { dumbbell: 'dumbbell', history: 'history', list: 'list', activity: 'activity', coach: 'message-circle', check: 'check', timer: 'timer', link: 'link-2', video: 'square-play', more: 'ellipsis', plus: 'plus', target: 'target', up: 'arrow-up' }
const out = {}
for (const [k, file] of Object.entries(want)) {
  let src
  for (const f of [file, file.replace(/-(\d)$/, '$1')]) { try { src = fs.readFileSync(dir + f + '.mjs', 'utf8'); break } catch {} }
  if (!src) {
    // aliases: find the file that re-exports this icon
    const alias = fs.readdirSync(dir).find((f) => f.endsWith('.mjs') && fs.readFileSync(dir + f, 'utf8').includes(`"${file}"`))
    src = alias && fs.readFileSync(dir + alias, 'utf8')
  }
  if (!src) { console.error('missing', file); continue }
  const data = eval('(' + src.slice(src.indexOf('const __iconData =') + 18, src.indexOf('\n};') + 2) + ')')
  const node = data.node
  out[k] = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([a]) => a !== 'key').map(([a, v]) => `${a}="${v}"`).join(' ')}/>`).join('')
}
fs.writeFileSync('/tmp/claude-0/-home-user-Workout-tracker/7e553bdd-1e91-54a0-9d08-274537fd6744/scratchpad/icons.json', JSON.stringify(out, null, 1))
console.log(Object.keys(out).join(' '))
