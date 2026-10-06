const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  await page.click('text=Tap to resume'); await page.waitForTimeout(600);
  await page.locator('[aria-label="Options for Goblet Squat"]').tap(); await page.waitForTimeout(400);
  await page.click('text=Add note'); await page.waitForTimeout(400);
  await shot('15-add-note');
  const ae = await page.evaluate(()=>{const a=document.activeElement; const r=a.getBoundingClientRect(); return a.tagName+' '+a.getAttribute('aria-label')+' '+r.y});
  console.log('active', ae);
  await page.keyboard.type('Heels elevated on plates felt better');
  await page.locator('[aria-label="Minimize workout"]').tap(); await page.waitForTimeout(300);
  await page.click('text=Tap to resume'); await page.waitForTimeout(500);
  // move down goblet squat
  await page.locator('[aria-label="Options for Goblet Squat"]').tap(); await page.waitForTimeout(400);
  await page.click('text=Move down'); await page.waitForTimeout(500);
  await shot('16-after-move-down');
  console.log((await page.innerText('main, body')).replace(/\n/g,' | ').slice(0,500));
  await ctx.close(); })();
