const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open({scheme:'light'});
  await shot('50-light-home');
  await page.click('text=New'); await page.waitForTimeout(700);
  console.log(page.url());
  await shot('51-light-new-routine'); await dump();
  await ctx.close(); })();
