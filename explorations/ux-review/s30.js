const { open } = require('./lib');
(async () => { const { ctx, page, shot, dump } = await open({scheme:'light'});
  // set theme auto & kg back
  await page.goto('http://localhost:3200/#/settings'); await page.waitForTimeout(400);
  await page.click('button:has-text("Auto")'); await page.click('button:has-text("kg")'); await page.waitForTimeout(300);
  await page.goto('http://localhost:3200/'); await page.waitForTimeout(500);
  await page.click('text=Tap to resume'); await page.waitForTimeout(500);
  await shot('80-light-live');
  const c = await page.evaluate(()=>{
    const lum=(s)=>{const m=s.match(/[\d.]+/g).map(Number);const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2]);};
    const ratio=(a,b)=>{const x=lum(a),y=lum(b);return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)};
    const bgOf=(e)=>{while(e){const b=getComputedStyle(e).backgroundColor; if(b && !b.includes('rgba(0, 0, 0, 0)') && !/,\s*0\)$/.test(b)) return b; e=e.parentElement;} return 'rgb(255,255,255)';};
    const out={};
    const inp=document.querySelector('[aria-label$="weight in kg"]');
    if(inp){ const ph=getComputedStyle(inp,'::placeholder').color; out.placeholder=[ph,bgOf(inp),ratio(ph,bgOf(inp))]; }
    const hdr=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0 && e.textContent.trim()==='PREVIOUS');
    if(hdr) out.colHeader=[getComputedStyle(hdr).color,bgOf(hdr),ratio(getComputedStyle(hdr).color,bgOf(hdr))];
    const prev=document.querySelector('[aria-label="No previous set"]'); if(prev) out.prevDash=[getComputedStyle(prev).color, ratio(getComputedStyle(prev).color,bgOf(prev))];
    return out;});
  console.log(JSON.stringify(c));
  await page.click('text=Discard workout'); await page.waitForTimeout(300);
  await page.click('button:has-text("Discard"):not(:has-text("workout"))'); await page.waitForTimeout(500);
  console.log(page.url());
  const n = await page.evaluate(()=>{
    const lum=(s)=>{const m=s.match(/[\d.]+/g).map(Number);const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2]);};
    const ratio=(a,b)=>{const x=lum(a),y=lum(b);return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)};
    const b=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='History'); const cs=getComputedStyle(b);
    let e=b, bg; while(e){bg=getComputedStyle(e).backgroundColor; if(!/,\s*0\)$/.test(bg) && bg!=='rgba(0, 0, 0, 0)') break; e=e.parentElement;}
    return [cs.color,bg,ratio(cs.color,bg)];});
  console.log('nav inactive', n);
  await shot('81-light-home-after-discard');
  await ctx.close(); })();
