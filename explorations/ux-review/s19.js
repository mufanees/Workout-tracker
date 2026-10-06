const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  await page.click('[aria-label="Start Phase 1 · Workout A"]'); await page.waitForTimeout(900);
  await shot('40-second-workout-A'); 
  await page.evaluate(()=>window.scrollTo(0, 900)); await page.waitForTimeout(200);
  await shot('40b-second-workout-A-scrolled');
  console.log(await page.innerText('body').then(t=>t.slice(0,900)));
  await ctx.close(); })();
