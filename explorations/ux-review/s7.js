const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  await page.click('text=Tap to resume'); await page.waitForTimeout(600);
  await page.locator('[aria-label^="Set 3, Normal set"]').nth(0).tap(); await page.waitForTimeout(400);
  await page.click('text=Warm-up set'); await page.waitForTimeout(400);
  await shot('12-warmup-set');
  // delete row set 3
  await page.locator('[aria-label^="Set 3, Normal set"]').nth(0).tap(); await page.waitForTimeout(400);
  await page.click('text=Delete set'); await page.waitForTimeout(500);
  await shot('13-after-delete');
  console.log(await page.innerText('body').then(t=>t.slice(0,600)));
  // options menu on goblet squat
  await page.locator('[aria-label="Options for Goblet Squat"]').tap(); await page.waitForTimeout(400);
  await shot('14-exercise-options');
  console.log(await page.evaluate(()=>[...document.querySelectorAll('[role=dialog], dialog')].map(e=>e.innerText).join('\n---\n')));
  await ctx.close(); })();
