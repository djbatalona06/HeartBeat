import { PALETTE_KEYS, SPRITES, SPRITE_SIZE, type PaletteKey, type Sprite } from '../../../domain/rpg/sprites';

/**
 * Sprites, painted at runtime in the colours the app is currently wearing.
 *
 * This is the step that earns `sprites.ts` being text instead of a PNG. Each
 * palette character names a *role*, and the role is resolved here against the
 * live CSS custom properties on the host element — the same three
 * `dyeStyle()` sets and the same ones every mascot in `features/pet/mascots/`
 * paints in. So a dye bought in the shop recolours the bird walking in the
 * garden, and the five theme packs keep working, with no plumbing on either
 * side. A spritesheet would have been one fixed palette forever.
 *
 * Called once per scene boot. Fourteen 16x16 grids is 3,584 `fillRect` calls of
 * one pixel each, which is under a millisecond and happens while the canvas is
 * still empty.
 */

/** Which custom property each palette role reads, and what to use if it is unset. */
const ROLE_VARS: Record<Exclude<PaletteKey, '.'>, { varName: string; fallback: string }> = {
  o: { varName: '--color-text', fallback: '#fff3f7' },
  m: { varName: '--color-text-muted', fallback: '#c9a3b4' },
  l: { varName: '--color-surface', fallback: '#3d1a2b' },
  a: { varName: '--color-accent', fallback: '#ff8fb1' },
};

export type Palette = Record<PaletteKey, string | null>;

/**
 * Read the palette off an element.
 *
 * `getComputedStyle` rather than the inline style, so a dye applied to an
 * ancestor is picked up — which is how `dyeStyle()` is actually used (it goes on
 * a wrapper, not on the thing being drawn).
 */
export function paletteFrom(host: Element): Palette {
  const style = getComputedStyle(host);
  const palette = { '.': null } as Palette;
  for (const key of PALETTE_KEYS) {
    if (key === '.') continue;
    const role = ROLE_VARS[key];
    palette[key] = style.getPropertyValue(role.varName).trim() || role.fallback;
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
  const palette = paletteFrom(host);
  const baked = new Map<string, HTMLCanvasElement>();
  for (const [key, sprite] of Object.entries(SPRITES)) {
    baked.set(key, drawSprite(sprite, palette, scale));
  }
  return baked;
}
