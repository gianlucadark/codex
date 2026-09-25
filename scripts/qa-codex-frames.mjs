import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const out=process.env.CODEX_QA_DIR || '.astro/codex-work/frames-v3';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844],['tablet',820,1180],['wide',1920,800]]){
 const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>console.log('ERROR',e.message));
 await page.goto('http://127.0.0.1:4330/?intro=1');await page.locator('.entrance-open').focus();
 await page.locator('[data-scene="ready"]').waitFor({timeout:45000});await page.waitForTimeout(1000);
 await page.locator('.entrance-open').evaluate(el=>el.blur());
 await page.screenshot({path:`${out}/${name}-cover.png`});
 await page.clock.install();await page.clock.pauseAt(new Date());
 await page.locator('.entrance-open').evaluate(el=>{if(el instanceof HTMLButtonElement)el.click();});
 await page.waitForFunction(()=>document.querySelector('dialog').dataset.state==='playing');
 for(const time of [.5,.73,.82,.87,.93,1]){
 for(let step=0;step<200;step++) {
 const p=await page.locator('.codex-entrance').evaluate(el=>Number(el.style.getPropertyValue('--entrance-progress')));
 if(p>=time)break;
 await page.clock.runFor(80);
 }
 console.log(name,time,await page.locator('.codex-entrance').evaluate(el=>({p:el.style.getPropertyValue('--entrance-progress'),state:el.dataset.state})));
 await page.screenshot({path:`${out}/${name}-${time}.png`});
 }
 console.log(name,await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,nav:document.querySelector('[data-codex-return]').getBoundingClientRect().toJSON()})));
 await page.close();
}
await browser.close();

