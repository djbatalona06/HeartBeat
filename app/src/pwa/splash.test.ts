import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The launch images and the tags that name them are written together by
 * `tools/splash.mjs`. A hand edit to either side breaks the pairing silently:
 * iOS just shows white again. These hold them in step.
 */
const APP = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(`${APP}index.html`, 'utf8');
const tags = [...html.matchAll(/<link rel="apple-touch-startup-image" href="([^"]+)" media="([^"]+)"/g)];

describe('iOS launch images', () => {
  it('names a file that exists, for every tag', () => {
    expect(tags.length).toBeGreaterThan(0);
    for (const [, href] of tags) expect(existsSync(`${APP}public/${href}`), href).toBe(true);
  });

  it('leaves no image on disk that no tag names', () => {
    const named = new Set(tags.map(([, href]) => href.replace('splash/', '')));
    expect(readdirSync(`${APP}public/splash`).filter((f) => !named.has(f))).toEqual([]);
  });

  it('gives every screen exactly one image', () => {
    const media = tags.map(([, , m]) => m);
    expect(new Set(media).size).toBe(media.length);
  });

  it('points the home-screen icon at the 180px file', () => {
    expect(html).toContain('<link rel="apple-touch-icon" href="icons/apple-touch-icon-180.png" />');
  });
});
