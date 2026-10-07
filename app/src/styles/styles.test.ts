import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../themes';
import { themeToCssVars } from '../themes/tokens';

/**
 * The guardrails a linter would give, without adding one. Each rule here is a
 * mistake the stylesheet has already made at least once.
 */

const STYLES = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(STYLES, '..');

function walk(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, keep);
    return keep(entry.name) ? [path] : [];
  });
}

const sheets = walk(STYLES, (name) => name.endsWith('.css')).map((path) => ({
  path: path.slice(STYLES.length),
  css: readFileSync(path, 'utf8'),
}));

/** Comments say things like "z-index: 5" about other rules. Rules are what count. */
const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('the stylesheet', () => {
  it('is split into partials the entry imports, in order, each once', () => {
    const entry = readFileSync(join(STYLES, 'index.css'), 'utf8');
    const imported = [...entry.matchAll(/@import '\.\/([^']+)'/g)].map((m) => m[1]);
    const onDisk = sheets.map((s) => s.path).filter((p) => p !== 'index.css').sort();
    expect([...imported].sort()).toEqual(onDisk);
    expect(new Set(imported).size).toBe(imported.length);
  });

  it('has no empty partial', () => {
    // An empty file imports cleanly and builds cleanly; the rules it was
    // meant to hold are simply gone. That happened once, to the reset.
    const empty = sheets
      .filter(({ path, css }) => path !== 'index.css' && !/\{/.test(uncommented(css)))
      .map((s) => s.path);
    expect(empty).toEqual([]);
  });

  it('reads no custom property that nothing defines', () => {
    // Defined three ways: by the theme engine, by a declaration in a sheet, or
    // by a component setting it inline (`style={{ '--sand': … }}`).
    const defined = new Set<string>();
    for (const theme of THEMES) {
      for (const mode of ['dark', 'light'] as const) {
        for (const key of Object.keys(themeToCssVars(theme, mode))) defined.add(key);
      }
    }
    for (const { css } of sheets) {
      for (const m of uncommented(css).matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
    }
    for (const file of walk(SRC, (name) => /\.tsx?$/.test(name))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/['"`](--[\w-]+)['"`]/g)) defined.add(m[1]);
    }

    const undefinedReads = sheets.flatMap(({ path, css }) =>
      [...uncommented(css).matchAll(/var\(\s*(--[\w-]+)/g)]
        .map((m) => m[1])
        .filter((name) => !defined.has(name))
        .map((name) => `${path}: ${name}`));
    expect(undefinedReads).toEqual([]);
  });

  it('stacks against the page only through the --z-* scale', () => {
    // 0–4 is local stacking inside a component (a glow under its label, a
    // badge over its tile). Anything that has to beat the tab bar or a sheet
    // names its step on the scale, so the next overlay is not `z-index: 9999`.
    const raw = sheets.flatMap(({ path, css }) =>
      [...uncommented(css).matchAll(/z-index:\s*(-?\d+)/g)]
        .filter((m) => Number(m[1]) > 4 || Number(m[1]) < 0)
        .map((m) => `${path}: z-index ${m[1]}`));
    expect(raw).toEqual([]);
  });

  it('writes no colour outside the themes, except as a var() fallback', () => {
    // A fallback paints before the tokens are applied (the boot frame, the
    // crash screen) and is the only place a literal colour belongs.
    const literals = sheets.flatMap(({ path, css }) =>
      [...uncommented(css).replace(/var\(--[\w-]+,\s*#[0-9a-f]{3,8}\)/gi, '').matchAll(/#[0-9a-f]{3,8}\b/gi)]
        .map((m) => `${path}: ${m[0]}`));
    expect(literals).toEqual([]);
  });
});
