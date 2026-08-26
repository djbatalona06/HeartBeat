// Serves the repo root the way GitHub Pages does — static files, no Jekyll —
// and checks the landing page renders and its relative links resolve.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, '.shots');
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg',
               '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain',
               '.md': 'text/markdown', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  let file = join(ROOT, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch { res.writeHead(404); return res.end('not found'); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  console.log(`\n=== ${label} ===`);
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));

  const res = await page.goto(`${base}/`, { waitUntil: 'load' });
  check('root serves 200 (front door is not a 404)', res.status() === 200, String(res.status()));
  check('titled HeartBeat', (await page.title()) === 'HeartBeat');
  check('no page errors or failed requests', errors.length === 0, errors[0]);

  // Every relative link must resolve, or the front door is decorative.
  const links = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
  const relative = links.filter((h) => !/^https?:/.test(h));
  for (const href of relative) {
    const r = await page.request.get(`${base}/${href}`);
    check(`link resolves: ${href}`, r.status() === 200, `status ${r.status()}`);
  }

  const giftLinks = relative.filter((h) => h.includes('gift/birthday.html'));
  check('the gift is linked from the front door', giftLinks.length === 1, `found ${giftLinks.length}`);

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('no horizontal overflow', !overflow);

  await page.screenshot({ path: join(SHOTS, `landing-${label}.png`), fullPage: true });
  await page.close();
}

const robots = await (await browser.newContext()).request.get(`${base}/robots.txt`);
console.log('\n=== robots.txt ===');
check('robots.txt serves', robots.status() === 200, String(robots.status()));

await browser.close();
server.close();
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'}`);
process.exit(failed === 0 ? 0 : 1);
