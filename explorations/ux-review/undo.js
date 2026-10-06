const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('console', m => m.type()==='error' && console.log('CONSOLE', m.text()));
  await p.goto('http://localhost:3100/');
  await p.evaluate(() => localStorage.setItem('reps-token', 'x'));
  await p.reload();
  await p.click('text=Start Workout A');
  await p.waitForSelector('.ex-card');
  const card = p.locator('.ex-card').first();
  const rows = () => card.locator('.swipe-wrap').count();
  console.log('initial rows', await rows());
  // fill reps on set 2 so we can see edit loss
  await card.locator('.set-kind').nth(0).click();
  await p.click('.action.danger');
  console.log('after delete', await rows());
  // edit another set before undo
  await card.locator('input[data-f="reps"]').nth(0).fill('7');
  await p.waitForTimeout(100);
  await p.click('.toast button');
  await p.waitForTimeout(200);
  console.log('after undo', await rows());
  const ids = await p.evaluate(async () => {
    const r = await new Promise(res => { const q = indexedDB.open('reps'); q.onsuccess = () => res(q.result) });
    await new Promise(r => setTimeout(r, 400));
    const w = await new Promise(res => { const g = r.transaction('meta').objectStore('meta').get('active'); g.onsuccess = () => res(g.result) });
    return w.exercises[0].sets.map(s => s.id + ':' + s.reps);
  });
  console.log('stored sets', ids);
  // Remove exercise undo
  await b.close();
})();
