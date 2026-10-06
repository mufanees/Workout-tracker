const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const files = process.argv.slice(3), out = process.argv[2]
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const p = await b.newPage({ viewport: { width: 400, height: 100 } })
  const fs = require('fs')
  const imgs = files.map((f) => `<div style="font:12px sans-serif;color:#888">${f}</div><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:400px;display:block;margin-bottom:6px">`).join('')
  await p.setContent(`<body style="margin:0;background:#fff">${imgs}</body>`)
  await p.waitForTimeout(200)
  await p.screenshot({ path: out, fullPage: true })
  await b.close()
})()
