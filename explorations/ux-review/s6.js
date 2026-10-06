const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  await page.click('text=Tap to resume'); await page.waitForTimeout(600);
  await shot('09-resume-with-timer');
  await page.click('[aria-label="Add 15 seconds"]'); await page.waitForTimeout(200);
  await shot('09b-plus15');
  await page.click('text=Skip'); await page.waitForTimeout(300);
  // accept placeholders
  await page.locator('[aria-label="Complete set 2"]').nth(0).tap(); await page.waitForTimeout(400);
  await shot('10-placeholder-accepted');
  await page.locator('[aria-label="Complete set 2"]').nth(0).tap(); await page.waitForTimeout(500);
  await shot('10b-row-set2');
  // tap set type button for goblet set 3
  await page.locator('[aria-label^="Set 3, Normal set"]').nth(0).tap(); await page.waitForTimeout(400);
  await shot('11-settype-menu'); 
  console.log(await page.evaluate(()=>[...document.querySelectorAll('[role=dialog], dialog, .sheet')].map(e=>e.innerText).join('\n---\n')));
  await ctx.close(); })();
