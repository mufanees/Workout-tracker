const { chromium } = require('/opt/node22/lib/node_modules/playwright')
const fs = require('fs')
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')
const fav = 'data:image/svg+xml;base64,' + fs.readFileSync('/home/user/Workout-tracker/public/favicon.svg').toString('base64')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const p = await b.newPage({ viewport: { width: 760, height: 300 } })
  const R = '/home/user/Workout-tracker/public/'
  await p.setContent(`<body style="margin:0;padding:20px;display:flex;gap:24px;align-items:center;background:#e9e8e2;font:13px sans-serif">
    <div style="text-align:center"><img src="${b64(R + 'icon-192.png')}" width="120" style="border-radius:28px"><br>home (squircle)</div>
    <div style="text-align:center"><img src="${b64(R + 'icon-maskable-512.png')}" width="120" style="border-radius:50%"><br>Android circle mask</div>
    <div style="text-align:center"><img src="${b64(R + 'apple-touch-icon.png')}" width="60" style="border-radius:14px"><br>small</div>
    <div style="text-align:center;background:#fff;padding:8px;border-radius:8px"><img src="${fav}" width="32"><br>tab (light)</div>
    <div style="text-align:center;background:#202124;color:#ddd;padding:8px;border-radius:8px"><img src="${fav}" width="32"><br>tab (dark)</div>
  </body>`)
  await p.waitForTimeout(300)
  await p.screenshot({ path: '/home/user/Workout-tracker/design-system/icon/preview.png' })
  await b.close()
})()
