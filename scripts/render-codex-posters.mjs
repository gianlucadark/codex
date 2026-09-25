import {chromium} from 'playwright';
import sharp from 'sharp';
const browser=await chromium.launch({args:['--use-angle=d3d11']});
for(const [name,width,height] of [['cover',1440,900],['cover-mobile',600,1200]]){
 const page=await browser.newPage({viewport:{width,height}});
 await page.goto('http://127.0.0.1:4330/?intro=1');
 await page.locator('.entrance-open').focus();await page.locator('[data-scene="ready"]').waitFor({timeout:45000});
 await page.waitForTimeout(1000);
 await page.addStyleTag({content:'.codex-entrance > :not(.entrance-scene) {visibility:hidden !important}'});
 const png=await page.locator('.entrance-canvas').screenshot();
 await sharp(png).webp({quality:82}).toFile(`public/codex/${name}.webp`);
 await page.close();
}
await browser.close();
