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
// Headless Chromium has no GPU here, so WebGL comes from SwiftShader. Without
// these flags the 3D passes silently fall back to the flat deck and the scene
// this file exists to check never renders at all.
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch(
  executablePath ? { executablePath, args: ARGS } : { args: ARGS }
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
  check('box visible', await vis('#crate'));

  const mode = await page.evaluate(() => ({
    canvas: !!document.querySelector('#crate canvas'),
    cards: document.querySelectorAll('#crate .flat-card').length,
    flat: !!(window.GiftCrate.ctl() && window.GiftCrate.ctl().state().flat)
  }));
  if (forceNoWebGL) {
    check('fell back to the flat deck', !mode.canvas && mode.cards === 29, JSON.stringify(mode));
  } else {
    check('WebGL canvas present', mode.canvas && !mode.flat, JSON.stringify(mode));
    check('canvas has dimensions',
      await page.evaluate(() => {
        const c = document.querySelector('#crate canvas');
        return !!c && c.width > 0 && c.height > 0;
      }));
  }
  await page.screenshot({ path: join(SHOTS, `${label}-5-box.png`) });

  // ---- flipping through the box ----
  const flipStart = await page.evaluate(() => window.GiftCrate.ctl().state().flip);
  // The 3D scene takes the drag on its canvas; the flat fallback takes it on
  // the bin, which is only part of the phase, so aim at whichever is there.
  const bin = await page.evaluate(() => {
    const n = document.querySelector('#crate .flat-bin') || document.querySelector('#crate');
    const r = n.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
  // Drag right-to-left, which is the gesture that brings the next record up.
  await page.mouse.move(bin.cx + 120, bin.cy);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(bin.cx + 120 - k * 26, bin.cy);
  await page.mouse.up();
  await page.waitForTimeout(700);
  const flipEnd = await page.evaluate(() => window.GiftCrate.ctl().state().flip);
  check('dragging flips through the box', flipEnd > flipStart, `${flipStart} -> ${flipEnd}`);
  await page.screenshot({ path: join(SHOTS, `${label}-5b-flip.png`) });

  // ---- putting one on the platter ----
  await page.evaluate(() => window.GiftCrate.ctl().play(4));
  await page.waitForTimeout(1500);
  const seated = await page.evaluate(() => window.GiftCrate.ctl().state());
  check('a record is on the platter', seated.seated === 4 && seated.playing, JSON.stringify(seated));
  await page.screenshot({ path: join(SHOTS, `${label}-5c-playing.png`) });

  // The platter has to actually turn. Sample the angle across two moments
  // rather than trusting the flag that says it is playing.
  if (!forceNoWebGL) {
    const a1 = await page.evaluate(() => window.GiftCrate.ctl().state().platter);
    await page.waitForTimeout(500);
    const a2 = await page.evaluate(() => window.GiftCrate.ctl().state().platter);
    check('the platter is turning', a2 > a1 + 0.2, `${a1.toFixed(3)} -> ${a2.toFixed(3)}`);
  } else {
    check('the flat platter is animating',
      await page.$eval('#flatDisc', (n) => getComputedStyle(n).animationName === 'spin33'));
  }

  // ---- tapping the playing record opens it ----
  if (forceNoWebGL) {
    // The disc is mid-spin, so Playwright's actionability check never settles
    // on it. Dispatch the click instead — the same listener, same event.
    await page.evaluate(() => document.getElementById('flatDisc').click());
  } else {
    // Tap where the record actually is on screen. The container centre sits
    // between the box and the deck and hits neither.
    const at = await page.evaluate(() => window.GiftCrate.ctl().seatScreen());
    check('the seated record projects on screen', !!at, JSON.stringify(at));
    if (at) await page.mouse.click(at.x, at.y);
  }
  await page.waitForTimeout(600);
  const inspecting = await page.$eval('#inspect', (n) => n.classList.contains('on'));
  check('tapping the playing record opens it full screen', inspecting);
  if (inspecting) {
    check('inspect shows a real photo',
      await page.$eval('#inspectImg', (i) => i.naturalWidth > 100 && i.src.startsWith('data:image/jpeg')));
    await page.screenshot({ path: join(SHOTS, `${label}-5d-inspect.png`) });
    await page.click('#inspect');
    await page.waitForTimeout(400);
  }

  // ---- the finale ----
  await page.evaluate(() => window.GiftCrate.ctl().heart());
  await page.waitForTimeout(2600);
  const heart = await page.evaluate(() => window.GiftCrate.ctl().state());
  check('the heart forms', heart.mode === 'heart', JSON.stringify(heart));
  // Not just the flag: every record has to be at its place in the heart. The
  // flat build once reported a finale it was not drawing.
  check('all 29 records reach the heart', heart.atHome === 29, `${heart.atHome}/29`);
  check('nothing is left on the platter', heart.seated === -1 && !heart.playing);
  await page.screenshot({ path: join(SHOTS, `${label}-5e-heart.png`) });

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
