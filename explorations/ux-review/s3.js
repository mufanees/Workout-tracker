const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  // is there an active workout already? 
  console.log((await page.innerText('body')).slice(0,300));
  await shot('04-home-with-active');
  await ctx.close(); })();
