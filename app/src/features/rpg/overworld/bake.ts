import { PALETTE_KEYS, SPRITES, SPRITE_SIZE, type PaletteKey, type Sprite } from '../../../domain/rpg/sprites';
import { paletteFrom, type SpritePalette } from '../../../domain/rpg/palette';

/**
 * Sprites, painted at runtime in the colours the app is currently wearing.
 *
 * This is the step that earns `sprites.ts` being text instead of a PNG. Each
 * palette character names a *role*, and the role is resolved here against the
 * live CSS custom properties on the host element, so the five theme packs
 * recolour the garden with no plumbing of their own. A spritesheet would have
 * been one fixed palette forever.
 *
 * `accent` reads `--color-accent`, which is exactly the property `dyeStyle()`
 * overrides — but nothing today applies `dyeStyle(avatar.dye)` to the
 * overworld's host element, so a purchased dye does not yet reach the garden.
 * Wiring that is a one-line change in `OverworldPage.tsx` and is left for
 * whoever adds it, rather than folded into this fix.
 *
 * The four roles used to read four different tokens straight off the host —
 * `--color-text`, `--color-text-muted`, `--color-surface`, `--color-accent` —
 * on the assumption that those held a fixed lightness ordering. They do not:
 * `--color-text` and `--color-surface` swap which one is lighter between a
 * pack's dark and light variant, because the app itself always wants light ink
 * on a dark surface or the reverse. The garden inherited that inversion —
 * the path rendered darker than the grass, and the pond rendered as a solid
 * accent block — on every pack's default (dark) variant. `domain/rpg/palette.ts`
 * fixes it by deriving all four roles from the two tokens that are solid and
 * hold their ordering in every pack: `--color-base` and `--color-accent`. See
 * that module's header for the reasoning; this file only reads the two inputs
 * off the DOM and hands them over, which is the pure/impure split the rest of
 * this app already draws (`domain/sync/holdings.ts` vs `pwa/holdingsSync.ts`).
 *
 * Called once per scene boot. Fourteen 16x16 grids is 3,584 `fillRect` calls of
 * one pixel each, which is under a millisecond and happens while the canvas is
 * still empty.
 */

export type Palette = Record<PaletteKey, string | null>;

const ROLE_OF: Record<Exclude<PaletteKey, '.'>, keyof SpritePalette> = {
  o: 'outline',
  m: 'mid',
  l: 'light',
  a: 'accent',
};

/**
 * Read the two inputs off an element and derive the four sprite roles.
 *
 * `getComputedStyle` rather than the inline style, so a dye applied to an
 * ancestor is picked up — which is how `dyeStyle()` is actually used (it goes
 * on a wrapper, not on the thing being drawn).
 */
export function readPalette(host: Element): Palette {
  const style = getComputedStyle(host);
  const base = style.getPropertyValue('--color-base').trim();
  const accent = style.getPropertyValue('--color-accent').trim();
  const derived = paletteFrom(base, accent);

  const palette = { '.': null } as Palette;
  for (const key of PALETTE_KEYS) {
    if (key === '.') continue;
    palette[key] = derived[ROLE_OF[key]];
  }
  return palette;
}

/** One sprite onto a fresh canvas, one rect per pixel. Transparent stays empty. */
export function drawSprite(sprite: Sprite, palette: Palette, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE * scale;
  canvas.height = SPRITE_SIZE * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  for (const [y, row] of sprite.entries()) {
    for (const [x, char] of [...row].entries()) {
      const colour = palette[char as PaletteKey];
      if (!colour) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvas;
}

/** What a Phaser scene needs: a canvas per sprite key, ready to register. */
export function bakeAll(host: Element, scale = 1): Map<string, HTMLCanvasElement> {
  const palette = readPalette(host);
  const baked = new Map<string, HTMLCanvasElement>();
  for (const [key, sprite] of Object.entries(SPRITES)) {
    baked.set(key, drawSprite(sprite, palette, scale));
  }
  return baked;
}
