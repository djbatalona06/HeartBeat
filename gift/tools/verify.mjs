// Walks the finished gift the way she will: over file://, tapping through every
// phase, screenshotting each one. Fails loudly on any console error.
//
// Usage: node gift/tools/verify.mjs [--shots <dir>]

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = pathToFileURL(join(HERE, '..', 'birthday.html')).href;
const shotArg = process.argv.indexOf('--shots');
const SHOTS = shotArg > -1 ? process.argv[shotArg + 1] : join(HERE, '..', '..', '.shots');
mkdirSync(SHOTS, { recursive: true });

const problems = [];
let failed = 0;

function check(name, cond, detail) {
  if (cond) { console.log(`  ok   ${name}`); }
  else { console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

// The sandbox ships a fixed Chromium build that will not always match the
// playwright package's expected revision, so point at it explicitly rather
// than letting playwright resolve a version-stamped path it cannot find.
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome'
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
const browser = await chromium.launch(
  executablePath ? { executablePath, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] }
);

async function run(label, viewport, forceNoWebGL) {
  console.log(`\n=== ${label} ===`);
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });

  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${label}] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));

  if (forceNoWebGL) {
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (String(type).indexOf('webgl') === 0) return null;
        return real.call(this, type, ...rest);
      };
    });
  }

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const vis = (id) => page.$eval(id, (n) => !n.hidden);

  check('gate visible', await vis('#gate'));
  check('29 photos inlined', (await page.evaluate(() => window.GIFT_PHOTOS.length)) === 29);
  check('photos are data URIs', await page.evaluate(() => window.GIFT_PHOTOS.every((s) => s.startsWith('data:image/jpeg;base64,'))));
  await page.screenshot({ path: join(SHOTS, `${label}-1-gate.png`) });

  await page.click('#gate');
  await page.waitForTimeout(600);
  check('intro visible', await vis('#intro'));
  await page.screenshot({ path: join(SHOTS, `${label}-2-intro.png`) });

  // Skip the intro rather than waiting out its 11s.
  await page.click('#intro');
  // Long enough for the seal's 400ms-delayed stamp animation to land, or the
  // screenshot catches it mid-scale and looks like a rendering bug.
  await page.waitForTimeout(1500);
  check('envelope visible', await vis('#envelope'));
  await page.screenshot({ path: join(SHOTS, `${label}-3-envelope.png`) });

  await page.click('#env');
  await page.waitForTimeout(1000);
  check('letter visible', await vis('#letter'));

  const ornaments = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#borderLayer .orn')];
    return { total: all.length, bows: all.filter((o) => o.innerHTML.includes('#bow')).length };
  });
  check('46 border ornaments', ornaments.total === 46, `got ${ornaments.total}`);
  check('exactly 20 bows', ornaments.bows === 20, `got ${ornaments.bows}`);

  // Every line must have a steps() count equal to its own character count.
  const timing = await page.evaluate(() => {
    return [...document.querySelectorAll('#paper .wipe')].map((n) => {
      const m = /steps\((\d+)/.exec(n.style.transition || '');
      return { len: n.textContent.trim().length, steps: m ? +m[1] : null };
    });
  });
  check('typewriter lines present', timing.length >= 8, `got ${timing.length}`);
  check('steps() matches char count on every line',
    timing.every((t) => t.steps === t.len),
    JSON.stringify(timing.filter((t) => t.steps !== t.len).slice(0, 3)));

  // Tapping mid-reveal must land every line on its final value, not just
  // shorten the wait. This regressed once already.
  await page.click('#letter');
  await page.waitForTimeout(500);
  const clipped = () => page.evaluate(() =>
    [...document.querySelectorAll('#paper .wipe')]
      .map((n) => getComputedStyle(n).clipPath)
      .filter((c) => c && c !== 'none' && !/inset\(0(px)? 0%/.test(c)).length);
  check('tap-to-skip completes every line', (await clipped()) === 0, `${await clipped()} still clipped`);
  await page.screenshot({ path: join(SHOTS, `${label}-4-letter.png`), fullPage: false });

  check('continue button revealed after skip',
    await page.$eval('.letter-next', (b) => b.style.opacity === '1' && b.style.pointerEvents === 'auto'));

  await page.click('.letter-next');
  await page.waitForTimeout(1400);
  check('crate visible', await vis('#crate'));

  const mode = await page.evaluate(() => ({
    canvas: !!document.querySelector('#crate canvas'),
    cells: document.querySelectorAll('#crate img').length
  }));
  if (forceNoWebGL) {
    check('fell back to 2D mosaic', !mode.canvas && mode.cells > 20, JSON.stringify(mode));
  } else {
    check('WebGL canvas present', mode.canvas, JSON.stringify(mode));
    const meshes = await page.evaluate(() => {
      const c = document.querySelector('#crate canvas');
      return c ? c.width > 0 && c.height > 0 : false;
    });
    check('canvas has dimensions', meshes);
  }
  await page.screenshot({ path: join(SHOTS, `${label}-5-crate.png`) });

  // Pull a record: tap once to have her lift it out, tap again to open it.
  if (forceNoWebGL) {
    // The mosaic is real DOM, so click a tile directly — coordinates picked off
    // the container centre land in the mask's gaps as often as not.
    await page.click('#crate img');
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(SHOTS, `${label}-5b-pull.png`) });
  } else {
    const box = await page.$eval('#crate', (n) => {
      const r = n.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    await page.mouse.click(box.cx, box.cy - 20);
    await page.waitForTimeout(1600);
    await page.screenshot({ path: join(SHOTS, `${label}-5b-pull.png`) });
    await page.mouse.click(box.cx, box.cy);
    await page.waitForTimeout(700);
  }
  const inspecting = await page.$eval('#inspect', (n) => n.classList.contains('on'));
  check('tapping a photo opens it full screen', inspecting);
  if (inspecting) {
    check('inspect shows a real photo',
      await page.$eval('#inspectImg', (i) => i.naturalWidth > 100 && i.src.startsWith('data:image/jpeg')));
    await page.screenshot({ path: join(SHOTS, `${label}-5c-inspect.png`) });
    await page.click('#inspect');
    await page.waitForTimeout(400);
  }

  await page.click('#crate .letter-next');
  await page.waitForTimeout(500);
  check('guide visible', await vis('#guide'));
  const href = await page.$eval('#repoLink', (a) => a.getAttribute('href'));
  check('links to HeartBeat repo', href === 'https://github.com/djbatalona06/HeartBeat', href);
  await page.screenshot({ path: join(SHOTS, `${label}-6-guide.png`) });

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('no horizontal overflow', !overflow);

  await page.close();
}

// A real, unskipped reveal — sped up, but running the same code path she will.
async function naturalReveal() {
  console.log('\n=== natural reveal (unskipped) ===');
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => problems.push(`[natural] pageerror: ${e.message}`));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.evaluate(() => window.GIFT.setPace(1, 4));
  await page.click('#gate');
  await page.click('#intro');
  await page.waitForTimeout(300);
  await page.click('#env');
  await page.waitForTimeout(2500);
  const left = await page.evaluate(() =>
    [...document.querySelectorAll('#paper .wipe')]
      .map((n) => getComputedStyle(n).clipPath)
      .filter((c) => c && c !== 'none' && !/inset\(0(px)? 0%/.test(c)).length);
  check('every line finishes on its own', left === 0, `${left} still clipped`);
  check('continue button appears unprompted',
    await page.$eval('.letter-next', (b) => b.style.opacity === '1'));
  await page.screenshot({ path: join(SHOTS, 'natural-letter.png') });
  await page.close();
}

await run('desktop', { width: 1280, height: 800 }, false);
await run('iphone', { width: 390, height: 844 }, false);
await run('nowebgl', { width: 1280, height: 800 }, true);
await naturalReveal();

await browser.close();

console.log('\n=== console errors ===');
if (problems.length) { problems.forEach((p) => console.log('  ' + p)); failed += problems.length; }
else console.log('  none');

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL (' + failed + ')'}  ·  screenshots in ${SHOTS}`);
process.exit(failed === 0 ? 0 : 1);
