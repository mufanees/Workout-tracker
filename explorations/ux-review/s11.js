const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  await page.click('text=Tap to resume'); await page.waitForTimeout(600);
  await page.click('text=Add exercise'); await page.waitForTimeout(500);
  await page.fill('input[placeholder="Search exercises"]', 'lateral'); await page.waitForTimeout(300);
  await page.click('text=Lateral Raise'); await page.waitForTimeout(300);
  await page.click('text=Add 1 exercise'); await page.waitForTimeout(700);
  console.log('scrollY', await page.evaluate(()=>scrollY), await page.evaluate(()=>document.body.scrollHeight));
  await shot('23-after-add-exercise');
  // fill the push-up rows and complete one to trigger timer
  await page.evaluate(()=>window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(300);
  await shot('24-bottom-of-workout');
  // reload
  await page.reload(); await page.waitForTimeout(1200);
  console.log('after reload url', page.url(), 'scrollY', await page.evaluate(()=>scrollY));
  await shot('25-after-reload');
  await ctx.close(); })();
