const { open } = require('./lib');
(async () => { const { ctx, page } = await open({scheme:'dark'});
  await page.click('[aria-label="Start Phase 1 · Workout B"]'); await page.waitForTimeout(800);
  const r = await page.evaluate(()=>{
    const cv=document.createElement('canvas').getContext('2d');
    const rgb=(s)=>{cv.fillStyle='#000';cv.fillStyle=s;cv.fillRect(0,0,1,1);const d=cv.getImageData(0,0,1,1).data;return [d[0],d[1],d[2]]};
    const lum=(m)=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2]);};
    const ratio=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return +((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)};
    const bgOf=(e)=>{while(e){const b=getComputedStyle(e).backgroundColor; if(rgb(b).join()!=='0,0,0' || !/0\)$|\/ 0\)$/.test(b)) { if(!/rgba\(0, 0, 0, 0\)/.test(b)) return b;} e=e.parentElement;} return getComputedStyle(document.body).backgroundColor;};
    const o={};
    const inp=document.querySelector('[aria-label$="weight in kg"]'); const ph=getComputedStyle(inp,'::placeholder').color; o.ghost=[ph,bgOf(inp),ratio(ph,bgOf(inp))];
    const hdr=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0 && e.textContent.trim()==='PREVIOUS'); o.hdr=[getComputedStyle(hdr).color,bgOf(hdr),ratio(getComputedStyle(hdr).color,bgOf(hdr))];
    return o;});
  console.log(JSON.stringify(r));
  await page.click('text=Discard workout'); await page.waitForTimeout(300);
  await page.locator('button', {hasText: /^Discard$/}).click(); await page.waitForTimeout(400);
  const n = await page.evaluate(()=>{
    const cv=document.createElement('canvas').getContext('2d');
    const rgb=(s)=>{cv.fillStyle='#000';cv.fillStyle=s;cv.fillRect(0,0,1,1);const d=cv.getImageData(0,0,1,1).data;return [d[0],d[1],d[2]]};
    const lum=(m)=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2]);};
    const b=[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='History'); const c=getComputedStyle(b).color; const bg=getComputedStyle(document.body).backgroundColor;
    const x=lum(rgb(c)),y=lum(rgb(bg)); return [c,bg,((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)).toFixed(2)];});
  console.log('nav', n);
  await ctx.close(); })();
