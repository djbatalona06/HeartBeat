import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const ROOT='/home/user/HeartBeat/app/dist';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{const u=new URL(req.url,'http://x');const p=join(ROOT,u.pathname==='/'?'index.html':u.pathname);
try{const b=await readFile(p);res.writeHead(200,{'content-type':T[extname(p)]??'application/octet-stream'});res.end(b);}
catch{res.writeHead(200,{'content-type':'text/html'});res.end(await readFile(join(ROOT,'index.html')));}});
await new Promise(r=>server.listen(4179,r));
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('heartbeat.mode','light');localStorage.setItem('heartbeat.theme','avatar');});
await page.goto('http://localhost:4179/#/settings',{waitUntil:'networkidle'});
await page.waitForTimeout(1200);
const headings=await page.$$eval('.set-block .section-title, .section-title',ns=>ns.map(n=>n.textContent.trim()));
const probe=await page.evaluate(()=>({
  mode:document.documentElement.dataset.mode,
  modeRow:!!document.querySelector('.mode-row'),
  modeOptions:[...document.querySelectorAll('.mode-option')].map(b=>b.textContent.trim()),
  genderRadios:document.querySelectorAll('input[name="gender"], .gender-grid button, .set-block').length>0,
  swatchBase:document.querySelector('.theme-swatch span')?.style.background||null,
}));
console.log('pageerrors:',errs.length?errs:'none');
console.log('section titles:',JSON.stringify(headings));
console.log('probe:',JSON.stringify(probe));
await page.screenshot({path:process.argv[2]+'/settings-merged.png'});
await browser.close(); server.close();
