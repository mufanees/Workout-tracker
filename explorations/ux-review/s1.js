const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  await shot('01-first-launch-dark'); await shot('01b-first-launch-full', true); await dump();
  console.log((await page.innerText('body')).slice(0,2000));
  await ctx.close(); })();
