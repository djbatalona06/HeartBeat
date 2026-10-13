import { ARENA_HEIGHT, ARENA_WIDTH } from '../../domain/rpg/arena';
import { kitMarkOf, type BoardKitId } from '../../domain/rpg/boards';
import { arenaPaint, type ArenaCssTokens } from '../pet/mascots/3d/arenaPalette';
import { finishArenaCanvas, rgbHex, rgbTokens } from '../pet/mascots/3d/arenaFinish';

/**
 * A static, theme-aware checker floor for calm, Save-Data, or a failed 3D bake.
 * The pixel dimensions still map one-for-one to the game's walkable grid.
 */
export function drawStaticArenaFloor(
  colors: ArenaCssTokens,
  cols = ARENA_WIDTH,
  rows = ARENA_HEIGHT,
  tilePx = 64,
): HTMLCanvasElement | null {
  const tokens = rgbTokens(colors);
  if (!tokens) return null;
  const canvas = document.createElement('canvas');
  canvas.width = cols * tilePx;
  canvas.height = rows * tilePx;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const paint = arenaPaint(tokens);
  ctx.fillStyle = rgbHex(paint.colors.grout);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const inset = Math.max(1, Math.round(tilePx / 48));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * tilePx + inset;
      const y = row * tilePx + inset;
      const size = tilePx - inset * 2;
      ctx.fillStyle = rgbHex((col + row) % 2 === 0 ? paint.colors.tileA : paint.colors.tileB);
      ctx.fillRect(x, y, size, size);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = rgbHex(paint.highlight);
      ctx.fillRect(x, y, size, inset);
      ctx.fillRect(x, y, inset, size);
      ctx.fillStyle = rgbHex(paint.shadow);
      ctx.fillRect(x, y + size - inset, size, inset);
      ctx.fillRect(x + size - inset, y, inset, size);
      ctx.globalAlpha = 1;
    }
  }
  finishArenaCanvas(canvas, colors, cols, rows, tilePx);
  canvas.dataset.arena3d = 'false';
  canvas.dataset.accent = colors.accent;
  return canvas;
}

/**
 * A small flat picture of a board kit for the Raid Gate's picker, as a data URL
 * (or null with no canvas). The same two squares and the same marks the 3D board
 * lays, from the same `kitMarkOf` answer, in the same pack colours, so what is
 * picked is what is seen. Flat on purpose: it is a swatch, and the real board
 * is a 3D picture drawn once the garden is entered.
 */
export function drawKitSwatch(kit: BoardKitId, colors: ArenaCssTokens, cols = 8, rows = 3, tilePx = 16): string | null {
  const tokens = rgbTokens(colors);
  if (!tokens || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = cols * tilePx;
  canvas.height = rows * tilePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const paint = arenaPaint(tokens);
  // Eight wide, so the two rings of Lantern Inlay do not run into each other.
  const focus = [{ x: 1, y: 1 }, { x: cols - 2, y: 1 }];
  const gap = 1;
  ctx.fillStyle = rgbHex(paint.colors.grout);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * tilePx + gap;
      const y = row * tilePx + gap;
      const size = tilePx - gap * 2;
      ctx.fillStyle = rgbHex((col + row) % 2 === 0 ? paint.colors.tileA : paint.colors.tileB);
      ctx.fillRect(x, y, size, size);
      const mark = kitMarkOf(kit, col, row, focus);
      if (!mark) continue;
      ctx.fillStyle = rgbHex(paint.marks[mark]);
      if (mark === 'weave') {
        ctx.fillRect(x + size * 0.1, y + size * 0.43, size * 0.8, size * 0.14);
        ctx.fillRect(x + size * 0.43, y + size * 0.1, size * 0.14, size * 0.8);
      } else if (mark === 'inlay') {
        ctx.fillRect(x + size * 0.11, y + size * 0.11, size * 0.78, size * 0.78);
      } else {
        ctx.fillRect(x + size * 0.03, y + size * 0.03, size * 0.94, size * 0.94);
      }
    }
  }
  return canvas.toDataURL('image/png');
}
