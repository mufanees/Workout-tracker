const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open({scheme:'light'});
  await page.click('[aria-label="Settings"]'); await page.waitForTimeout(700);
  console.log(page.url());
  await shot('63-settings'); await shot('63b-settings-full', true); await dump();
  console.log(await page.innerText('body'));
  await ctx.close(); })();
