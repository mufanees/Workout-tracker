// Browser walk: warm-up lines read and linked, saving and ranking exercise videos, sharing a video
// to Gloop, warm-up lines on the workout screen, and the coach saving a video from chat.
// npm run build && node qa/videos-ui.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const gemini = http
  .createServer(async (req, res) => {
    let raw = ''
    for await (const c of req) raw += c
    const body = JSON.parse(raw)
    const last = body.contents.at(-1).parts[0]
    const part = last.functionResponse ? { text: 'Saved. Your goblet squat button opens it now.' } : { functionCall: { name: 'save_exercise_video', args: { url: 'https://youtu.be/coachPick1', exercise: 'goblet squat' } } }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }] })}\n\n`)
  })
  .listen(0)
await new Promise((r) => gemini.once('listening', r))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-vid-'))
const PORT = 3900 + Math.floor(Math.random() * 90)
const env = { ...process.env, PORT: String(PORT), DATA_DIR: dir, APP_TOKEN: 'k', GEMINI_API_KEY: 'fake', GEMINI_BASE_URL: `http://127.0.0.1:${gemini.address().port}`, BACKUP_DAYS: '0' }
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
srv.stdout.on('data', (d) => (log += d))
srv.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 50 && !log.includes('listening'); i++) await new Promise((r) => setTimeout(r, 100))
const base = `http://127.0.0.1:${PORT}`
const shots = 'qa/shots-videos'
fs.mkdirSync(shots, { recursive: true })
const results = []
const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  (' + x + ')' : ''}`)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.addInitScript(() => localStorage.setItem('reps-token', 'k'))
  const p = await ctx.newPage()
  p.on('pageerror', (e) => results.push('PAGEERROR ' + e.message))
  const db = (store, k) =>
    p.evaluate(
      async ([store, k]) => {
        const r = indexedDB.open('reps')
        return await new Promise((res) => (r.onsuccess = () => { const s = r.result.transaction(store).objectStore(store); const q = k ? s.get(k) : s.getAll(); q.onsuccess = () => res(q.result) }))
      },
      [store, k],
    )
  await p.goto(base + '/#/train')
  await wait(2000)

  // 1. Warm-up editor: lines read and linked
  const rA = (await db('routines')).find((r) => r.name === 'Phase 1 · Workout A')
  await p.goto(base + `/#/routine/${rA.id}`)
  await p.waitForSelector('.move-preview', { timeout: 8000 })
  const rows = await p.$$eval('.move-preview:first-of-type .move-row', (els) => els.map((e) => ({ t: e.innerText.replace(/\n/g, ' | '), linked: !!e.querySelector('.move-link.on') })))
  check('warm-up lines read into move + dose', rows.some((r) => /Cat–cow \| × 8/.test(r.t)), rows.slice(0, 2).map((r) => r.t).join(' ; '))
  check('some lines linked to library exercises', rows.filter((r) => r.linked).length >= 2, `${rows.filter((r) => r.linked).length}/${rows.length} linked; not: ${rows.filter((r) => !r.linked).map((r) => r.t.split(' | ')[0]).join(', ')}`)
  await p.locator('.move-field').first().screenshot({ path: `${shots}/1-warmup-editor.png` })
  // link an unlinked line by hand
  const idx = rows.findIndex((r) => !r.linked && !/Ramp-up|\+/.test(r.t))
  const unlinkedName = rows[idx].t.split(' | ')[0]
  await p.locator('.move-preview').first().locator('.move-row').nth(idx).click()
  await p.click('button:has-text("Link to an exercise")')
  await wait(500)
  await p.fill('input[aria-label="Search exercises"]', 'Arm Circles')
  await wait(400)
  await p.locator('.pick-row:has-text("Arm Circles")').first().click()
  await wait(600)
  const linkedNow = await p.locator('.move-preview').first().locator('.move-row').nth(idx).locator('.move-link.on').count()
  check(`hand link remembered ("${unlinkedName}" → Arm Circles)`, linkedNow === 1)
  const st = await db('settings', 'settings')
  check('link stored by move name', Object.values(st.moveLinks || {}).length === 1)
  // add from library
  await p.locator('.move-actions button:has-text("Add from library")').first().click()
  await wait(400)
  await p.fill('input[aria-label="Search exercises"]', 'Chin Tuck')
  await wait(400)
  await p.locator('.pick-row:has-text("Chin Tuck")').first().click()
  await p.click('button:has-text("Add 1 exercise")')
  await wait(400)
  const ta = await p.locator('.move-field textarea').first().inputValue()
  check('add from library appends a line', /Chin Tuck × 10\s*$/.test(ta))

  // 2. Exercise videos: save two, rank, button follows the preferred one
  const gs = (await db('exercises')).find((e) => e.name === 'Goblet Squat')
  await p.goto(base + `/#/exercises/${gs.id}`)
  await wait(1200)
  await p.click('button[aria-label="Your videos for this exercise"]')
  await p.fill('.vs-type input', 'https://www.youtube.com/watch?v=first111&si=track')
  await p.click('.vs-type button:has-text("Save")')
  await wait(500)
  await p.evaluate(() => navigator.clipboard.writeText('Look at this https://youtu.be/second22 nice'))
  await p.click('button:has-text("Paste link")')
  await wait(600)
  let ex = await db('exercises', gs.id)
  check('two videos saved, newest preferred, tracking stripped', ex.videos?.length === 2 && ex.videos[0].url === 'https://youtu.be/second22' && ex.videos[1].url === 'https://www.youtube.com/watch?v=first111', JSON.stringify(ex.videos?.map((v) => v.url)))
  await p.locator('.vs-videos li').nth(1).locator('button').first().click()
  await wait(500)
  ex = await db('exercises', gs.id)
  check('star makes another preferred', ex.videos[0].url === 'https://www.youtube.com/watch?v=first111')
  await p.locator('.sheet, [role=dialog]').last().screenshot({ path: `${shots}/2-video-sheet.png` }).catch(() => p.screenshot({ path: `${shots}/2-video-sheet.png` }))
  await p.keyboard.press('Escape')
  await wait(500)
  const watch = await p.getAttribute('.ex-video-row a', 'href')
  check('watch button opens the preferred video', watch === 'https://www.youtube.com/watch?v=first111', watch)

  // 3. Share a video to Gloop
  await p.goto(base + '/share?title=' + encodeURIComponent('How to do the Romanian Deadlift with dumbbells') + '&text=' + encodeURIComponent('https://youtu.be/sharedRDL'))
  await p.waitForSelector('text=Save this video', { timeout: 8000 })
  check('share opens "Save this video" and cleans the address', (await p.evaluate(() => location.pathname)) === '/')
  const guesses = await p.$$eval('.vs-list .pick-name', (els) => els.map((e) => e.textContent))
  check('guesses the exercise from the title', /Romanian Deadlift/i.test(guesses[0] || ''), guesses.slice(0, 3).join(', '))
  await wait(400)
  await p.screenshot({ path: `${shots}/3-share.png` })
  const first = guesses[0]
  await p.locator('.vs-list .pick-row').first().click()
  await wait(600)
  const rdl = (await db('exercises')).find((e) => e.name === first)
  check('shared video saved on that exercise', rdl.videos?.[0]?.url === 'https://youtu.be/sharedRDL')

  // 4. Workout screen: warm-up lines read, linked line uses its exercise video
  // give Cat-Cow a video, then start Workout A
  const cc = (await db('exercises')).find((e) => e.name === 'Cat-Cow')
  await p.evaluate(async ([id]) => {
    const r = indexedDB.open('reps')
    await new Promise((res) => (r.onsuccess = () => { const t = r.result.transaction('exercises', 'readwrite'); const s = t.objectStore('exercises'); const g = s.get(id); g.onsuccess = () => { s.put({ ...g.result, videos: [{ url: 'https://youtu.be/catcowfav', added: 1 }], updatedAt: Date.now() }, id) }; t.oncomplete = res }))
  }, [cc.id])
  await p.goto(base + '/#/train')
  await p.reload()
  await wait(1500)
  await p.locator('.btn-lg:has-text("Start")').first().click()
  await p.waitForFunction(() => location.hash.startsWith('#/live'), null, { timeout: 5000 })
  await wait(1200)
  const items = await p.$$eval('.checklist li', (els) => els.map((e) => ({ t: e.innerText.replace(/\n/g, ' | '), href: e.querySelector('a')?.getAttribute('href') || '', own: !!e.querySelector('a.own-video') })))
  const catLine = items.find((i) => /Cat–cow/.test(i.t))
  check('checklist shows move and dose', /Cat–cow \| × 8/.test(catLine?.t || ''), catLine?.t)
  check('linked line opens your video', catLine?.href === 'https://youtu.be/catcowfav' && catLine.own, catLine?.href)
  await p.locator('.checklist').first().screenshot({ path: `${shots}/4-checklist.png` })

  // 5. Coach saves a video from chat
  await p.goto(base + '/#/coach')
  await p.waitForSelector('textarea, input[placeholder="Ask your coach"]', { timeout: 8000 })
  await p.fill('textarea, input[placeholder="Ask your coach"]', 'use this for goblet squats https://youtu.be/coachPick1')
  await p.keyboard.press('Enter')
  await p.waitForSelector('text=Video saved', { timeout: 15000 })
  await wait(800)
  ex = await db('exercises', gs.id)
  check('coach saved it as the preferred video', ex.videos?.[0]?.url === 'https://youtu.be/coachPick1', JSON.stringify(ex.videos?.map((v) => v.url)))
  check('server answered the title lookup route', (await (await fetch(base + '/api/video-info?url=' + encodeURIComponent('https://example.com/x'), { headers: { authorization: 'Bearer k' } })).json()).title === null)
} catch (e) {
  results.push('ERROR ' + e.message.split('\n')[0])
}
console.log(results.join('\n'))
await browser.close()
srv.kill()
gemini.close()
