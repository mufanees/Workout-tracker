const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const D = __dirname;
async function open(opts = {}) {
  const ctx = await chromium.launchPersistentContext(D + '/profile' + (opts.profile || ''), {
    executablePath: '/opt/pw-browsers/chromium',
    viewport: opts.viewport || { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    colorScheme: opts.scheme || 'dark',
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('reps-token', 't'); } catch {} });
  const page = ctx.pages()[0] || await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  if (!opts.noGoto) { await page.goto('http://localhost:3200/' + (opts.path || '')); await page.waitForTimeout(800); }
  const shot = async (n, full) => { await page.screenshot({ path: D + '/' + n + '.png', fullPage: !!full }); console.log('shot', n); };
  const dump = async () => console.log(await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a, input, select, textarea, [role=button]').forEach(el => {
      const r = el.getBoundingClientRect(); if (!r.width) return;
      out.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').replace(/\s+/g,' ').slice(0,40)}" aria=${el.getAttribute('aria-label')||''} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out.join('\n');
  }));
  return { ctx, page, shot, dump };
}
module.exports = { open };
