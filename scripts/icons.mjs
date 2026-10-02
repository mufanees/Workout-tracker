// Renders public/favicon.svg into the PNG icons the manifest needs.
// Usage: node scripts/icons.mjs  (needs Playwright + Chromium available)
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
let pw
try {
  pw = require('playwright')
} catch {
  pw = require('/opt/node22/lib/node_modules/playwright')
}
const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
// Square (unrounded) background so iOS/Android can apply their own mask.
const square = svg.replace(/rx="\d+"/, 'rx="0"')
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${square}`)
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname })
}
await browser.close()
console.log('icons written')
