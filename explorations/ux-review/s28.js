const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open({viewport:{width:360,height:640}});
  const ov = async (n) => console.log(n, await page.evaluate(()=>{ const W=innerWidth; const bad=[]; document.querySelectorAll('body *').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width && r.right>W+1 && getComputedStyle(e).overflowX!=='auto') bad.push(e.tagName+'.'+e.className+' '+Math.round(r.right))}); return {sw:document.documentElement.scrollWidth, W, bad:bad.slice(0,8)}; }));
  await shot('70-small-home'); await ov('home');
  await page.click('text=Tap to resume'); await page.waitForTimeout(600);
  await shot('71-small-live'); await ov('live');
  // complete 1b to trigger rest timer
  const w = page.locator('[aria-label="Set 1 weight in lb"]').nth(1); await w.tap(); await w.fill('10');
  const r = page.locator('[aria-label="Set 1 reps"]').nth(1); await r.tap(); await r.fill('12');
  await page.locator('[aria-label="Complete set 1"]').first().tap(); await page.waitForTimeout(500);
  await shot('72-small-live-timer');
  // simulate keyboard: focus a reps input low on screen, then shrink viewport
  const r3 = page.locator('[aria-label="Set 3 reps"]').nth(1); await r3.scrollIntoViewIfNeeded(); await r3.tap();
  await page.setViewportSize({width:360, height:330}); await page.waitForTimeout(500);
  await shot('73-small-keyboard-sim');
  const box = await r3.boundingBox(); console.log('focused reps box', box);
  await page.setViewportSize({width:360, height:640});
  await page.click('[aria-label="Minimize workout"]').catch(()=>{});
  await page.goto('http://localhost:3200/#/settings'); await page.waitForTimeout(500); await shot('74-small-settings'); await ov('settings');
  await page.goto('http://localhost:3200/#/history'); await page.waitForTimeout(500); await shot('75-small-history'); await ov('history');
  await page.goto('http://localhost:3200/#/exercises/x-goblet-squat'); await page.waitForTimeout(500); await shot('76-small-exercise'); await ov('ex');
  await ctx.close(); })();
