// The landing page lives once, as a full HTML document at public/welcome/index.html (served at
// https://gloop.novas.my/, with the app on https://app.gloop.novas.my; see server/site.mjs). This writes the copy for a Claude artifact, which the host wraps in
// its own <!doctype>, <html>, <head> and <body>: the title, the font links, the styles and the body's
// content, nothing else. Run it after every change to the page so the two never drift:
//   node scripts/landing.mjs [out.html]      (default: dist/gloop-landing.html)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const src = readFileSync(path.join(root, 'public/welcome/index.html'), 'utf8')
const out = path.resolve(process.argv[2] || path.join(root, 'dist/gloop-landing.html'))

const one = (re, what) => {
  const m = src.match(re)
  if (!m) throw new Error(`landing: no ${what} in public/welcome/index.html`)
  return m
}
const head = one(/<head>([\s\S]*?)<\/head>/i, '<head>')[1]
const title = one(/<title>[\s\S]*?<\/title>/i, '<title>')[0]
const fonts = [...head.matchAll(/<link[^>]+(?:fonts\.googleapis|fonts\.gstatic)[^>]*>/gi)].map((m) => m[0])
const style = one(/<style>[\s\S]*?<\/style>/i, '<style>')[0]
const body = one(/<body[^>]*>([\s\S]*?)<\/body>/i, '<body>')[1].trim()

// the page's head script points "Open Gloop" at the app host; the artifact has no head, so say it outright
const APP_URL = 'https://app.gloop.novas.my/'
const page = [title, ...fonts, style, body.replace(/href="\/" data-app/g, `href="${APP_URL}" data-app`)].join('\n') + '\n'
if (/<(!doctype|html|head|body)[\s>]/i.test(page.replace(/<script>[\s\S]*?<\/script>/g, ''))) throw new Error('landing: wrapper tags left in the artifact copy')
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, page)
console.log(`landing: wrote ${path.relative(process.cwd(), out)} (${(page.length / 1024).toFixed(1)} KB)`)
