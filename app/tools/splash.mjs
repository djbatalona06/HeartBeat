/**
 * Writes the iOS launch images, the 180px home-screen icon and the
 * notification badge, and points `index.html` at the launch images.
 *
 *   npm run splash --workspace app      # (re)writes every file below
 *
 * - `public/splash/*.png` — one per iPhone/iPad screen. iOS shows nothing but
 *   white between the tap on the icon and the first paint unless the page names
 *   an `apple-touch-startup-image` whose `media` matches the device exactly.
 *   Each is the boot screen in `index.html` drawn as a picture: the same ground,
 *   the same heart, the same 72px box in the middle, so the hand-off from image
 *   to page does not jump.
 * - `public/icons/apple-touch-icon-180.png` — iOS's home-screen size. It was
 *   handed the 192px icon and scaled it down itself, which is the softness.
 *   Resampled here from the 512px icon, which is already opaque (iOS fills
 *   transparency with black).
 * - `public/icons/badge-96.png` — the heart alone, white on transparent, for
 *   the Android status bar, which draws a badge as a silhouette of its alpha.
 *
 * No dependencies, like `garden-glb.mjs`: PNG in and out is a page of `zlib`,
 * and the heart is three cubics. Deterministic, so a change shows up in review.
 * The launch images are kept out of the precache (`globIgnores`): iOS fetches
 * them once, at install, and no phone needs them offline.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = resolve(APP, 'public');

// The boot screen's own literals (index.html). Change them together.
const GROUND = [0x2a, 0x0f, 0x1c];
const HEART = [0xff, 0x8f, 0xb0];
const MARK_CSS_PX = 72;

/** CSS width × height and pixel ratio, portrait. Landscape is added for iPads. */
const IPHONES = [
  [440, 956, 3], [420, 912, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3],
  [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2],
  [375, 667, 2],
];
const IPADS = [
  [1032, 1376, 2], [1024, 1366, 2], [834, 1210, 2], [834, 1194, 2],
  [820, 1180, 2], [810, 1080, 2], [744, 1133, 2], [768, 1024, 2],
];

// ---- the heart ----------------------------------------------------------------
// `M50 88C20 62 22 36 42 34c8-1 8 8 8 14 0-6 0-15 8-14 20 2 22 28-8 54z` in a
// 100×100 box, with the relative curves resolved to absolute points.
const CUBICS = [
  [[50, 88], [20, 62], [22, 36], [42, 34]],
  [[42, 34], [50, 33], [50, 42], [50, 48]],
  [[50, 48], [50, 42], [50, 33], [58, 34]],
  [[58, 34], [78, 36], [80, 62], [50, 88]],
];

const POLYGON = CUBICS.flatMap(([a, b, c, d]) => Array.from({ length: 48 }, (_, i) => {
  const t = i / 48;
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
}));

function inside(x, y) {
  let hit = false;
  for (let i = 0, j = POLYGON.length - 1; i < POLYGON.length; j = i++) {
    const [xi, yi] = POLYGON[i];
    const [xj, yj] = POLYGON[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Coverage 0..1 of the heart over a `size`-px square, 4×4 supersampled.
 *  The square shows `span` units of the 100-unit box from (`x0`, `y0`). */
function heartCoverage(size, x0 = 0, y0 = 0, span = 100) {
  const out = new Float32Array(size * size);
  const s = span / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) n += inside(x0 + (x + (sx + 0.5) / 4) * s, y0 + (y + (sy + 0.5) / 4) * s);
      }
      out[y * size + x] = n / 16;
    }
  }
  return out;
}

// ---- PNG ---------------------------------------------------------------------
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

/** rows: Buffer per scanline, already packed for `colorType`/`bitDepth`. */
function encodePng(width, height, colorType, bitDepth, rows, palette) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  const raw = Buffer.concat(rows.flatMap((row) => [Buffer.from([0]), row]));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(palette ? [chunk('PLTE', palette)] : []),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 8-bit RGBA, non-interlaced — which is what every icon in public/ is. */
function decodeRgba(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (buf[24] !== 8 || buf[25] !== 6 || buf[28] !== 0) throw new Error('expected 8-bit RGBA, non-interlaced');
  const idat = [];
  for (let at = 8; at < buf.length;) {
    const len = buf.readUInt32BE(at);
    if (buf.toString('ascii', at + 4, at + 8) === 'IDAT') idat.push(buf.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][type];
      px[y * stride + x] = (v + pred) & 0xff;
    }
  }
  return { width, height, px };
}

