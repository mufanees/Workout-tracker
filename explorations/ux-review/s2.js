const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  await page.click('[aria-label="Week 1 of 12. Change week"]'); await page.waitForTimeout(400);
  await shot('02-week-picker'); await dump();
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.goto('http://localhost:3200/'); await page.waitForTimeout(500);
  await page.click('text=Start Workout A'); await page.waitForTimeout(800);
  await shot('03-workout-start'); await shot('03b-workout-full', true); await dump();
  await ctx.close(); })();
