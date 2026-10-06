const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  await page.click('text=Tap to resume').catch(()=>{}); await page.waitForTimeout(600);
  const vals = { 'Close-Grip Push-Up': ['', '10'], 'Glute Bridge': ['14', '15'], 'Dead Bug': ['', '8'], 'Prone Y-T Raise': ['', '8'], 'Lateral Raise': ['4','12'] };
  for (const [name, [w, r]] of Object.entries(vals)) {
    const card = page.locator('section, article, div').filter({ has: page.locator(`[aria-label="Options for ${name}"]`) }).last();
    const n = await card.locator('[aria-label$=" reps"]').count();
    for (let i = 0; i < n; i++) {
      if (w) { const wi = card.locator('[aria-label$="weight in kg"]').nth(i); await wi.tap(); await wi.fill(w); }
      const ri = card.locator('[aria-label$=" reps"]').nth(i); await ri.tap(); await ri.fill(r);
      const b = card.locator('[aria-label^="Complete set"]').first();
      await b.tap(); await page.waitForTimeout(150);
    }
    console.log(name, n);
  }
  await page.waitForTimeout(400);
  await shot('26-mid-log');
  await page.click('text=Finish'); await page.waitForTimeout(700);
  await shot('27-finish-dialog');
  console.log(await page.innerText('body').then(t=>t.slice(-600)));
  await ctx.close(); })();
