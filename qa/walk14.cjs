// Workout feedback → coach (on Claude, in the artifact copy) → approve a routine rework.
// Uses the stand-in artifact runtime in fake-claude.cjs; serve the build with `npx vite preview --port 4173`.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright')
const { installFakeClaude } = require('./fake-claude.cjs')
const URL = process.env.URL || 'http://localhost:4173/'
const OUT = __dirname + '/shots14/'
require('fs').mkdirSync(OUT, { recursive: true })
let lastChat = ''
const sample = async (input, toolNames) => {
  if (typeof input === 'string') {
    if (input.includes('is starting')) return { text: JSON.stringify({ focus: 'Smooth reps, short rests.', targets: [] }) }
    if (input.includes('was just finished')) return { text: JSON.stringify({ takeaway: 'You showed up and moved well. Next time, start the clock when you start the warm-up.' }) }
    return { text: '{}' }
  }
  const sys = input[0].content
  const last = input[input.length - 1].content
  lastChat = sys
  const routine = (last.match(/routine "([^"]+)"/) || [])[1]
  const line = sys.split('\n').find((l) => routine && l.includes(routine + ':')) || ''
  const first = (line.split(': ')[1] || '').split(/ \d+×/)[0]
  if (!toolNames.includes('propose_routine_changes')) return { text: 'no tools' }
  return {
    calls: [
      { name: 'search_exercises', input: { query: 'glute bridge' } },
      { name: 'remember', input: { note: 'Has about 30 minutes per session; warm-ups ran long.' } },
      {
        name: 'propose_routine_changes',
        input: {
          routine,
          reason: 'Fit it into 30 minutes and swap what hurt.',
          swaps: [{ from: first, to: 'Glute Bridge', sets: 3, reps: 12 }],
          warmup: ['Cat–cow × 6', 'Scap push-ups × 8', 'Ramp-up set: first exercise at half weight × 8'],
        },
      },
    ],
    text: `Your warm-up took most of the time. Here's a **30-minute** version: 3 warm-up moves instead of 7, and **${first}** swapped for a glute bridge since it hurt. Approve below.`,
  }
}
;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  await installFakeClaude(ctx, { store: new Map(), sample })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && !/api\//.test(m.text()) && errors.push('console: ' + m.text()))
  const shot = async (n, full) => { await page.waitForTimeout(450); await page.screenshot({ path: OUT + n + '.png', fullPage: !!full }) }
  await page.goto(URL + '#/train')
  await page.waitForSelector('.today-rings')
  await page.waitForTimeout(1500)
  await shot('01-home-solid-rings')
  const card = page.locator('.routine-card').first()
  const routineName = (await card.innerText()).split('\n').find((l) => /Workout/.test(l))
  await card.locator('button', { hasText: 'Start' }).tap()
  await page.waitForSelector('.live')
  for (let i = 0; i < 3; i++) await page.locator('.cl-item').nth(i).tap()
  await page.locator('.ex-card').first().locator('input').nth(0).fill('16')
  await page.locator('.ex-card').first().locator('input').nth(1).fill('10')
  await page.locator('.ex-card').first().locator('.check').first().tap()
  await page.locator('.live-head .btn-primary').tap()
  await page.waitForTimeout(400)
  const sheetBtn = page.locator('.sheet-foot .btn-primary')
  if (await sheetBtn.count()) await sheetBtn.tap()
  await page.waitForSelector('.fb-card')
  await page.locator('.fb-card').scrollIntoViewIfNeeded()
  await shot('02-feedback-empty')
  const rows = page.locator('.fb-row')
  await rows.nth(0).locator('.fb-opt', { hasText: 'Too long' }).tap()
  await rows.nth(1).locator('.fb-opt', { hasText: 'Too long' }).tap()
  await rows.nth(2).locator('.fb-opt', { hasText: 'Hurt' }).tap()
  await page.locator('.fb-card textarea').fill('Only have 30 minutes, my son needs me after.')
  await page.locator('.fb-card').scrollIntoViewIfNeeded()
  await shot('03-feedback-filled')
  await page.locator('.fb-card .btn-primary', { hasText: 'Ask coach' }).tap()
  await page.waitForSelector('.proposal', { timeout: 15000 })
  await page.waitForTimeout(800)
  await shot('04-coach-proposal', true)
  console.log('coach saw feedback:', /Athlete feedback: .*HURT/.test(lastChat), '| time line:', /Time: took \d+ min/.test(lastChat), '| note:', lastChat.includes('Only have 30 minutes'))
  await page.locator('.proposal .btn-primary').first().tap()
  await page.waitForTimeout(800)
  await shot('05-approved')
  await page.goto(URL + '#/train')
  await page.waitForTimeout(600)
  const r = page.locator('.routine-card', { hasText: routineName }).first()
  console.log('routine card now:', (await r.innerText()).replace(/\n/g, ' | ').slice(0, 160))
  await r.locator('button', { hasText: 'Start' }).tap()
  await page.waitForSelector('.live')
  await page.waitForTimeout(500)
  console.log('warm-up items now:', await page.locator('.cl-item').count() > 0 ? await page.locator('.checklist').first().locator('.cl-item').count() : 'n/a', '| first exercise:', (await page.locator('.ex-card').first().innerText()).split('\n')[0])
  await shot('06-new-routine')
  console.log(errors.join('\n') || 'no errors')
  await browser.close()
})()
