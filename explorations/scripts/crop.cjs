const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const p = await b.newPage({ viewport: { width: 390, height: 300 }, deviceScaleFactor: 2 })
  await p.goto('file:///home/user/Workout-tracker/qa/shots15/03-coach-dots.png')
  await p.screenshot({ path: '/home/user/Workout-tracker/qa/shots15/dots-crop.png', clip: { x: 0, y: 0, width: 390, height: 200 } })
  await b.close()
})()
