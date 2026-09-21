// Serves the repo root the way GitHub Pages does — static files, no Jekyll —
// and checks the landing page renders and its relative links resolve.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = join(ROOT, '.shots');
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg',
               '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain',
               '.md': 'text/markdown', '.json': 'application/json' };

/**
 * The requested path, resolved inside `root` — or null if it climbed out.
 *
 * `join(root, '/../../etc/passwd')` normalises the `..` away and hands back a
 * path outside the root, so the check has to happen after resolving rather
 * than on the URL. This server only ever answers a browser this script drives
 * on a random localhost port, but a directory traversal is a directory
 * traversal, and it is two lines to not have one.
 *
 * Same shape as app/tools/visual.mjs; when one moves, the other moves with it.
 */
function resolveInside(root, urlPath) {
  const file = resolve(root, `.${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`);
  // Asked as "how do I get there from the root" rather than as a prefix
  // compare: `..` on its own is the root's parent and `../` is everything
  // above that, and a check that names only one of them lets the other past.
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith(`..${sep}`)) return null;
  return file;
}

/**
 * Read it, rather than ask whether it can be read and then read it: `stat`
 * followed by `readFile` is two answers about one file with a gap in between,
 * and the only thing the first answer was ever used for is the directory case
 * — which the read itself reports as EISDIR.
 */
async function readUnder(file) {
  try {
    return { path: file, body: await readFile(file) };
  } catch (error) {
    if (error.code !== 'EISDIR') return null;
    const index = join(file, 'index.html');
    try {
      return { path: index, body: await readFile(index) };
    } catch {
      return null;
    }
  }
}

const server = createServer(async (req, res) => {
  const file = resolveInside(ROOT, decodeURIComponent(req.url.split('?')[0]));
  const found = file && (await readUnder(file));
  if (!found) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[extname(found.path)] ?? 'application/octet-stream' });
  res.end(found.body);
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
  const relativeLinks = links.filter((h) => !/^https?:/.test(h));
  for (const href of relativeLinks) {
    const r = await page.request.get(`${base}/${href}`);
    check(`link resolves: ${href}`, r.status() === 200, `status ${r.status()}`);
  }

  const giftLinks = relativeLinks.filter((h) => h.includes('gift/birthday.html'));
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
