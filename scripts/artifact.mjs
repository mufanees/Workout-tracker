// Bundles dist/ into one self-contained HTML file (for hosting as a single page, e.g. a Claude artifact).
// Usage: npm run build && node scripts/artifact.mjs [out.html]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const dist = new URL('../dist/', import.meta.url)
const out = process.argv[2] || new URL('../dist/reps-single.html', import.meta.url).pathname
const assets = readdirSync(new URL('assets/', dist))
const js = readFileSync(new URL('assets/' + assets.find((f) => f.endsWith('.js')), dist), 'utf8')
let css = readFileSync(new URL('assets/' + assets.find((f) => f.endsWith('.css')), dist), 'utf8')
// Self-hosted font files can't ship in one file cheaply; load the same face from Google Fonts instead.
css = css.replace(/@font-face\{[^}]*\}/g, '')

const html = `<title>Gloop</title>
<meta name="theme-color" content="#0b0c0f">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400..700&family=Inter:opsz,wght@14..32,400..700&display=swap">
<style>${css}</style>
<div id="app"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`
writeFileSync(out, html)
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`)
