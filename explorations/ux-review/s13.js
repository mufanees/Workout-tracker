const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open();
  await page.click('text=Tap to resume').catch(()=>{}); await page.waitForTimeout(600);
  const plan = { 'Close-Grip Push-Up': [null, '10'], 'Glute Bridge': ['14', '15'], 'Dead Bug': [null, '8'], 'Prone Y-T Raise': [null, '8'], 'Lateral Raise': ['4','12'] };
  for (const [name, [w, r]] of Object.entries(plan)) {
    for (let k = 0; k < 4; k++) {
      // find row = parent of first incomplete "Complete set" button in this exercise's card
      const handle = await page.evaluateHandle((name) => {
        const opt = document.querySelector(`[aria-label="Options for ${name}"]`);
        let card = opt; while (card && !card.querySelector('[aria-label$=" reps"]')) card = card.parentElement;
        const btn = card && card.querySelector('[aria-label^="Complete set"]');
        if (!btn) return null;
        let row = btn.parentElement; while (!row.querySelector('[aria-label$=" reps"]')) row = row.parentElement;
        return row;
      }, name);
      const row = handle.asElement(); if (!row) break;
      if (w) { const wi = await row.$('[aria-label$="weight in kg"]'); await wi.tap(); await wi.fill(w); }
      const ri = await row.$('[aria-label$=" reps"]'); await ri.tap(); await ri.fill(r);
      const b = await row.$('[aria-label^="Complete set"]'); await b.tap(); await page.waitForTimeout(200);
    }
    console.log('done', name);
  }
  await shot('28-logged');
  await page.evaluate(()=>window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(300);
  await shot('28b-logged-bottom');
  await ctx.close(); })();
