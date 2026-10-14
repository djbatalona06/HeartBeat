import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The landscape tab rail is CSS, and CSS has no compiler to say it is in step with
 * itself. These read the sheets and hold the few facts it depends on, each of which
 * was a way for it to quietly not work: the wide-screen rule that also matches a
 * phone on its side, the inline `--tabbar-h` that only `!important` can beat, and a
 * shell and menu button that forgot the rail was there.
 */
const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const chrome = read('./legacy/05-chrome.css');
const base = read('./legacy/01-base.css');
const garden = read('./legacy/34-engine-garden.css');

const SHORT_LANDSCAPE = '(orientation: landscape) and (max-height: 520px)';

describe('the landscape rail', () => {
  it('uses one definition of "a phone on its side" in the rail and in the garden', () => {
    expect(chrome).toContain(`@media ${SHORT_LANDSCAPE}`);
    expect(garden).toContain(`@media ${SHORT_LANDSCAPE}`);
  });

  it('comes after the wide-screen rule, so at equal strength the rail is the one that wins', () => {
    const wide = chrome.indexOf('@media (min-width: 640px) {\n  :root { --tabbar-h: 68px !important; }');
    const rail = chrome.indexOf(`@media ${SHORT_LANDSCAPE} {\n  :root { --tabbar-h: 0px !important;`);
    expect(wide).toBeGreaterThan(-1);
    expect(rail).toBeGreaterThan(wide);
  });

  it('is zero everywhere else, so nothing moves when the phone is upright', () => {
    expect(chrome).toMatch(/:root \{ --rail-w: 0px; \}/);
    expect(chrome).toMatch(/--tabbar-h: 0px !important; --rail-w: 72px;/);
  });

  it('moves the shell and the menu button in by the rail, so nothing sits under it', () => {
    expect(base).toMatch(/\.shell \{[\s\S]*?var\(--rail-w\)[\s\S]*?\}/);
    expect(chrome).toMatch(/\.menu-button \{[\s\S]*?var\(--rail-w\)[\s\S]*?\}/);
  });

  it('leaves the top of the rail for the menu button, which is its first row', () => {
    expect(chrome).toMatch(/\.menu-button \{[\s\S]*?max\(var\(--space-2\), \(var\(--rail-w\) - var\(--tap\)\) \/ 2\)/);
    expect(chrome).toMatch(/padding-block: calc\(env\(safe-area-inset-top\) \+ var\(--space-2\) \+ var\(--tap\) \+ var\(--space-2\)\)/);
  });

  it('keeps all six tabs on the rail with room for a tap each', () => {
    const rail = chrome.slice(chrome.indexOf(`@media ${SHORT_LANDSCAPE} {\n  :root { --tabbar-h: 0px`));
    expect(rail).toContain('grid-template-rows: repeat(6, minmax(0, 1fr));');
    // The menu button takes the first row: 48px plus its two gaps. Six 48px tabs after it
    // are 288px more, and 56 + 288 = 344 fits the 354px the shortest iPhone leaves.
    expect(56 + 6 * 48).toBeLessThanOrEqual(354);
  });
});
