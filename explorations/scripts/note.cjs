const { chromium } = require('/opt/node22/lib/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  for (const w of [390, 360]) {
    const p = await b.newPage({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark' })
    await p.goto('http://localhost:4173/#/history'); await p.waitForTimeout(1200)
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.head-import').click()])
    await fc.setFiles(process.argv[2]); await p.waitForTimeout(600)
    await p.locator('.modal .btn-primary').click(); await p.waitForTimeout(1500)
    const ta = p.locator('.fb-card textarea')
    const h = async () => Math.round((await ta.boundingBox()).height)
    const r = [await h()]
    await ta.click(); await ta.pressSequentially('ok', { delay: 20 }); r.push(await h())
    await ta.fill('Stretches took twice as long as planned and I only have 30 minutes on weekdays, so cut the warm-up please'); await p.waitForTimeout(100); r.push(await h())
    await ta.fill(''); await p.waitForTimeout(100); r.push(await h())
    console.log(w, 'empty → "ok" → long → cleared:', r.join(' → '), '| placeholder:', await ta.getAttribute('placeholder'))
    if (w === 390) await p.locator('.fb-card').screenshot({ path: '/home/user/Workout-tracker/qa/shots-when/fb-note.png' })
    await p.close()
  }
  await b.close()
})()
