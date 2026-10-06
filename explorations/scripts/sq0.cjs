const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const p = await b.newPage()
  console.log(b.version(), await p.evaluate(() => CSS.supports('corner-shape', 'squircle')))
  await b.close()
})()