/** Area-average downscale, the honest way to shrink flat shapes. */
function downscale({ width, height, px }, size) {
  const out = Buffer.alloc(size * size * 4);
  const s = width / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      let area = 0;
      for (let sy = Math.floor(y * s); sy < Math.ceil((y + 1) * s); sy++) {
        const wy = Math.min(sy + 1, (y + 1) * s) - Math.max(sy, y * s);
        for (let sx = Math.floor(x * s); sx < Math.ceil((x + 1) * s); sx++) {
          const w = wy * (Math.min(sx + 1, (x + 1) * s) - Math.max(sx, x * s));
          for (let k = 0; k < 4; k++) acc[k] += px[(sy * width + sx) * 4 + k] * w;
          area += w;
        }
      }
      for (let k = 0; k < 4; k++) out[(y * size + x) * 4 + k] = Math.round(acc[k] / area);
    }
  }
  return out;
}

// ---- the files ---------------------------------------------------------------
const LEVELS = 16;
const PALETTE = Buffer.from(Array.from({ length: LEVELS }, (_, i) => GROUND.map((g, k) => Math.round(g + (HEART[k] - g) * (i / (LEVELS - 1))))).flat());

/** One coverage map per pixel ratio; there are only two, and each is slow. */
const COVER = new Map();

/** The boot screen at `w`×`h` device px: 4-bit indexed, ground to heart. */
function splash(w, h, ratio) {
  const mark = MARK_CSS_PX * ratio;
  if (!COVER.has(mark)) COVER.set(mark, heartCoverage(mark));
  const cover = COVER.get(mark);
  const left = Math.round((w - mark) / 2);
  const top = Math.round((h - mark) / 2);
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(Math.ceil(w / 2));
    if (y >= top && y < top + mark) {
      for (let x = left; x < left + mark; x++) {
        const level = Math.round(cover[(y - top) * mark + (x - left)] * (LEVELS - 1));
        row[x >> 1] |= x & 1 ? level : level << 4;
      }
    }
    rows.push(row);
  }
  return encodePng(w, h, 3, 4, rows, PALETTE);
}

/** Cropped to the heart (it spans x 20–80, y 33–88 of its box) so it fills
 *  the status bar's small square instead of floating in it. */
function badge(size) {
  const cover = heartCoverage(size, 16, 26.5, 68);
  const rows = Array.from({ length: size }, (_, y) => Buffer.from(Array.from({ length: size }, (_, x) => [255, 255, 255, Math.round(cover[y * size + x] * 255)]).flat()));
  return encodePng(size, size, 6, 8, rows);
}

const screens = [
  ...IPHONES.map(([w, h, r]) => ({ w, h, r, orientation: 'portrait' })),
  ...IPADS.flatMap(([w, h, r]) => [
    { w, h, r, orientation: 'portrait' },
    { w: h, h: w, r, orientation: 'landscape' },
  ]),
];

const SPLASH = resolve(PUBLIC, 'splash');
rmSync(SPLASH, { recursive: true, force: true });
mkdirSync(SPLASH, { recursive: true });

const tags = screens.map(({ w, h, r, orientation }) => {
  const name = `splash-${w * r}x${h * r}.png`;
  writeFileSync(resolve(SPLASH, name), splash(w * r, h * r, r));
  // device-width/height are the portrait numbers whichever way it is held.
  const [dw, dh] = orientation === 'portrait' ? [w, h] : [h, w];
  return `    <link rel="apple-touch-startup-image" href="splash/${name}" media="(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: ${orientation})" />`;
});

const icon = decodeRgba(readFileSync(resolve(PUBLIC, 'icons/icon-512.png')));
const small = downscale(icon, 180);
writeFileSync(
  resolve(PUBLIC, 'icons/apple-touch-icon-180.png'),
  encodePng(180, 180, 6, 8, Array.from({ length: 180 }, (_, y) => small.subarray(y * 720, (y + 1) * 720))),
);
writeFileSync(resolve(PUBLIC, 'icons/badge-96.png'), badge(96));

const HTML = resolve(APP, 'index.html');
const START = '<!-- splash:start';
const END = '<!-- splash:end -->';
const html = readFileSync(HTML, 'utf8');
const from = html.indexOf(START);
const to = html.indexOf(END);
if (from < 0 || to < 0) throw new Error(`index.html needs the ${START} … ${END} markers`);
const head = html.slice(0, html.indexOf('\n', from) + 1);
writeFileSync(HTML, `${head}${tags.join('\n')}\n    ${html.slice(to)}`);

console.log(`wrote ${readdirSync(SPLASH).length} launch images, the 180px icon and the badge`);
