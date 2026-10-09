import { ARENA_HEIGHT, ARENA_WIDTH } from '../../domain/rpg/arena';
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
  return canvas;
}
