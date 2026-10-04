// Renders the icon SVGs (scripts/icon.mjs) to the PNGs the app ships, with headless Chromium.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const fs = require('fs')
const out = [
  ['design-system/icon/gloop-icon.svg', 'public/icon-512.png', 512],
  ['design-system/icon/gloop-icon.svg', 'public/icon-192.png', 192],
  ['design-system/icon/gloop-icon.svg', 'public/apple-touch-icon.png', 180],
  ['design-system/icon/gloop-icon-maskable.svg', 'public/icon-maskable-512.png', 512],
]
;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  for (const [src, dst, size] of out) {
    const p = await b.newPage({ viewport: { width: size, height: size } })
    const svg = fs.readFileSync(src, 'utf8').replace('width="512" height="512"', `width="${size}" height="${size}"`)
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)
    await p.screenshot({ path: dst, clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true })
    await p.close()
    console.log(dst)
  }
  await b.close()
})()
