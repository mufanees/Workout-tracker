const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open({viewport:{width:360,height:640}});
  await page.evaluate(()=>window.scrollTo(0, 99999)); await page.waitForTimeout(300);
  await shot('77-small-home-bottom');
  await page.click('text=Tap to resume'); await page.waitForTimeout(500);
  await page.evaluate(()=>window.scrollTo(0, 99999)); await page.waitForTimeout(300);
  await shot('78-small-live-bottom-timer');
  // discard flow
  await page.click('text=Discard workout'); await page.waitForTimeout(400);
  await shot('79-discard-confirm');
  console.log(await page.evaluate(()=>[...document.querySelectorAll('[role=dialog], dialog, [role=alertdialog]')].map(e=>e.innerText).join('\n---\n')));
  await ctx.close(); })();
