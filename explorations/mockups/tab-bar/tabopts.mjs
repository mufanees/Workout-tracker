import fs from 'fs'
const dir = '/home/user/Workout-tracker/node_modules/lucide-preact/dist/esm/icons/'
const svg = (name, size = 22) => {
  const src = fs.readFileSync(dir + name + '.mjs', 'utf8')
  const node = eval('(' + src.match(/node: (\[[\s\S]*?\n  \])/)[1] + ')')
  const inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('')
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}
const opts = [
  ['rotate-ccw-clock', 'History', 'Now'],
  ['calendar-check-2', 'Log', 'A: Log'],
  ['calendar-days', 'Calendar', 'B: Calendar'],
  ['chart-no-axes-column', 'Progress', 'C: Progress'],
  ['notebook-pen', 'Journal', 'D: Journal'],
]
let html = `<html><body style="margin:0;background:#0b0c0f;font-family:'Space Grotesk Variable',system-ui;padding:20px;display:grid;gap:18px">`
html += `<style>@font-face{font-family:'Space Grotesk Variable';src:url(file:///home/user/Workout-tracker/node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2)}</style>`
for (const [icon, label, cap] of opts) {
  html += `<div style="display:flex;align-items:center;gap:16px"><span style="width:96px;color:#8d939e;font-size:14px;font-weight:600">${cap}</span>
  <div style="display:flex;align-items:center;gap:10px;background:#111214;border-radius:999px;padding:8px;width:300px">
   <span style="display:inline-flex;align-items:center;gap:10px;background:#c6f432;color:#0b0c0f;border-radius:999px;padding:12px 20px;font-weight:700;font-size:17px">${svg(icon)} ${label}</span>
   <span style="color:#8d939e;display:inline-flex;gap:22px;margin-left:8px">${svg('list-checks')}${svg('activity')}</span></div></div>`
}
fs.writeFileSync('/tmp/claude-0/-home-user-Workout-tracker/7e553bdd-1e91-54a0-9d08-274537fd6744/scratchpad/tabopts.html', html + '</body></html>')
