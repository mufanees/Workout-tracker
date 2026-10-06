const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  await page.click('text=Tap to resume'); await page.waitForTimeout(600);
  const w = page.locator('[aria-label="Set 1 weight in kg"]').first(); await w.tap(); await w.fill('14');
  await page.waitForTimeout(200);
  await shot('41-typed-14');
  await page.locator('[aria-label="Complete set 1"]').first().tap(); await page.waitForTimeout(400);
  await shot('42-after-check-14');
  // row: accept placeholder
  await page.locator('[aria-label="Complete set 1"]').first().tap(); await page.waitForTimeout(400);
  // goblet set 2 accept
  await page.locator('[aria-label="Complete set 2"]').first().tap(); await page.waitForTimeout(300);
  await page.locator('[aria-label="Complete set 2"]').first().tap(); await page.waitForTimeout(300);
  // set 3 of goblet: what placeholder
  await shot('43-set3-placeholder');
  await page.locator('[aria-label="Complete set 3"]').first().tap(); await page.waitForTimeout(400);
  await shot('44-check-empty-set');
  console.log(await page.evaluate(()=>document.querySelector('[aria-live], [role=status], [role=alert]')?.innerText));
  await ctx.close(); })();
